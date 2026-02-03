import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, Address } from 'viem';
import { activeChain } from '@/app/chains';

const DAILY_LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_DAILY_LOTTERY as Address;

const client = createPublicClient({
  chain: activeChain,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

const LOTTERY_ABI = [
  {
    name: 'getCurrentRound',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'prizePool', type: 'uint256' },
      { name: 'ticketCount', type: 'uint256' },
      { name: 'timeRemaining', type: 'uint256' },
      { name: 'canDraw', type: 'bool' },
      { name: 'willRollover', type: 'bool' },
    ],
  },
] as const;

interface Bounty {
  id: string;
  name: string;
  description: string;
  reward: string;
  rewardToken: string;
  available: boolean;
  action: string;
  params: Record<string, any>;
  frequency: string;
  status: string;
}

/**
 * GET /api/world/bounties
 *
 * Returns available bounties/jobs that agents can execute for rewards.
 * Designed for Moltbook agent discovery and hiring.
 */
export async function GET(req: NextRequest) {
  try {
    const bounties: Bounty[] = [];

    // Bounty 1: Daily Lottery Draw Trigger
    if (DAILY_LOTTERY_ADDRESS) {
      try {
        const currentRound = await client.readContract({
          address: DAILY_LOTTERY_ADDRESS,
          abi: LOTTERY_ABI,
          functionName: 'getCurrentRound',
        });

        const [roundId, , , prizePool, ticketCount, timeRemaining, canDraw, willRollover] = currentRound;

        bounties.push({
          id: 'lottery_draw',
          name: 'Daily Lottery Draw Trigger',
          description: `Trigger the lottery draw for Round #${roundId}. Winner gets ${formatEther(prizePool * 9n / 10n)} WMON. You earn 5-50 TOURS.`,
          reward: '5-50',
          rewardToken: 'TOURS',
          available: canDraw,
          action: 'lottery_draw',
          params: {},
          frequency: 'Daily (24-hour rounds)',
          status: willRollover
            ? `Not enough entries yet (${ticketCount}/5 minimum)`
            : canDraw
              ? 'AVAILABLE NOW - First to trigger wins!'
              : `${Math.floor(Number(timeRemaining) / 3600)}h ${Math.floor((Number(timeRemaining) % 3600) / 60)}m until draw`,
        });
      } catch (lotteryErr) {
        console.error('[Bounties] Lottery check error:', lotteryErr);
      }
    }

    const availableCount = bounties.filter(b => b.available).length;

    return NextResponse.json({
      success: true,
      bounties,
      available: availableCount,
      total: bounties.length,
    });
  } catch (err: any) {
    console.error('[Bounties] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bounties' },
      { status: 500 }
    );
  }
}
