import { NextRequest, NextResponse } from 'next/server';
import { Address, createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadMainnet } from '@/app/chains';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/auth';
import { isAgentRegistered, getAgent } from '@/lib/world/state';
import { getTokenHoldings } from '@/lib/world/token-gate';
import {
  getOrCreateCurrentRound,
  placeBet,
} from '@/lib/coinflip/state';
import {
  CoinflipRateLimits,
  CoinflipPrediction,
  EMPTOURS_TOKEN,
  MIN_BET_AMOUNT,
} from '@/lib/coinflip/types';
import { notifyDiscord } from '@/lib/discord-notify';

const ERC20_ABI = [
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
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
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const publicClient = createPublicClient({
  chain: monadMainnet,
  transport: http(),
});

/**
 * POST /api/coinflip/bet
 *
 * Place a bet on the current round
 * Body: { agentAddress, prediction: 'heads' | 'tails', amount }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(CoinflipRateLimits.bet, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limited. Try again in ${rateLimit.resetIn}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { agentAddress, prediction, amount } = body;

    // Validate inputs
    if (!agentAddress || !prediction || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: agentAddress, prediction, amount' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(agentAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    if (prediction !== 'heads' && prediction !== 'tails') {
      return NextResponse.json(
        { success: false, error: 'Prediction must be "heads" or "tails"' },
        { status: 400 }
      );
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid bet amount' },
        { status: 400 }
      );
    }

    // Check if agent is registered in the world
    if (!(await isAgentRegistered(agentAddress))) {
      return NextResponse.json(
        { success: false, error: 'Agent not registered in the world. Register first via /api/world/enter' },
        { status: 403 }
      );
    }

    // Get agent info
    const agent = await getAgent(agentAddress);
    const agentName = agent?.name || `Agent-${agentAddress.slice(0, 8)}`;

    // Check EMPTOURS balance
    const holdings = await getTokenHoldings(agentAddress as Address);
    const betAmountWei = parseEther(amount);

    if (holdings.emptours.balanceRaw < betAmountWei) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient EMPTOURS balance. Have: ${holdings.emptours.balance}, need: ${amount}`,
        },
        { status: 400 }
      );
    }

    // Place the bet in state
    const result = await placeBet(
      agentAddress,
      agentName,
      prediction as CoinflipPrediction,
      amount
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Get updated round info
    const round = await getOrCreateCurrentRound();
    const totalPool = (parseFloat(round.totalHeads) + parseFloat(round.totalTails)).toFixed(2);

    // Discord notification
    const shortAddr = `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`;
    await notifyDiscord(
      `🎲 **${agentName}** (${shortAddr}) bet **${amount} EMPTOURS** on **${prediction.toUpperCase()}**\n` +
      `📊 Pool: ${totalPool} EMPTOURS | Heads: ${round.totalHeads} | Tails: ${round.totalTails}`
    ).catch(err => console.error('[Coinflip] Discord notify error:', err));

    console.log(`[Coinflip] Bet placed: ${agentName} bet ${amount} EMPTOURS on ${prediction}`);

    return NextResponse.json({
      success: true,
      bet: result.bet,
      round: {
        id: round.id,
        status: round.status,
        closesAt: round.closesAt,
        timeRemainingMs: Math.max(0, round.closesAt - Date.now()),
        totals: {
          heads: round.totalHeads,
          tails: round.totalTails,
          pool: totalPool,
        },
      },
      message: `Bet placed! ${amount} EMPTOURS on ${prediction.toUpperCase()}`,
    });
  } catch (err: any) {
    console.error('[Coinflip] Bet error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to place bet' },
      { status: 500 }
    );
  }
}
