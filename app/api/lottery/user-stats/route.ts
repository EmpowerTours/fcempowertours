import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/**
 * Get user's lottery statistics
 * 
 * GET /api/lottery/user-stats?address=0x...
 * 
 * Returns:
 * {
 *   success: boolean,
 *   ticketsToday: number,
 *   spendingToday: number,
 *   recentWins: Array<{roundId, amount, timestamp}>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address required' },
        { status: 400 }
      );
    }

    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Fetch tickets today
    const ticketsKey = `lottery:${today}:user:${address}:tickets`;
    const ticketsStr = await redis.get(ticketsKey);
    const ticketsToday = ticketsStr ? parseInt(ticketsStr as string) : 0;

    // Fetch spending today
    const spendingKey = `lottery:${today}:user:${address}:spending`;
    const spendingStr = await redis.get(spendingKey);
    const spendingToday = spendingStr ? parseInt(spendingStr as string) : 0;

    // Fetch recent wins (sorted set - last 5)
    const winsKey = `lottery:wins:${address}`;
    const recentWinsRaw = await redis.zrange(winsKey, -5, -1, { withScores: true });
    
    const recentWins = [];
    for (let i = 0; i < recentWinsRaw.length; i += 2) {
      const winData = recentWinsRaw[i];
      const timestamp = Number(recentWinsRaw[i + 1]);
      
      // Parse win data (format: "roundId:amount")
      if (typeof winData === 'string') {
        const [roundId, amount] = winData.split(':');
        recentWins.push({
          roundId: parseInt(roundId),
          amount: amount || '0',
          timestamp,
        });
      }
    }

    return NextResponse.json({
      success: true,
      ticketsToday,
      spendingToday,
      recentWins: recentWins.reverse(), // Most recent first
    });
  } catch (err) {
    console.error('[Lottery] User stats error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}
