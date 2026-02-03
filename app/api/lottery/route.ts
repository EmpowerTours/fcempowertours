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
  {
    name: 'getUserTickets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getRecentWinners',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'roundId', type: 'uint256' },
          { name: 'winner', type: 'address' },
          { name: 'winnerFid', type: 'uint256' },
          { name: 'prize', type: 'uint256' },
          { name: 'toursBonus', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'totalEntries', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getEntropyFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'ticketPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'minEntries',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getPotentialWinnerPrize',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export async function GET(req: NextRequest) {
  try {
    if (!DAILY_LOTTERY_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'Daily lottery not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const user = searchParams.get('user') as Address | null;
    const winners = searchParams.get('winners');

    // Get current round info
    const [
      currentRound,
      ticketPrice,
      minEntries,
      potentialPrize,
      entropyFee,
    ] = await Promise.all([
      client.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getCurrentRound',
      }),
      client.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'ticketPrice',
      }),
      client.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'minEntries',
      }),
      client.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getPotentialWinnerPrize',
      }),
      client.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getEntropyFee',
      }),
    ]);

    const [roundId, startTime, endTime, prizePool, ticketCount, timeRemaining, canDraw, willRollover] = currentRound;

    const response: any = {
      success: true,
      currentRound: {
        roundId: Number(roundId),
        startTime: Number(startTime),
        endTime: Number(endTime),
        prizePool: formatEther(prizePool),
        prizePoolWei: prizePool.toString(),
        ticketCount: Number(ticketCount),
        timeRemaining: Number(timeRemaining),
        canDraw,
        willRollover,
        potentialWinnerPrize: formatEther(potentialPrize),
      },
      config: {
        ticketPrice: formatEther(ticketPrice),
        ticketPriceWei: ticketPrice.toString(),
        minEntries: Number(minEntries),
        entropyFee: formatEther(entropyFee),
        contractAddress: DAILY_LOTTERY_ADDRESS,
      },
    };

    // Get user tickets if address provided
    if (user) {
      const userTickets = await client.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getUserTickets',
        args: [user],
      });
      response.userTickets = Number(userTickets);
    }

    // Get recent winners if requested
    if (winners) {
      const count = Math.min(parseInt(winners) || 5, 10);
      const recentWinners = await client.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getRecentWinners',
        args: [BigInt(count)],
      });

      response.recentWinners = recentWinners.map((w: any) => ({
        roundId: Number(w.roundId),
        winner: w.winner,
        winnerFid: Number(w.winnerFid),
        prize: formatEther(w.prize),
        toursBonus: formatEther(w.toursBonus),
        timestamp: Number(w.timestamp),
        totalEntries: Number(w.totalEntries),
      }));
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Lottery] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lottery data' },
      { status: 500 }
    );
  }
}
