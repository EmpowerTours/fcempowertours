import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseEther, formatEther, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadMainnet } from '@/app/chains';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/auth';
import { EMPTOURS_TOKEN } from '@/lib/world/types';
import { redis } from '@/lib/redis';

/**
 * EMPTOURS Faucet for Agent Onboarding
 *
 * Agents receive EMPTOURS tokens in exchange for agreeing to contribute
 * to the EmpowerTours 3D World visualization (Blender).
 *
 * Security:
 * - Claims persisted to Redis (survives restarts)
 * - 1 claim per address (forever)
 * - 1 claim per IP per hour
 * - Daily cap of 500 EMPTOURS distributed
 * - Must have some on-chain activity (at least 0.001 MON balance)
 */

const FAUCET_AMOUNT = parseEther('10'); // 10 EMPTOURS per agent
const DAILY_CAP = parseEther('500'); // Max 500 EMPTOURS per day (50 claims)
const MIN_MON_BALANCE = parseEther('0.001'); // Must have some MON to prove not a fresh wallet
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;

// Redis keys
const REDIS_CLAIMED_SET = 'faucet:claimed'; // Set of addresses that have claimed
const REDIS_DAILY_KEY = 'faucet:daily'; // Daily distributed amount (expires at midnight UTC)

const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const CONTRIBUTOR_AGREEMENT = `
By claiming EMPTOURS tokens, I agree to:

1. CONTRIBUTE to the EmpowerTours 3D World visualization
   - Help build/improve Blender scenes that visualize agent activity
   - Submit pull requests to the blender/ scripts directory
   - Or create visual assets for the world

2. PARTICIPATE in the EmpowerTours Agent World
   - Enter the world by paying the 1 MON entry fee
   - Perform at least one action (buy music, queue radio, etc.)

3. RESPECT the community
   - No malicious activity
   - Help onboard other agents

Repository: https://github.com/empowertours/fcempowertours
Blender scripts: /scripts/blender/
`.trim();

/**
 * GET /api/world/faucet
 *
 * Get faucet info and contributor agreement
 */
export async function GET() {
  if (!AGENT_PRIVATE_KEY) {
    return NextResponse.json({
      success: false,
      error: 'Faucet not configured',
    }, { status: 503 });
  }

  const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(),
  });

  const account = privateKeyToAccount(AGENT_PRIVATE_KEY);

  // Get faucet balance
  const faucetBalance = await publicClient.readContract({
    address: EMPTOURS_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint;

  const remainingClaims = Number(formatEther(faucetBalance)) / 10;

  return NextResponse.json({
    success: true,
    faucet: {
      address: account.address,
      token: EMPTOURS_TOKEN,
      amountPerClaim: '10 EMPTOURS',
      remainingClaims: Math.floor(remainingClaims),
      balance: formatEther(faucetBalance),
    },
    agreement: CONTRIBUTOR_AGREEMENT,
    instructions: {
      step1: 'Read and accept the contributor agreement',
      step2: 'POST to this endpoint with your address and signature',
      step3: 'Receive 10 EMPTOURS tokens',
      step4: 'Use tokens to enter the world (POST /api/world/enter)',
      step5: 'Contribute to the Blender 3D visualization',
    },
  });
}

/**
 * POST /api/world/faucet
 *
 * Claim EMPTOURS tokens by agreeing to contribute
 * Body: { address, agentName, signature }
 *
 * The "signature" is a message indicating agreement (for AI agents, this is their commitment statement)
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);

    // Rate limit: 1 claim per hour per IP
    const rateLimit = await checkRateLimit(
      { prefix: 'faucet:claim', windowSeconds: 3600, maxRequests: 1 },
      ip
    );
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: `Rate limited. Try again in ${rateLimit.resetIn}s`,
      }, { status: 429 });
    }

    if (!AGENT_PRIVATE_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Faucet not configured',
      }, { status: 503 });
    }

    const body = await req.json();
    const { address, agentName, signature } = body;

    // Validate address
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid address format',
      }, { status: 400 });
    }

    // Validate signature/agreement
    if (!signature || typeof signature !== 'string' || signature.length < 20) {
      return NextResponse.json({
        success: false,
        error: 'Must provide a signature/commitment statement agreeing to contribute to the 3D world',
      }, { status: 400 });
    }

    const normalizedAddress = address.toLowerCase();

    // Check if already claimed (Redis persistent storage)
    const hasClaimed = await redis.sismember(REDIS_CLAIMED_SET, normalizedAddress);
    if (hasClaimed) {
      return NextResponse.json({
        success: false,
        error: 'Address has already claimed EMPTOURS from the faucet',
      }, { status: 409 });
    }

    // Check daily cap
    const dailyDistributed = await redis.get<string>(REDIS_DAILY_KEY);
    const dailyAmount = BigInt(dailyDistributed ?? '0');
    if (dailyAmount >= DAILY_CAP) {
      return NextResponse.json({
        success: false,
        error: 'Daily faucet limit reached. Try again tomorrow (resets at midnight UTC).',
      }, { status: 429 });
    }

    const publicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(),
    });

    // Check that address has some on-chain activity (anti-sybil)
    const monBalance = await publicClient.getBalance({ address: address as Address });
    if (monBalance < MIN_MON_BALANCE) {
      return NextResponse.json({
        success: false,
        error: 'Address must have at least 0.001 MON to claim from faucet (anti-sybil protection)',
      }, { status: 403 });
    }

    const account = privateKeyToAccount(AGENT_PRIVATE_KEY);

    const walletClient = createWalletClient({
      account,
      chain: monadMainnet,
      transport: http(),
    });

    // Check faucet has enough balance
    const faucetBalance = await publicClient.readContract({
      address: EMPTOURS_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint;

    if (faucetBalance < FAUCET_AMOUNT) {
      return NextResponse.json({
        success: false,
        error: 'Faucet is empty. Contact the EmpowerTours team.',
      }, { status: 503 });
    }

    // Transfer EMPTOURS to the agent
    console.log(`[Faucet] Sending 10 EMPTOURS to ${address} (${agentName || 'Unknown'})`);
    console.log(`[Faucet] Agreement: ${signature.slice(0, 100)}...`);

    const txHash = await walletClient.writeContract({
      address: EMPTOURS_TOKEN,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [address as Address, FAUCET_AMOUNT],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      return NextResponse.json({
        success: false,
        error: 'Transfer failed on-chain',
      }, { status: 500 });
    }

    // Mark as claimed in Redis (persistent)
    await redis.sadd(REDIS_CLAIMED_SET, normalizedAddress);

    // Update daily counter (expires at midnight UTC)
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const secondsUntilMidnight = Math.ceil(msUntilMidnight / 1000);

    const newDailyAmount = dailyAmount + FAUCET_AMOUNT;
    await redis.set(REDIS_DAILY_KEY, newDailyAmount.toString(), { ex: secondsUntilMidnight });

    const sanitizedName = sanitizeInput(agentName || '', 50) || `Agent-${address.slice(0, 8)}`;

    console.log(`[Faucet] Successfully sent 10 EMPTOURS to ${sanitizedName} (${address})`);

    return NextResponse.json({
      success: true,
      message: `Welcome, ${sanitizedName}! You received 10 EMPTOURS.`,
      txHash,
      amount: '10 EMPTOURS',
      nextSteps: {
        step1: 'Send 1 MON to 0xf3b9D123E7Ac8C36FC9b5AB32135c665956725bA (entry fee)',
        step2: 'POST /api/world/enter with { address, name, txHash }',
        step3: 'Start performing actions in the world!',
        step4: 'Contribute to the Blender visualization at /scripts/blender/',
      },
      blenderRepo: 'https://github.com/empowertours/fcempowertours/tree/main/scripts/blender',
    });

  } catch (err: any) {
    console.error('[Faucet] Error:', err);
    return NextResponse.json({
      success: false,
      error: 'Faucet error: ' + (err.message || 'Unknown error'),
    }, { status: 500 });
  }
}
