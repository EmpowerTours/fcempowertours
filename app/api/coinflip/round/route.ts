import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import {
  getOrCreateCurrentRound,
  getRoundHistory,
} from '@/lib/coinflip/state';
import {
  CoinflipRateLimits,
  BETTING_WINDOW_MS,
  MIN_BET_AMOUNT,
  MAX_BET_AMOUNT,
} from '@/lib/coinflip/types';

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
