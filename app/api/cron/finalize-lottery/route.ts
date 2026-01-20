import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { activeChain } from '@/app/chains';

const LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_LOTTERY_ADDRESS as `0x${string}`;
const PLATFORM_SAFE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`;

const LOTTERY_ABI = [
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'commitRandomness',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'revealWinner',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'canCommit',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'canReveal',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'currentRoundId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'getRound',
    outputs: [{
      components: [
        { name: 'roundId', type: 'uint256' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'prizePoolMon', type: 'uint256' },
        { name: 'prizePoolShMon', type: 'uint256' },
        { name: 'participantCount', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'commitBlock', type: 'uint256' },
        { name: 'commitHash', type: 'bytes32' },
        { name: 'winner', type: 'address' },
        { name: 'winnerIndex', type: 'uint256' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Lottery Finalization Cron (Backup)
 *
 * Runs every 6 hours to check if lottery needs finalization
 * Only acts if no one has manually finalized
 *
 * Add to Railway cron or call via external service:
 * GET /api/cron/finalize-lottery?key=KEEPER_SECRET
 */
export async function GET(req: NextRequest) {
  try {
    // Verify keeper secret
    const url = new URL(req.url);
    const providedKey = url.searchParams.get('key');
    const keeperSecret = process.env.KEEPER_SECRET;

    if (providedKey !== keeperSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[KEEPER] Checking lottery finalization...');

    // Create clients
    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(),
    });

    const account = privateKeyToAccount(PLATFORM_SAFE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: activeChain,
      transport: http(),
    });

    // Get current round ID
    const currentRoundId = await publicClient.readContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'currentRoundId',
    });

    console.log(`[KEEPER] Current round: ${currentRoundId}`);

    const actions: string[] = [];

    // Check if current round is finalized and needs rotation (V3 backup)
    const currentRound = await publicClient.readContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getRound',
      args: [currentRoundId],
    });

    // If current round is finalized and has passed endTime, force new round
    if (currentRound.status === 3 && currentRound.participantCount > 0n) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= Number(currentRound.endTime)) {
        console.log('[KEEPER] Current round finalized and expired, starting new round...');

        try {
          const forceNewRoundAbi = [
            {
              inputs: [],
              name: 'forceNewRound',
              outputs: [],
              stateMutability: 'nonpayable',
              type: 'function',
            }
          ] as const;

          const hash = await walletClient.writeContract({
            address: LOTTERY_ADDRESS,
            abi: forceNewRoundAbi,
            functionName: 'forceNewRound',
          });

          console.log(`[KEEPER] Force new round tx: ${hash}`);
          actions.push(`Started new round: ${hash}`);

          await publicClient.waitForTransactionReceipt({ hash });
        } catch (error) {
          console.log('[KEEPER] Could not force new round (may not be owner):', error);
        }
      }
    }

    // Check last 3 rounds for pending finalization
    for (let i = Number(currentRoundId); i > Math.max(0, Number(currentRoundId) - 3); i--) {
      const roundId = BigInt(i);

      // Get round info
      const round = await publicClient.readContract({
        address: LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getRound',
        args: [roundId],
      });

      // Skip if finalized or no participants
      if (round.status === 3 || round.participantCount === 0n) {
        continue;
      }

      console.log(`[KEEPER] Round ${i} status: ${round.status}, participants: ${round.participantCount}`);

      // Check if we can commit
      const canCommit = await publicClient.readContract({
        address: LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'canCommit',
        args: [roundId],
      });

      if (canCommit) {
        console.log(`[KEEPER] Committing round ${i}...`);

        const hash = await walletClient.writeContract({
          address: LOTTERY_ADDRESS,
          abi: LOTTERY_ABI,
          functionName: 'commitRandomness',
          args: [roundId],
        });

        console.log(`[KEEPER] Commit tx: ${hash}`);
        actions.push(`Committed round ${i}: ${hash}`);

        // Wait for confirmation
        await publicClient.waitForTransactionReceipt({ hash });
        continue;
      }

      // Check if we can reveal
      const canReveal = await publicClient.readContract({
        address: LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'canReveal',
        args: [roundId],
      });

      if (canReveal) {
        console.log(`[KEEPER] Revealing winner for round ${i}...`);

        const hash = await walletClient.writeContract({
          address: LOTTERY_ADDRESS,
          abi: LOTTERY_ABI,
          functionName: 'revealWinner',
          args: [roundId],
        });

        console.log(`[KEEPER] Reveal tx: ${hash}`);
        actions.push(`Revealed round ${i}: ${hash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Get winner info
        const finalizedRound = await publicClient.readContract({
          address: LOTTERY_ADDRESS,
          abi: LOTTERY_ABI,
          functionName: 'getRound',
          args: [roundId],
        });

        console.log(`[KEEPER] Winner: ${finalizedRound.winner}`);

        // TODO: Post to Farcaster
        try {
          await fetch(`${process.env.NEXT_PUBLIC_URL}/api/lottery/announce-winner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roundId: i,
              winner: finalizedRound.winner,
              prizePoolMon: finalizedRound.prizePoolMon.toString(),
              prizePoolShMon: finalizedRound.prizePoolShMon.toString(),
            }),
          });
        } catch (e) {
          console.log('[KEEPER] Could not announce winner:', e);
        }
      }
    }

    if (actions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending rounds to finalize',
        actions: [],
      });
    }

    return NextResponse.json({
      success: true,
      message: `Finalized ${actions.length} action(s)`,
      actions,
    });

  } catch (error: any) {
    console.error('[KEEPER] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
