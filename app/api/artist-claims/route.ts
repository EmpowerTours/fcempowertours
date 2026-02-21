import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem';

const MUSIC_SUBSCRIPTION = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

const SUBSCRIPTION_ABI = parseAbi([
  'function getCurrentMonthStats() external view returns (uint256 monthId, uint256 totalRevenue, uint256 totalPlays, bool finalized)',
  'function getArtistMonthlyStats(address artist, uint256 monthId) external view returns (uint256 playCount, uint256 payout, bool claimed)',
  'function monthlyStats(uint256 monthId) external view returns (uint256 totalRevenue, uint256 totalPlays, uint256 distributedAmount, bool finalized)',
  'function isArtistEligible(address artist) external view returns (bool eligible, uint256 masterCount, uint256 lifetimePlays)',
  'function artistToursClaimedMonth(uint256 monthId, address artist) external view returns (bool)',
]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
    }

    if (!MUSIC_SUBSCRIPTION) {
      return NextResponse.json({ error: 'Music subscription contract not configured' }, { status: 500 });
    }

    const { activeChain } = await import('@/app/chains');
    const client = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    const artistAddress = address.toLowerCase() as Address;

    // Get current month ID
    const currentMonthResult = await client.readContract({
      address: MUSIC_SUBSCRIPTION,
      abi: SUBSCRIPTION_ABI,
      functionName: 'getCurrentMonthStats',
    });
    const currentMonthId = Number(currentMonthResult[0]);

    // Check eligibility for TOURS
    let toursEligible = false;
    let masterCount = 0;
    let lifetimePlays = 0;
    try {
      const eligibility = await client.readContract({
        address: MUSIC_SUBSCRIPTION,
        abi: SUBSCRIPTION_ABI,
        functionName: 'isArtistEligible',
        args: [artistAddress],
      });
      toursEligible = eligibility[0];
      masterCount = Number(eligibility[1]);
      lifetimePlays = Number(eligibility[2]);
    } catch {
      // Contract may not have this data yet
    }

    // Check last 12 months for unclaimed payouts
    const unclaimedMonths: {
      monthId: number;
      playCount: number;
      estimatedPayout: string;
      toursClaimed: boolean;
    }[] = [];

    const checkPromises = [];
    for (let i = 0; i < 12; i++) {
      const monthId = currentMonthId - i;
      if (monthId < 0) break;
      checkPromises.push(
        (async () => {
          try {
            const [artistStats, monthStats] = await Promise.all([
              client.readContract({
                address: MUSIC_SUBSCRIPTION,
                abi: SUBSCRIPTION_ABI,
                functionName: 'getArtistMonthlyStats',
                args: [artistAddress, BigInt(monthId)],
              }),
              client.readContract({
                address: MUSIC_SUBSCRIPTION,
                abi: SUBSCRIPTION_ABI,
                functionName: 'monthlyStats',
                args: [BigInt(monthId)],
              }),
            ]);

            const playCount = Number(artistStats[0]);
            const claimed = artistStats[2];
            const finalized = monthStats[3];
            const distributedAmount = monthStats[2];
            const totalPlays = Number(monthStats[1]);

            // Only include months that are finalized, have plays, and haven't been claimed
            if (finalized && playCount > 0 && !claimed) {
              const estimatedPayout = totalPlays > 0
                ? (BigInt(playCount) * distributedAmount) / BigInt(totalPlays)
                : 0n;

              let toursClaimed = true;
              try {
                toursClaimed = await client.readContract({
                  address: MUSIC_SUBSCRIPTION,
                  abi: SUBSCRIPTION_ABI,
                  functionName: 'artistToursClaimedMonth',
                  args: [BigInt(monthId), artistAddress],
                }) as boolean;
              } catch {
                // Might not exist
              }

              unclaimedMonths.push({
                monthId,
                playCount,
                estimatedPayout: formatEther(estimatedPayout),
                toursClaimed,
              });
            }
          } catch {
            // Skip months that error (not initialized)
          }
        })()
      );
    }

    await Promise.all(checkPromises);

    // Sort by month ID descending
    unclaimedMonths.sort((a, b) => b.monthId - a.monthId);

    const totalUnclaimed = unclaimedMonths.reduce(
      (sum, m) => sum + parseFloat(m.estimatedPayout), 0
    );

    return NextResponse.json({
      currentMonthId,
      unclaimedMonths,
      totalUnclaimed: totalUnclaimed.toFixed(6),
      toursEligible,
      masterCount,
      lifetimePlays,
    });
  } catch (error: any) {
    console.error('[ArtistClaims] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch artist claims' },
      { status: 500 }
    );
  }
}
