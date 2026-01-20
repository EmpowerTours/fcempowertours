import { NextRequest, NextResponse } from 'next/server';
import {
  getTodayPool,
  getLotteryPool,
  getAllWinners,
  getLotteryStats,
  getTodayKey,
  LOTTERY_CONFIG,
} from '@/lib/lottery';

export async function GET(req: NextRequest) {
  try {
    // Check if lottery is enabled
    if (!LOTTERY_CONFIG.ENABLED) {
      return NextResponse.json({
        success: true,
        enabled: false,
        message: 'Lottery feature is currently disabled',
      });
    }

    const { searchParams } = new URL(req.url);
    const day = searchParams.get('day') || getTodayKey();

    const pool = day === getTodayKey() ? await getTodayPool() : await getLotteryPool(day);
    const stats = await getLotteryStats();
    const recentWinners = await getAllWinners(5);

    // Calculate time until next drawing (midnight UTC)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const msUntilDrawing = tomorrow.getTime() - now.getTime();
    const hoursUntilDrawing = Math.floor(msUntilDrawing / (1000 * 60 * 60));
    const minutesUntilDrawing = Math.floor((msUntilDrawing % (1000 * 60 * 60)) / (1000 * 60));

    return NextResponse.json({
      success: true,
      config: {
        accessFee: LOTTERY_CONFIG.ACCESS_FEE_ETH,
        lotteryShare: LOTTERY_CONFIG.LOTTERY_SHARE,
        treasuryShare: LOTTERY_CONFIG.TREASURY_SHARE,
        paymentAddress: LOTTERY_CONFIG.BOT_WALLET_ADDRESS,
        network: LOTTERY_CONFIG.NETWORK,
      },
      currentPool: pool ? {
        day: pool.day,
        totalPool: pool.totalPool,
        participantCount: pool.participantCount,
        status: pool.status,
        winner: pool.winner,
        winningAmount: pool.winningAmount,
      } : {
        day,
        totalPool: 0,
        participantCount: 0,
        status: 'active',
      },
      nextDrawing: {
        hoursUntil: hoursUntilDrawing,
        minutesUntil: minutesUntilDrawing,
        timestamp: tomorrow.getTime(),
      },
      stats: {
        totalDrawings: stats.totalDrawings,
        totalPaidOut: stats.totalPaidOut,
      },
      recentWinners: recentWinners.map(w => ({
        day: w.day,
        winner: w.winnerUsername || `${w.winnerAddress.slice(0, 6)}...${w.winnerAddress.slice(-4)}`,
        amount: w.amount,
        txHash: w.payoutTxHash,
      })),
    });

  } catch (error: any) {
    console.error('[LOTTERY] Error getting status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
