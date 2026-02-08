import { NextRequest, NextResponse } from 'next/server';

/**
 * AGENT KEEPER - Autonomous Agent Loop
 *
 * This endpoint orchestrates all autonomous agent actions.
 * Called by cron job (e.g., every hour or every 30 minutes).
 *
 * Actions triggered:
 * 1. Coinflip predictions - Agents bet on the hourly coinflip
 * 2. Lottery predictions - Agents buy lottery tickets
 * 3. Music buying - Agents buy music they appreciate
 * 4. (Future) Breeding - Agents with high mutual appreciation breed
 *
 * The order matters:
 * - Coinflip/Lottery first (may make agents broke)
 * - Broke agents create music (triggered by coinflip/lottery when balance low)
 * - Then music buying (agents with funds buy from broke agents)
 */

const KEEPER_SECRET = process.env.KEEPER_SECRET || process.env.COINFLIP_SECRET || '';

interface ActionResult {
  action: string;
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
  durationMs: number;
}

async function callEndpoint(
  baseUrl: string,
  path: string,
  adminKey: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    return { success: data.success, data, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * POST /api/agents/keeper
 *
 * Run the full autonomous agent loop
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify keeper secret
    const adminKey = req.headers.get('x-admin-key');
    if (!adminKey || adminKey !== KEEPER_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      'https://fcempowertours-production-6551.up.railway.app';

    const results: ActionResult[] = [];

    // 1. Coinflip Predictions
    console.log('[AgentKeeper] Running coinflip predictions...');
    const coinflipStart = Date.now();
    const coinflipResult = await callEndpoint(baseUrl, '/api/coinflip/agents/predict', adminKey);
    results.push({
      action: 'coinflip_predictions',
      success: coinflipResult.success,
      message: coinflipResult.data?.message,
      data: {
        successfulBets: coinflipResult.data?.successfulBets?.length || 0,
        decisions: coinflipResult.data?.decisions?.length || 0,
      },
      error: coinflipResult.error,
      durationMs: Date.now() - coinflipStart,
    });

    // Small delay between actions
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Lottery Predictions
    console.log('[AgentKeeper] Running lottery predictions...');
    const lotteryStart = Date.now();
    const lotteryResult = await callEndpoint(baseUrl, '/api/lottery/agents/predict', adminKey);
    results.push({
      action: 'lottery_predictions',
      success: lotteryResult.success,
      message: lotteryResult.data?.message,
      data: {
        successfulPurchases: lotteryResult.data?.successfulPurchases?.length || 0,
        decisions: lotteryResult.data?.decisions?.length || 0,
      },
      error: lotteryResult.error,
      durationMs: Date.now() - lotteryStart,
    });

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Music Buying
    console.log('[AgentKeeper] Running music buying...');
    const musicStart = Date.now();
    const musicResult = await callEndpoint(baseUrl, '/api/agents/buy-music', adminKey);
    results.push({
      action: 'music_buying',
      success: musicResult.success,
      message: musicResult.data?.message,
      data: {
        successfulPurchases: musicResult.data?.successfulPurchases?.length || 0,
        listedCount: musicResult.data?.listedCount || 0,
      },
      error: musicResult.error,
      durationMs: Date.now() - musicStart,
    });

    // Summary
    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    console.log(`[AgentKeeper] Completed ${successCount}/${results.length} actions in ${totalDuration}ms`);

    return NextResponse.json({
      success: true,
      totalDurationMs: totalDuration,
      results,
      summary: {
        actionsRun: results.length,
        actionsSucceeded: successCount,
        actionsFailed: results.length - successCount,
        coinflipBets: results[0]?.data?.successfulBets || 0,
        lotteryPurchases: results[1]?.data?.successfulPurchases || 0,
        musicPurchases: results[2]?.data?.successfulPurchases || 0,
      },
    });

  } catch (err: any) {
    console.error('[AgentKeeper] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message, durationMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/keeper
 *
 * Get status of agent actions
 */
export async function GET(req: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      'https://fcempowertours-production-6551.up.railway.app';

    // Fetch status from each endpoint
    const [coinflipStatus, lotteryStatus, musicStatus] = await Promise.all([
      fetch(`${baseUrl}/api/coinflip/agents/predict`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/lottery/agents/predict`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/agents/buy-music`).then(r => r.json()).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      status: {
        coinflip: {
          roundId: coinflipStatus?.roundId,
          roundStatus: coinflipStatus?.roundStatus,
          agentCount: coinflipStatus?.agents?.length || 0,
          agentsBet: coinflipStatus?.agents?.filter((a: any) => a.hasBet)?.length || 0,
        },
        lottery: {
          roundId: lotteryStatus?.currentRound?.roundId,
          prizePool: lotteryStatus?.currentRound?.prizePool,
          agentsPlayed: lotteryStatus?.agents?.filter((a: any) => a.playedThisRound)?.length || 0,
        },
        music: {
          listedCount: musicStatus?.totalListings || 0,
          agentPurchases: musicStatus?.agentStats?.reduce((sum: number, a: any) => sum + a.purchaseCount, 0) || 0,
        },
      },
      endpoints: {
        trigger: 'POST /api/agents/keeper (with x-admin-key header)',
        coinflip: 'GET /api/coinflip/agents/predict',
        lottery: 'GET /api/lottery/agents/predict',
        music: 'GET /api/agents/buy-music',
      },
    });

  } catch (err: any) {
    console.error('[AgentKeeper] GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
