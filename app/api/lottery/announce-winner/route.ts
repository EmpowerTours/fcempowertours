import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, Address } from 'viem';
import { activeChain } from '@/app/chains';

const DAILY_LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_DAILY_LOTTERY as Address;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_SIGNER_UUID = process.env.NEYNAR_SIGNER_UUID;

const client = createPublicClient({
  chain: activeChain,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

const LOTTERY_ABI = [
  {
    name: 'getRound',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'roundId', type: 'uint256' }],
    outputs: [
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'prizePool', type: 'uint256' },
      { name: 'ticketCount', type: 'uint256' },
      { name: 'winner', type: 'address' },
      { name: 'winnerFid', type: 'uint256' },
      { name: 'winnerPrize', type: 'uint256' },
      { name: 'winnerToursBonus', type: 'uint256' },
      { name: 'resolved', type: 'bool' },
      { name: 'rolledOver', type: 'bool' },
    ],
  },
] as const;

export async function POST(req: NextRequest) {
  try {
    const { roundId } = await req.json();

    if (!roundId) {
      return NextResponse.json(
        { success: false, error: 'Missing roundId' },
        { status: 400 }
      );
    }

    if (!DAILY_LOTTERY_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'Daily lottery not configured' },
        { status: 500 }
      );
    }

    // Get round data
    const roundData = await client.readContract({
      address: DAILY_LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getRound',
      args: [BigInt(roundId)],
    });

    const [
      startTime,
      endTime,
      prizePool,
      ticketCount,
      winner,
      winnerFid,
      winnerPrize,
      winnerToursBonus,
      resolved,
      rolledOver,
    ] = roundData;

    if (!resolved) {
      return NextResponse.json(
        { success: false, error: 'Round not resolved yet' },
        { status: 400 }
      );
    }

    if (rolledOver) {
      return NextResponse.json({
        success: true,
        message: 'Round rolled over - no winner to announce',
        roundId,
        rolledOver: true,
      });
    }

    // Format announcement
    const prizeAmount = formatEther(winnerPrize);
    const toursBonus = formatEther(winnerToursBonus);
    const fid = Number(winnerFid);

    let announcement = `Daily Lottery Round #${roundId} Winner!\n\n`;

    if (fid > 0) {
      announcement += `Congratulations @!${fid}!\n`;
    } else {
      announcement += `Winner: ${winner.slice(0, 6)}...${winner.slice(-4)}\n`;
    }

    announcement += `Prize: ${prizeAmount} WMON`;
    if (parseFloat(toursBonus) > 0) {
      announcement += ` + ${toursBonus} TOURS bonus`;
    }
    announcement += `\n\nTotal entries: ${ticketCount}`;
    announcement += `\n\nPlay daily at empowertours.com/lottery`;

    console.log('[Lottery] Announcement:', announcement);

    // Post to Farcaster if configured
    if (NEYNAR_API_KEY && NEYNAR_SIGNER_UUID) {
      try {
        const castResponse = await fetch('https://api.neynar.com/v2/farcaster/cast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api_key': NEYNAR_API_KEY,
          },
          body: JSON.stringify({
            signer_uuid: NEYNAR_SIGNER_UUID,
            text: announcement,
          }),
        });

        if (castResponse.ok) {
          const castData = await castResponse.json();
          console.log('[Lottery] Cast posted:', castData.cast?.hash);

          return NextResponse.json({
            success: true,
            message: 'Winner announced on Farcaster',
            roundId,
            winner,
            winnerFid: fid,
            prize: prizeAmount,
            toursBonus,
            castHash: castData.cast?.hash,
          });
        } else {
          console.error('[Lottery] Failed to post cast:', await castResponse.text());
        }
      } catch (castError) {
        console.error('[Lottery] Cast error:', castError);
      }
    }

    // Return success even if cast failed
    return NextResponse.json({
      success: true,
      message: 'Winner data retrieved (Farcaster not configured)',
      roundId,
      winner,
      winnerFid: fid,
      prize: prizeAmount,
      toursBonus,
      announcement,
    });
  } catch (error: any) {
    console.error('[Lottery] Announce error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to announce winner' },
      { status: 500 }
    );
  }
}
