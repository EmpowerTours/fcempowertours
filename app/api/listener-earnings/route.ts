import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import {
  computeListenerPoints,
  computeTotalPoints,
  estimatePayoutWei,
  expectedPoolFromRevenue,
  DISTRIBUTION_SNAPSHOT_KEY,
  LISTENER_STATS_KEY,
  type ListenerStatsShape,
} from "@/lib/listener-points";
import {
  createPublicClient,
  http,
  parseAbi,
  formatEther,
  type Address,
} from "viem";

/**
 * Listener Earnings API
 *
 * Shows a listener's WMON earnings from the 20% DAO reserve pool,
 * plus their TOURS rewards from radio listening.
 *
 * Data sources:
 * - Redis: live-radio listener stats (songs listened, streaks, pending TOURS)
 * - On-chain: ListenerRewardPool (WMON allocations and claims)
 * - On-chain: MusicSubscriptionV5 (total reserve balance)
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const LISTENER_REWARD_POOL = process.env
  .NEXT_PUBLIC_LISTENER_REWARD_POOL as Address;
const MUSIC_SUBSCRIPTION = process.env
  .NEXT_PUBLIC_MUSIC_SUBSCRIPTION as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";

const POOL_ABI = parseAbi([
  "function getListenerReward(uint256 monthId, address listener) external view returns (uint256 points, uint256 estimatedPayout, bool claimed)",
  "function getMonthlyPool(uint256 monthId) external view returns (uint256 totalWMON, uint256 totalListenPoints, uint256 listenerCount, bool finalized, bool funded)",
  "function getCurrentMonthId() external view returns (uint256)",
]);

const SUBSCRIPTION_ABI = parseAbi([
  "function getReserveBalance() external view returns (uint256)",
  "function getCurrentMonthStats() external view returns (uint256 monthId, uint256 totalRevenue, uint256 totalPlays, bool finalized)",
]);

interface ListenerStats {
  totalSongsListened: number;
  totalRewardsEarned: number;
  pendingRewards: number;
  lastListenDay: number;
  currentStreak: number;
  longestStreak: number;
  voiceNotesSubmitted: number;
  voiceNotesPlayed: number;
  firstListenerBonuses: number;
  lastRewardedSongId?: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "address parameter required" },
        { status: 400 },
      );
    }

    const listenerAddress = address.toLowerCase();

    // Fetch Redis listener stats
    const redisStats = await redis.hget<ListenerStats>(
      LISTENER_STATS_KEY,
      listenerAddress,
    );

    const stats: ListenerStats = redisStats || {
      totalSongsListened: 0,
      totalRewardsEarned: 0,
      pendingRewards: 0,
      lastListenDay: 0,
      currentStreak: 0,
      longestStreak: 0,
      voiceNotesSubmitted: 0,
      voiceNotesPlayed: 0,
      firstListenerBonuses: 0,
    };

    // Verified claim receipts (month -> txHash). Never fatal: a missing map
    // just means claimed months render without a Monadscan link.
    let claimTxByMonth: Record<string, string> = {};
    try {
      claimTxByMonth =
        (await redis.hgetall<Record<string, string>>(
          `listener-claim-tx:${listenerAddress}`,
        )) || {};
    } catch (e: any) {
      console.warn("[ListenerEarnings] claim-tx lookup failed:", e?.message);
    }

    // On-chain data
    const wmonEarnings = {
      totalClaimable: "0",
      totalClaimed: "0",
      currentReserveBalance: "0",
      months: [] as {
        monthId: number;
        points: number;
        estimatedPayout: string;
        claimed: boolean;
        poolTotal: string;
        totalListeners: number;
        finalized: boolean;
        txHash: string | null;
      }[],
    };

    const { activeChain } = await import("@/app/chains");
    const client = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    // Get reserve balance from MusicSubscriptionV5
    if (MUSIC_SUBSCRIPTION) {
      try {
        const reserveBalance = await client.readContract({
          address: MUSIC_SUBSCRIPTION,
          abi: SUBSCRIPTION_ABI,
          functionName: "getReserveBalance",
        });
        wmonEarnings.currentReserveBalance = formatEther(reserveBalance);
      } catch {
        // Contract may not be deployed yet
      }
    }

    // Get listener's WMON allocations from ListenerRewardPool
    if (LISTENER_REWARD_POOL) {
      try {
        const currentMonthId = await client.readContract({
          address: LISTENER_REWARD_POOL,
          abi: POOL_ABI,
          functionName: "getCurrentMonthId",
        });

        let totalClaimableWei = BigInt(0);
        let totalClaimedWei = BigInt(0);

        // Check last 12 months
        const monthChecks = [];
        for (let i = 0; i < 12; i++) {
          const monthId = Number(currentMonthId) - i;
          if (monthId < 0) break;
          monthChecks.push(
            (async () => {
              try {
                const [listenerReward, poolInfo] = await Promise.all([
                  client.readContract({
                    address: LISTENER_REWARD_POOL,
                    abi: POOL_ABI,
                    functionName: "getListenerReward",
                    args: [BigInt(monthId), listenerAddress as Address],
                  }),
                  client.readContract({
                    address: LISTENER_REWARD_POOL,
                    abi: POOL_ABI,
                    functionName: "getMonthlyPool",
                    args: [BigInt(monthId)],
                  }),
                ]);

                const [points, estimatedPayout, claimed] = listenerReward;
                const [totalWMON, , listenerCount, finalized, funded] =
                  poolInfo;

                if (Number(points) > 0 || (finalized && funded)) {
                  if (claimed) {
                    totalClaimedWei += estimatedPayout;
                  } else if (finalized && Number(points) > 0) {
                    totalClaimableWei += estimatedPayout;
                  }

                  wmonEarnings.months.push({
                    monthId,
                    points: Number(points),
                    estimatedPayout: formatEther(estimatedPayout),
                    claimed,
                    poolTotal: formatEther(totalWMON),
                    totalListeners: Number(listenerCount),
                    finalized,
                    // Present only for claims we hold a verified receipt for;
                    // the UI links it to Monadscan when it exists.
                    txHash: claimTxByMonth[String(monthId)] || null,
                  });
                }
              } catch {
                // Skip months that error
              }
            })(),
          );
        }

        await Promise.all(monthChecks);

        wmonEarnings.totalClaimable = formatEther(totalClaimableWei);
        wmonEarnings.totalClaimed = formatEther(totalClaimedWei);
        wmonEarnings.months.sort((a, b) => b.monthId - a.monthId);
      } catch {
        // ListenerRewardPool may not be deployed yet
      }
    }

    // ------------------------------------------------------------------
    // Pending estimate for the OPEN month.
    //
    // getReserveBalance() is 0 for the whole of an open month — the reserve is
    // only credited inside finalizeMonthlyDistribution — so the claim UI would
    // otherwise show a bare 0.000 WMON and read as broken. Estimate from live
    // revenue instead, using the same point maths the distribution cron uses.
    // ------------------------------------------------------------------
    let pending = {
      /** True while the current month is still open and unfunded. */
      accruing: false,
      monthId: 0,
      myPoints: 0,
      totalPoints: 0,
      /** 20% of revenue booked so far this month. */
      expectedPoolWMON: "0",
      /** Your pro-rata share of that pool at current counts. */
      estimatedWMON: "0",
      monthRevenueWMON: "0",
      note: "",
    };

    if (MUSIC_SUBSCRIPTION) {
      try {
        const [monthId, totalRevenue, , finalized] = await client.readContract({
          address: MUSIC_SUBSCRIPTION,
          abi: SUBSCRIPTION_ABI,
          functionName: "getCurrentMonthStats",
        });

        if (!finalized) {
          const [allStats, snapshot] = await Promise.all([
            redis.hgetall<Record<string, ListenerStatsShape>>(
              LISTENER_STATS_KEY,
            ),
            redis.hgetall<Record<string, number>>(DISTRIBUTION_SNAPSHOT_KEY),
          ]);

          const myPoints = computeListenerPoints(
            stats as ListenerStatsShape,
            Number(snapshot?.[listenerAddress] || 0),
          );
          const totalPoints = computeTotalPoints(allStats, snapshot);
          const pool = expectedPoolFromRevenue(totalRevenue);
          const estimate = estimatePayoutWei(pool, myPoints, totalPoints);

          pending = {
            accruing: true,
            monthId: Number(monthId),
            myPoints,
            totalPoints,
            expectedPoolWMON: formatEther(pool),
            estimatedWMON: formatEther(estimate),
            monthRevenueWMON: formatEther(totalRevenue),
            note: "Estimate only. The pool grows with new subscriptions and your share dilutes as others listen; it settles when the month closes.",
          };
        }
      } catch {
        // Leave `pending` at its default when the month cannot be read.
      }
    }

    return NextResponse.json({
      address: listenerAddress,
      // Not yet claimable — accruing for the open month.
      pending,
      // TOURS rewards (from radio listening)
      tours: {
        pendingRewards: stats.pendingRewards,
        totalRewardsEarned: stats.totalRewardsEarned,
        firstListenerBonuses: stats.firstListenerBonuses,
      },
      // WMON rewards (from 20% DAO reserve)
      wmon: wmonEarnings,
      // Listening activity
      activity: {
        totalSongsListened: stats.totalSongsListened,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        lastListenDay: stats.lastListenDay,
        voiceNotesSubmitted: stats.voiceNotesSubmitted,
        voiceNotesPlayed: stats.voiceNotesPlayed,
      },
    });
  } catch (error: any) {
    console.error("[ListenerEarnings] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch listener earnings" },
      { status: 500 },
    );
  }
}
