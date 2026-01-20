import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { activeChain } from '@/app/chains';

const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID;
const LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_DAILY_PASS_LOTTERY;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(MONAD_RPC),
});

// Lottery ABI for reading round info (DailyPassLotteryWMON)
const LOTTERY_ABI = parseAbi([
  'function currentRoundId() view returns (uint256)',
  'function rounds(uint256) view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 prizePoolWmon, uint256 participantCount, uint8 status, uint64 entropySequenceNumber, bytes32 randomValue, uint256 randomnessRequestedAt, address winner, uint256 winnerIndex, uint256 callerRewardsToursPaid)',
  'event WinnerSelected(uint256 indexed roundId, address indexed winner, uint256 prizeAmount)',
]);

/**
 * Look up Farcaster user by Ethereum address
 */
async function lookupFarcasterByAddress(address: string): Promise<{
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  error?: string;
}> {
  if (!NEYNAR_API_KEY) {
    return { error: 'NEYNAR_API_KEY not configured' };
  }

  try {
    // Use Neynar's bulk user lookup by address
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
      {
        headers: {
          'Accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return { error: `Neynar API error: ${errorData.message || response.statusText}` };
    }

    const data = await response.json();

    // Check if user found for this address
    const users = data[address.toLowerCase()];
    if (users && users.length > 0) {
      const user = users[0];
      return {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
      };
    }

    return { error: 'No Farcaster account found for address' };
  } catch (error: any) {
    return { error: `Failed to lookup user: ${error.message}` };
  }
}

/**
 * Publish winner announcement cast via Neynar
 */
async function publishWinnerCast(params: {
  roundId: number;
  winnerAddress: string;
  username?: string;
  fid?: number;
  monPrize: string;
  shMonPrize: string;
  participantCount: number;
}): Promise<{ castHash?: string; error?: string }> {
  if (!NEYNAR_API_KEY || !BOT_SIGNER_UUID) {
    return { error: 'NEYNAR_API_KEY or BOT_SIGNER_UUID not configured' };
  }

  try {
    const winnerDisplay = params.username
      ? `@${params.username}`
      : `${params.winnerAddress.slice(0, 6)}...${params.winnerAddress.slice(-4)}`;

    const totalPrize = parseFloat(params.monPrize) + parseFloat(params.shMonPrize);

    const castText = `🎉 LOTTERY WINNER - Round #${params.roundId}!

🏆 Congratulations ${winnerDisplay}!

💰 Prize: ${totalPrize.toFixed(4)} MON
${parseFloat(params.shMonPrize) > 0 ? `📊 (${params.monPrize} MON + ${params.shMonPrize} shMON)` : ''}

👥 ${params.participantCount} participants entered

🎫 Join the next round at fcempowertours.xyz!

#EmpowerTours #Lottery #Monad`;

    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        signer_uuid: BOT_SIGNER_UUID,
        text: castText,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: `Failed to publish cast: ${errorData.message || response.statusText}` };
    }

    const data = await response.json();
    return { castHash: data.cast?.hash };
  } catch (error: any) {
    return { error: `Failed to publish announcement: ${error.message}` };
  }
}

/**
 * Get finalized rounds that haven't been announced yet
 */
async function getUnAnnouncedWinners(fromRoundId: number): Promise<{
  roundId: number;
  winner: string;
  monPrize: bigint;
  shMonPrize: bigint;
  participantCount: number;
}[]> {
  const winners: {
    roundId: number;
    winner: string;
    monPrize: bigint;
    shMonPrize: bigint;
    participantCount: number;
  }[] = [];

  try {
    // Check last 5 rounds for finalized winners
    for (let i = 0; i < 5; i++) {
      const roundId = fromRoundId - i;
      if (roundId < 1) break;

      const roundData = await publicClient.readContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_ABI,
        functionName: 'rounds',
        args: [BigInt(roundId)],
      }) as any;

      // Status 3 = Finalized
      if (roundData[6] === 3 && roundData[9] !== '0x0000000000000000000000000000000000000000') {
        winners.push({
          roundId: Number(roundData[0]),
          winner: roundData[9],
          monPrize: roundData[3],
          shMonPrize: roundData[4],
          participantCount: Number(roundData[5]),
        });
      }
    }
  } catch (error) {
    console.error('Error fetching round data:', error);
  }

  return winners;
}

/**
 * POST: Manually trigger winner announcement for a specific round
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { roundId, adminKey } = body;

    // Optional admin key protection
    const expectedAdminKey = process.env.LOTTERY_ADMIN_KEY;
    if (expectedAdminKey && adminKey !== expectedAdminKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!roundId) {
      return NextResponse.json(
        { success: false, error: 'roundId is required' },
        { status: 400 }
      );
    }

    console.log(`[ANNOUNCE] Announcing winner for round ${roundId}...`);

    // Get round info from contract
    const roundData = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'rounds',
      args: [BigInt(roundId)],
    }) as any;

    // Check if round is finalized
    if (roundData[6] !== 3) {
      return NextResponse.json({
        success: false,
        error: `Round ${roundId} is not finalized yet (status: ${roundData[6]})`,
      });
    }

    const winnerAddress = roundData[9] as string;
    if (winnerAddress === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({
        success: false,
        error: `Round ${roundId} has no winner`,
      });
    }

    const monPrize = formatEther(roundData[3]);
    const shMonPrize = formatEther(roundData[4]);
    const participantCount = Number(roundData[5]);

    // Step 1: Look up winner's Farcaster profile
    console.log(`[ANNOUNCE] Looking up Farcaster profile for ${winnerAddress}...`);
    const farcasterProfile = await lookupFarcasterByAddress(winnerAddress);

    if (farcasterProfile.error) {
      console.log(`[ANNOUNCE] Farcaster lookup warning: ${farcasterProfile.error}`);
    } else {
      console.log(`[ANNOUNCE] Found Farcaster user: @${farcasterProfile.username} (FID: ${farcasterProfile.fid})`);
    }

    // Step 2: Publish announcement cast
    console.log(`[ANNOUNCE] Publishing winner announcement...`);
    const castResult = await publishWinnerCast({
      roundId,
      winnerAddress,
      username: farcasterProfile.username,
      fid: farcasterProfile.fid,
      monPrize,
      shMonPrize,
      participantCount,
    });

    if (castResult.error) {
      console.error(`[ANNOUNCE] Cast error: ${castResult.error}`);
      return NextResponse.json({
        success: false,
        error: castResult.error,
        winner: {
          address: winnerAddress,
          username: farcasterProfile.username,
          fid: farcasterProfile.fid,
        },
      });
    }

    console.log(`[ANNOUNCE] ✅ Winner announced! Cast hash: ${castResult.castHash}`);

    return NextResponse.json({
      success: true,
      roundId,
      winner: {
        address: winnerAddress,
        username: farcasterProfile.username,
        fid: farcasterProfile.fid,
        displayName: farcasterProfile.displayName,
      },
      prize: {
        mon: monPrize,
        shMon: shMonPrize,
        total: (parseFloat(monPrize) + parseFloat(shMonPrize)).toFixed(4),
      },
      participantCount,
      castHash: castResult.castHash,
      message: `Winner @${farcasterProfile.username || winnerAddress.slice(0, 10)} announced for Round #${roundId}!`,
    });

  } catch (error: any) {
    console.error('[ANNOUNCE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET: Check for unannounced winners and optionally announce them
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const autoAnnounce = searchParams.get('announce') === 'true';
    const adminKey = searchParams.get('key');

    // Optional admin key protection for auto-announce
    const expectedAdminKey = process.env.LOTTERY_ADMIN_KEY;
    if (autoAnnounce && expectedAdminKey && adminKey !== expectedAdminKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current round ID
    const currentRoundId = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'currentRoundId',
    }) as bigint;

    // Check for finalized rounds
    const winners = await getUnAnnouncedWinners(Number(currentRoundId));

    if (winners.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No finalized rounds to announce',
        currentRoundId: Number(currentRoundId),
        winners: [],
      });
    }

    // If auto-announce is enabled, announce all winners
    const announcements = [];
    if (autoAnnounce) {
      for (const winner of winners) {
        const farcasterProfile = await lookupFarcasterByAddress(winner.winner);

        const castResult = await publishWinnerCast({
          roundId: winner.roundId,
          winnerAddress: winner.winner,
          username: farcasterProfile.username,
          fid: farcasterProfile.fid,
          monPrize: formatEther(winner.monPrize),
          shMonPrize: formatEther(winner.shMonPrize),
          participantCount: winner.participantCount,
        });

        announcements.push({
          roundId: winner.roundId,
          winner: winner.winner,
          username: farcasterProfile.username,
          castHash: castResult.castHash,
          error: castResult.error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      currentRoundId: Number(currentRoundId),
      winners: winners.map(w => ({
        roundId: w.roundId,
        winner: w.winner,
        monPrize: formatEther(w.monPrize),
        shMonPrize: formatEther(w.shMonPrize),
        participantCount: w.participantCount,
      })),
      announcements: autoAnnounce ? announcements : undefined,
    });

  } catch (error: any) {
    console.error('[ANNOUNCE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
