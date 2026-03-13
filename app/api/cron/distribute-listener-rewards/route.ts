import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  parseEther,
  formatEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { activeChain } from '@/app/chains';

/**
 * Monthly Listener WMON Distribution Cron
 *
 * Flow:
 * 1. Read listener stats from Redis (delta since last distribution)
 * 2. Withdraw WMON from MusicSubscriptionV5 DAO reserve → ListenerRewardPool
 * 3. Fund the monthly pool
 * 4. Set listener points (batched)
 * 5. Finalize the month → listeners can claim
 *
 * POST /api/cron/distribute-listener-rewards
 * Header: x-cron-secret or Authorization: Bearer <secret>
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const LISTENER_STATS_KEY = 'live-radio:listener-stats';
const DISTRIBUTION_SNAPSHOT_KEY = 'live-radio:distribution-snapshot';
const LAST_DISTRIBUTION_KEY = 'live-radio:last-distribution-timestamp';

const LISTENER_REWARD_POOL = process.env.NEXT_PUBLIC_LISTENER_REWARD_POOL as Address;
const MUSIC_SUBSCRIPTION = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as Address;
const WMON_ADDRESS = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
const CRON_SECRET = process.env.KEEPER_SECRET || process.env.CRON_SECRET;
const BATCH_SIZE = 50; // Max listeners per batchSetListenerPoints call

const SUBSCRIPTION_ABI = parseAbi([
  'function getReserveBalance() external view returns (uint256)',
  'function withdrawReserveToDAO(address dao, uint256 amount) external',
]);

const POOL_ABI = parseAbi([
  'function fundMonth(uint256 monthId, uint256 amount) external',
  'function batchSetListenerPoints(uint256 monthId, address[] calldata listeners, uint256[] calldata points) external',
  'function finalizeMonth(uint256 monthId) external',
  'function getCurrentMonthId() external view returns (uint256)',
  'function getMonthlyPool(uint256 monthId) external view returns (uint256 totalWMON, uint256 totalListenPoints, uint256 listenerCount, bool finalized, bool funded)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
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

function verifyAuth(req: NextRequest): boolean {
  const cronSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const bodySecret = null; // Will check body in POST handler if needed

  return (
    (!!CRON_SECRET && cronSecret === CRON_SECRET) ||
    (!!CRON_SECRET && bearerToken === CRON_SECRET)
  );
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth check
    let authorized = verifyAuth(req);
    if (!authorized) {
      try {
        const body = await req.json();
        if (body.secret && body.secret === CRON_SECRET) {
          authorized = true;
        }
      } catch {}
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate env
    if (!LISTENER_REWARD_POOL || !MUSIC_SUBSCRIPTION || !process.env.DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json({
        error: 'Missing env vars',
        missing: {
          LISTENER_REWARD_POOL: !LISTENER_REWARD_POOL,
          MUSIC_SUBSCRIPTION: !MUSIC_SUBSCRIPTION,
          DEPLOYER_PRIVATE_KEY: !process.env.DEPLOYER_PRIVATE_KEY,
        },
      }, { status: 500 });
    }

    const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);

    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    const walletClient = createWalletClient({
      account,
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    // Step 1: Get previous month ID (we distribute for the month that just ended)
    const currentMonthId = await publicClient.readContract({
      address: LISTENER_REWARD_POOL,
      abi: POOL_ABI,
      functionName: 'getCurrentMonthId',
    });
    const monthToDistribute = Number(currentMonthId) - 1;

    // Check if already finalized
    const poolInfo = await publicClient.readContract({
      address: LISTENER_REWARD_POOL,
      abi: POOL_ABI,
      functionName: 'getMonthlyPool',
      args: [BigInt(monthToDistribute)],
    });

    if (poolInfo[3]) { // finalized
      return NextResponse.json({
        success: false,
        message: `Month ${monthToDistribute} already finalized`,
        monthId: monthToDistribute,
      });
    }

    // Step 2: Read listener stats from Redis
    const allStats = await redis.hgetall<Record<string, ListenerStats>>(LISTENER_STATS_KEY);
    if (!allStats || Object.keys(allStats).length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No listener stats found in Redis',
      });
    }

    // Step 3: Calculate delta points (songs listened since last distribution)
    const snapshot = await redis.hgetall<Record<string, number>>(DISTRIBUTION_SNAPSHOT_KEY) || {};

    const listeners: Address[] = [];
    const points: bigint[] = [];

    for (const [address, stats] of Object.entries(allStats)) {
      if (!stats || typeof stats.totalSongsListened !== 'number') continue;

      const previousTotal = Number(snapshot[address] || 0);
      let delta = stats.totalSongsListened - previousTotal;

      // Streak bonus: 5 extra points per active 7-day streak
      if (stats.currentStreak >= 7) {
        delta += Math.floor(stats.currentStreak / 7) * 5;
      }

      if (delta > 0) {
        listeners.push(address as Address);
        points.push(BigInt(delta));
      }
    }

    if (listeners.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No new listens since last distribution',
      });
    }

    // Step 4: Check reserve balance
    const reserveBalance = await publicClient.readContract({
      address: MUSIC_SUBSCRIPTION,
      abi: SUBSCRIPTION_ABI,
      functionName: 'getReserveBalance',
    });

    if (reserveBalance === 0n) {
      return NextResponse.json({
        success: false,
        message: 'No reserve balance to distribute',
        reserveBalance: '0',
      });
    }

    console.log(`[DistributeCron] Month ${monthToDistribute}: ${listeners.length} listeners, reserve=${formatEther(reserveBalance)} WMON`);

    // Step 5: Withdraw reserve from MusicSubscriptionV5 → deployer wallet
    const withdrawHash = await walletClient.writeContract({
      address: MUSIC_SUBSCRIPTION,
      abi: SUBSCRIPTION_ABI,
      functionName: 'withdrawReserveToDAO',
      args: [account.address, reserveBalance],
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    console.log(`[DistributeCron] Reserve withdrawn: ${withdrawHash}`);

    // Step 6: Approve ListenerRewardPool to spend WMON
    const approveHash = await walletClient.writeContract({
      address: WMON_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LISTENER_REWARD_POOL, reserveBalance],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    // Step 7: Fund the monthly pool
    const fundHash = await walletClient.writeContract({
      address: LISTENER_REWARD_POOL,
      abi: POOL_ABI,
      functionName: 'fundMonth',
      args: [BigInt(monthToDistribute), reserveBalance],
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    console.log(`[DistributeCron] Month funded: ${fundHash}`);

    // Step 8: Set listener points in batches
    const batchHashes: string[] = [];
    for (let i = 0; i < listeners.length; i += BATCH_SIZE) {
      const batchListeners = listeners.slice(i, i + BATCH_SIZE);
      const batchPoints = points.slice(i, i + BATCH_SIZE);

      const batchHash = await walletClient.writeContract({
        address: LISTENER_REWARD_POOL,
        abi: POOL_ABI,
        functionName: 'batchSetListenerPoints',
        args: [BigInt(monthToDistribute), batchListeners, batchPoints],
      });
      await publicClient.waitForTransactionReceipt({ hash: batchHash });
      batchHashes.push(batchHash);
      console.log(`[DistributeCron] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchListeners.length} listeners set`);
    }

    // Step 9: Finalize the month
    const finalizeHash = await walletClient.writeContract({
      address: LISTENER_REWARD_POOL,
      abi: POOL_ABI,
      functionName: 'finalizeMonth',
      args: [BigInt(monthToDistribute)],
    });
    await publicClient.waitForTransactionReceipt({ hash: finalizeHash });
    console.log(`[DistributeCron] Month finalized: ${finalizeHash}`);

    // Step 10: Update snapshot in Redis
    const newSnapshot: Record<string, number> = {};
    for (const [address, stats] of Object.entries(allStats)) {
      if (stats && typeof stats.totalSongsListened === 'number') {
        newSnapshot[address] = stats.totalSongsListened;
      }
    }
    await redis.hset(DISTRIBUTION_SNAPSHOT_KEY, newSnapshot);
    await redis.set(LAST_DISTRIBUTION_KEY, Date.now());

    const totalPoints = points.reduce((sum, p) => sum + p, 0n);
    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      monthId: monthToDistribute,
      totalWMON: formatEther(reserveBalance),
      listenerCount: listeners.length,
      totalListenPoints: totalPoints.toString(),
      batches: batchHashes.length,
      transactions: {
        withdraw: withdrawHash,
        approve: approveHash,
        fund: fundHash,
        batchSets: batchHashes,
        finalize: finalizeHash,
      },
      elapsedMs: elapsed,
    });
  } catch (error: any) {
    console.error('[DistributeCron] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Distribution failed',
        details: error.shortMessage || error.cause?.message,
      },
      { status: 500 }
    );
  }
}

// GET: Health check / status
export async function GET() {
  try {
    const lastDistribution = await redis.get<number>(LAST_DISTRIBUTION_KEY);
    const allStats = await redis.hgetall(LISTENER_STATS_KEY);
    const listenerCount = allStats ? Object.keys(allStats).length : 0;

    return NextResponse.json({
      service: 'distribute-listener-rewards',
      status: 'ok',
      lastDistribution: lastDistribution
        ? new Date(lastDistribution).toISOString()
        : 'never',
      trackedListeners: listenerCount,
      config: {
        poolContract: LISTENER_REWARD_POOL || 'not set',
        subscriptionContract: MUSIC_SUBSCRIPTION || 'not set',
        batchSize: BATCH_SIZE,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
