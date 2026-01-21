import { NextRequest, NextResponse } from 'next/server';
import {
  runLotteryDrawing,
  getDateKey,
  getLotteryPool,
  LOTTERY_CONFIG,
} from '@/lib/lottery';
import { sanitizeErrorForResponse } from '@/lib/auth';

/**
 * 🔐 DAILY LOTTERY CRON ENDPOINT (SECURED)
 *
 * NOTE: Lottery feature not currently active in production.
 *
 * SECURITY CHANGES:
 * - Admin key moved from URL query param to headers
 * - Uses Authorization header or x-admin-key header
 * - Rate limiting via external cron service
 *
 * For manual calls, use header: x-admin-key: <LOTTERY_ADMIN_KEY>
 */

export async function GET(req: NextRequest) {
  try {
    // Check if lottery is enabled
    if (!LOTTERY_CONFIG.ENABLED) {
      return NextResponse.json({
        success: false,
        error: 'Lottery feature is currently disabled',
        skipped: true,
      });
    }

    // SECURITY: Get credentials from headers (not URL params)
    const authHeader = req.headers.get('authorization');
    const adminKeyHeader = req.headers.get('x-admin-key');
    const cronSecret = process.env.CRON_SECRET;
    const adminKey = process.env.LOTTERY_ADMIN_KEY;

    // Check authorization
    const isCronService = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isAdminKey = adminKey && adminKeyHeader === adminKey;

    // SECURITY: Require valid auth
    if (!isCronService && !isAdminKey) {
      // Don't reveal which auth method is expected
      console.warn('[CRON] Unauthorized lottery access attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[CRON] Running daily lottery drawing...');
    console.log('[CRON] Auth method:', isCronService ? 'Cron Service' : 'Admin Key');

    // Get yesterday's date (we draw for the previous day)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDay = getDateKey(yesterday);

    // Check if there's a pool to draw
    const pool = await getLotteryPool(targetDay);

    if (!pool) {
      console.log(`[CRON] No pool found for ${targetDay}`);
      return NextResponse.json({
        success: true,
        message: `No lottery pool for ${targetDay}`,
        drawn: false,
      });
    }

    if (pool.status === 'completed') {
      console.log(`[CRON] Lottery for ${targetDay} already completed`);
      return NextResponse.json({
        success: true,
        message: `Lottery for ${targetDay} already drawn`,
        winner: pool.winner,
        drawn: false,
      });
    }

    if (pool.participantCount === 0) {
      console.log(`[CRON] No participants for ${targetDay}`);
      return NextResponse.json({
        success: true,
        message: `No participants for ${targetDay}`,
        drawn: false,
      });
    }

    // Run the drawing
    const winner = await runLotteryDrawing(targetDay);

    if (!winner) {
      return NextResponse.json({
        success: false,
        error: 'Drawing failed',
      });
    }

    console.log(`[CRON] Winner: ${winner.winnerAddress} - ${winner.amount} ETH`);

    // Trigger full drawing endpoint (for payout and announcement)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    try {
      const drawingResponse = await fetch(`${baseUrl}/api/lottery/run-drawing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || '', // Pass auth via header
        },
        body: JSON.stringify({
          day: targetDay,
        }),
      });

      const drawingResult = await drawingResponse.json();
      console.log('[CRON] Full drawing result:', drawingResult);
    } catch (e) {
      console.log('[CRON] Could not trigger full drawing, winner selected but payout pending');
    }

    return NextResponse.json({
      success: true,
      drawn: true,
      day: targetDay,
      winner: {
        address: winner.winnerAddress,
        username: winner.winnerUsername,
        amount: winner.amount,
      },
      message: `Lottery drawn! ${winner.winnerUsername || winner.winnerAddress} wins ${winner.amount} ETH`,
    });

  } catch (error: any) {
    console.error('[CRON] Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(req: NextRequest) {
  return GET(req);
}
