import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem';

/**
 * Listener Claims API
 *
 * Returns claimable WMON amounts per month for a listener address.
 * Mirrors the artist-claims pattern but for the 20% DAO reserve → listener pool.
 *
 * GET /api/listener-claims?address=0x...
 */

const LISTENER_REWARD_POOL = process.env.NEXT_PUBLIC_LISTENER_REWARD_POOL as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

const POOL_ABI = parseAbi([
  'function getListenerReward(uint256 monthId, address listener) external view returns (uint256 points, uint256 estimatedPayout, bool claimed)',
  'function getMonthlyPool(uint256 monthId) external view returns (uint256 totalWMON, uint256 totalListenPoints, uint256 listenerCount, bool finalized, bool funded)',
  'function getCurrentMonthId() external view returns (uint256)',
]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
    }

    if (!LISTENER_REWARD_POOL) {
      return NextResponse.json({ error: 'Listener reward pool not configured' }, { status: 500 });
    }

    const { activeChain } = await import('@/app/chains');
    const client = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    const listenerAddress = address.toLowerCase() as Address;

    const currentMonthId = await client.readContract({
      address: LISTENER_REWARD_POOL,
      abi: POOL_ABI,
      functionName: 'getCurrentMonthId',
    });

    const unclaimedMonths: {
      monthId: number;
      points: number;
      estimatedPayout: string;
      poolTotal: string;
      totalListenPoints: number;
      listenerCount: number;
    }[] = [];

    const claimedMonths: {
      monthId: number;
      points: number;
      payout: string;
    }[] = [];

    // Check last 12 months
    const checks = [];
    for (let i = 0; i < 12; i++) {
      const monthId = Number(currentMonthId) - i;
      if (monthId < 0) break;

      checks.push(
        (async () => {
          try {
            const [listenerReward, poolInfo] = await Promise.all([
              client.readContract({
                address: LISTENER_REWARD_POOL,
                abi: POOL_ABI,
                functionName: 'getListenerReward',
                args: [BigInt(monthId), listenerAddress],
              }),
              client.readContract({
                address: LISTENER_REWARD_POOL,
                abi: POOL_ABI,
                functionName: 'getMonthlyPool',
                args: [BigInt(monthId)],
              }),
            ]);

            const [points, estimatedPayout, claimed] = listenerReward;
            const [totalWMON, totalListenPoints, listenerCount, finalized] = poolInfo;

            if (Number(points) === 0) return;

            if (claimed) {
              claimedMonths.push({
                monthId,
                points: Number(points),
                payout: formatEther(estimatedPayout),
              });
            } else if (finalized) {
              unclaimedMonths.push({
                monthId,
                points: Number(points),
                estimatedPayout: formatEther(estimatedPayout),
                poolTotal: formatEther(totalWMON),
                totalListenPoints: Number(totalListenPoints),
                listenerCount: Number(listenerCount),
              });
            }
          } catch {
            // Skip months that error
          }
        })()
      );
    }

    await Promise.all(checks);

    unclaimedMonths.sort((a, b) => b.monthId - a.monthId);
    claimedMonths.sort((a, b) => b.monthId - a.monthId);

    const totalUnclaimed = unclaimedMonths.reduce(
      (sum, m) => sum + parseFloat(m.estimatedPayout), 0
    );
    const totalClaimed = claimedMonths.reduce(
      (sum, m) => sum + parseFloat(m.payout), 0
    );

    return NextResponse.json({
      currentMonthId: Number(currentMonthId),
      unclaimedMonths,
      claimedMonths,
      totalUnclaimed: totalUnclaimed.toFixed(6),
      totalClaimed: totalClaimed.toFixed(6),
      // Contract info for frontend claim TX
      poolContract: LISTENER_REWARD_POOL,
      claimFunction: 'batchClaimRewards(uint256[])',
      unclaimedMonthIds: unclaimedMonths.map(m => m.monthId),
    });
  } catch (error: any) {
    console.error('[ListenerClaims] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch listener claims' },
      { status: 500 }
    );
  }
}
