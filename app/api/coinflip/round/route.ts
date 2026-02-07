import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import {
  getOrCreateCurrentRound,
  getRoundHistory,
  forceResetRound,
  createNewRound,
} from '@/lib/coinflip/state';
import {
  CoinflipRateLimits,
  BETTING_WINDOW_MS,
  MIN_BET_AMOUNT,
  MAX_BET_AMOUNT,
} from '@/lib/coinflip/types';
import { redis } from '@/lib/redis';

// Constants for autonomous agent triggering
const AGENT_TRIGGER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between auto-triggers
const MIN_TIME_BEFORE_CLOSE_MS = 10 * 60 * 1000; // Don't trigger if less than 10 min left

/**
 * Trigger agent predictions internally (no HTTP call needed)
 * This is called automatically when someone views the round
 */
async function triggerAgentPredictions() {
  const adminKey = process.env.KEEPER_SECRET || process.env.COINFLIP_SECRET;
  if (!adminKey) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'https://fcempowertours-production-6551.up.railway.app';

  console.log('[Coinflip] Auto-triggering agent predictions...');

  try {
    const response = await fetch(`${baseUrl}/api/coinflip/agents/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
    });

    const data = await response.json();
    console.log(`[Coinflip] Auto-trigger result: ${data.successfulBets?.length || 0} bets placed`);
  } catch (err) {
    console.error('[Coinflip] Auto-trigger fetch error:', err);
  }
}

/**
 * GET /api/coinflip/round
 *
 * Get current round status and recent history
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(CoinflipRateLimits.status, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limited. Try again in ${rateLimit.resetIn}s` },
        { status: 429 }
      );
    }

    const round = await getOrCreateCurrentRound();
    const history = await getRoundHistory(5);

    const now = Date.now();
    const timeRemaining = Math.max(0, round.closesAt - now);
    const bettingOpen = round.status === 'open' && timeRemaining > 0;

    // AUTONOMOUS AGENT TRIGGER: Wake up agents when someone views the round
    // This makes agents truly autonomous - no cron needed!
    if (bettingOpen && timeRemaining > MIN_TIME_BEFORE_CLOSE_MS) {
      const lastTrigger = await redis.get<number>('coinflip:lastAgentTrigger');
      const cooldownExpired = !lastTrigger || (now - lastTrigger) > AGENT_TRIGGER_COOLDOWN_MS;

      // Only trigger if cooldown expired and not too many agents have bet
      const agentBetCount = round.bets.length;

      if (cooldownExpired && agentBetCount < 4) {
        // Trigger agents in background (don't block response)
        triggerAgentPredictions().catch(err =>
          console.error('[Coinflip] Auto-trigger failed:', err)
        );
        await redis.set('coinflip:lastAgentTrigger', now);
      }
    }

    return NextResponse.json({
      success: true,
      round: {
        id: round.id,
        status: round.status,
        bettingOpen,
        startedAt: round.startedAt,
        closesAt: round.closesAt,
        timeRemainingMs: timeRemaining,
        timeRemainingFormatted: formatTime(timeRemaining),
        bets: round.bets.map(b => ({
          agentName: b.agentName,
          agentAddress: b.agentAddress.slice(0, 6) + '...' + b.agentAddress.slice(-4),
          prediction: b.prediction,
          amount: b.amount,
        })),
        totals: {
          heads: round.totalHeads,
          tails: round.totalTails,
          pool: (parseFloat(round.totalHeads) + parseFloat(round.totalTails)).toFixed(2),
        },
        result: round.result,
        flipTxHash: round.flipTxHash,
      },
      rules: {
        minBet: MIN_BET_AMOUNT + ' EMPTOURS',
        maxBet: MAX_BET_AMOUNT + ' EMPTOURS',
        bettingWindow: Math.floor(BETTING_WINDOW_MS / 60000) + ' minutes',
        payoutModel: 'Parimutuel - winners split losers\' pool proportionally',
      },
      recentRounds: history.map(r => ({
        id: r.id,
        result: r.result,
        totalBets: r.bets.length,
        pool: (parseFloat(r.totalHeads) + parseFloat(r.totalTails)).toFixed(2),
        resolvedAt: r.resolvedAt,
      })),
      howToPlay: {
        step1: 'POST /api/coinflip/bet with { agentAddress, prediction, amount }',
        step2: 'Wait for round to close (betting window ends)',
        step3: 'Flip executes on-chain via AicoinflipMON contract',
        step4: 'Winners receive their bet + share of losers\' pool',
      },
    });
  } catch (err: any) {
    console.error('[Coinflip] Round status error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to get round status' },
      { status: 500 }
    );
  }
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * POST /api/coinflip/round
 *
 * Admin actions: start new round, force reset stuck round
 */
export async function POST(req: NextRequest) {
  try {
    const adminKey = req.headers.get('x-admin-key');
    const expectedKey = process.env.KEEPER_SECRET || process.env.COINFLIP_SECRET;

    if (!adminKey || adminKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'reset' || action === 'force-reset') {
      const newRound = await forceResetRound();
      return NextResponse.json({
        success: true,
        message: 'Round force reset',
        round: {
          id: newRound.id,
          status: newRound.status,
          closesAt: newRound.closesAt,
        },
      });
    }

    if (action === 'start') {
      const newRound = await createNewRound();
      return NextResponse.json({
        success: true,
        message: 'New round started',
        round: {
          id: newRound.id,
          status: newRound.status,
          closesAt: newRound.closesAt,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use "start" or "reset"' },
      { status: 400 }
    );

  } catch (err: any) {
    console.error('[Coinflip] Round POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
