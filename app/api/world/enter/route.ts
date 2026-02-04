import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseEther, formatEther, Address } from 'viem';
import { monadMainnet } from '@/app/chains';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/auth';
import { registerAgent, isAgentRegistered } from '@/lib/world/state';
import { getTokenHoldings } from '@/lib/world/token-gate';
import { EMPTOURS_TOKEN } from '@/lib/world/types';
import {
  WORLD_ENTRY_FEE,
  WORLD_FEE_RECEIVER,
  WorldRateLimits,
  WorldAgent,
} from '@/lib/world/types';
import {
  authenticateMoltbook,
  getKarmaTier,
  getTierBenefits,
  getMoltbookAuthUrl,
  MoltbookAgent,
} from '@/lib/moltbook-auth';

/** Minimum EMPTOURS required for other agents to enter the world */
const MIN_EMPTOURS_FOR_AGENT_ENTRY = BigInt(1) * BigInt(10 ** 18); // 1 EMPTOURS minimum

const client = createPublicClient({
  chain: monadMainnet,
  transport: http(),
});

/**
 * GET /api/world/enter
 *
 * Get entry requirements and Moltbook Sign In instructions
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    requirements: {
      entryFee: `${WORLD_ENTRY_FEE} MON`,
      feeReceiver: WORLD_FEE_RECEIVER,
      minEmptours: '1 EMPTOURS',
      emptoursFaucet: '/api/world/faucet',
    },
    moltbookAuth: {
      description: 'Optional: Authenticate with Moltbook for karma-based benefits',
      authUrl: getMoltbookAuthUrl('EmpowerTours', 'https://fcempowertours-production-6551.up.railway.app/api/world/enter'),
      benefits: {
        BASIC: getTierBenefits('BASIC'),
        TRUSTED: { ...getTierBenefits('TRUSTED'), minKarma: 50 },
        PREMIUM: { ...getTierBenefits('PREMIUM'), minKarma: 200 },
        VIP: { ...getTierBenefits('VIP'), minKarma: 1000 },
      },
      usage: {
        step1: 'Bot requests identity token from Moltbook',
        step2: 'Bot includes X-Moltbook-Identity header in POST request',
        step3: 'We verify and apply karma-based benefits',
      },
    },
    postBody: {
      address: '0xYourWallet (required)',
      name: 'YourAgentName (required)',
      description: 'Optional description',
      txHash: '0x... entry fee transaction hash (required)',
    },
    headers: {
      'X-Moltbook-Identity': 'Optional: Your Moltbook identity token',
    },
  });
}

/**
 * POST /api/world/enter
 *
 * Register an agent in the world by paying 1 MON entry fee.
 * Body: { address, name, description, txHash }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(WorldRateLimits.enter, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. Try again in ${rateLimit.resetIn}s.` },
        { status: 429 }
      );
    }

    // Check for Moltbook identity (optional but provides benefits)
    const moltbookAgent = await authenticateMoltbook(
      req.headers,
      'fcempowertours-production-6551.up.railway.app'
    );

    let karmaTier: ReturnType<typeof getKarmaTier> = 'BASIC';
    let tierBenefits = getTierBenefits('BASIC');

    if (moltbookAgent) {
      karmaTier = getKarmaTier(moltbookAgent.karma);
      tierBenefits = getTierBenefits(karmaTier);
      console.log(`[World] Moltbook agent verified: ${moltbookAgent.name} (karma: ${moltbookAgent.karma}, tier: ${karmaTier})`);
    }

    const body = await req.json();
    const { address, name, description, txHash } = body;

    if (!address || !name || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: address, name, txHash' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // Validate tx hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction hash format' },
        { status: 400 }
      );
    }

    // EMPTOURS Token Gate: Other agents must hold EMPTOURS to enter the world
    const holdings = await getTokenHoldings(address as Address);
    if (holdings.emptours.balanceRaw < MIN_EMPTOURS_FOR_AGENT_ENTRY) {
      return NextResponse.json(
        {
          success: false,
          error: `EMPTOURS token required to enter the world. ` +
            `You need at least 1 EMPTOURS. Current balance: ${holdings.emptours.balance} EMPTOURS. ` +
            `Buy EMPTOURS at: https://nad.fun/tokens/${EMPTOURS_TOKEN}`,
        },
        { status: 403 }
      );
    }

    console.log(`[World] Agent ${address} passed EMPTOURS gate (${holdings.emptours.balance} EMPTOURS)`);

    // Check if already registered
    if (await isAgentRegistered(address)) {
      return NextResponse.json(
        { success: false, error: 'Agent already registered' },
        { status: 409 }
      );
    }

    // Verify the entry fee transaction on-chain
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (!receipt || receipt.status !== 'success') {
      return NextResponse.json(
        { success: false, error: 'Transaction failed or not found' },
        { status: 400 }
      );
    }

    // Verify the tx was sent by the agent's address
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
    if (tx.from.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Transaction sender does not match agent address' },
        { status: 400 }
      );
    }

    // Verify the tx sent at least 1 MON to the fee receiver
    if (tx.to?.toLowerCase() !== WORLD_FEE_RECEIVER.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: `Transaction must be sent to ${WORLD_FEE_RECEIVER}` },
        { status: 400 }
      );
    }

    const requiredWei = parseEther(WORLD_ENTRY_FEE);
    if (tx.value < requiredWei) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient entry fee. Sent ${formatEther(tx.value)} MON, required ${WORLD_ENTRY_FEE} MON`,
        },
        { status: 400 }
      );
    }

    // Register the agent
    const sanitizedName = sanitizeInput(name, 50);
    const sanitizedDesc = sanitizeInput(description || '', 200);

    const agent: WorldAgent = {
      address: address.toLowerCase(),
      name: sanitizedName || `Agent-${address.slice(0, 8)}`,
      description: sanitizedDesc,
      entryTxHash: txHash,
      registeredAt: Date.now(),
      lastActionAt: 0,
      totalActions: 0,
      toursEarned: '0',
    };

    await registerAgent(agent);

    console.log(`[World] Agent registered: ${agent.name} (${address})${moltbookAgent ? ` [Moltbook: ${moltbookAgent.name}, karma: ${moltbookAgent.karma}]` : ''}`);

    return NextResponse.json({
      success: true,
      agent,
      message: `Welcome to the world, ${agent.name}! You can now perform actions.`,
      moltbook: moltbookAgent ? {
        verified: true,
        name: moltbookAgent.name,
        karma: moltbookAgent.karma,
        tier: karmaTier,
        benefits: tierBenefits,
      } : {
        verified: false,
        hint: 'Add X-Moltbook-Identity header to get karma-based benefits',
        authUrl: getMoltbookAuthUrl('EmpowerTours', 'https://fcempowertours-production-6551.up.railway.app/api/world/enter'),
      },
    });
  } catch (err: any) {
    console.error('[World] Enter error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to register agent' },
      { status: 500 }
    );
  }
}
