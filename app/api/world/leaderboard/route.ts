import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getLeaderboard, getAgent } from '@/lib/world/state';
import { WorldRateLimits } from '@/lib/world/types';

/**
 * GET /api/world/leaderboard
 *
 * Get agent rankings by TOURS earned. Query: ?limit=20
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(WorldRateLimits.read, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. Try again in ${rateLimit.resetIn}s.` },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    const entries = await getLeaderboard(limit);

    // Enrich with agent names
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const agent = await getAgent(entry.address);
        return {
          rank: entry.rank,
          address: entry.address,
          name: agent?.name || `Agent-${entry.address.slice(0, 8)}`,
          toursEarned: entry.score.toString(),
          totalActions: agent?.totalActions || 0,
          lastActionAt: agent?.lastActionAt || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      total: enriched.length,
      leaderboard: enriched,
    });
  } catch (err: any) {
    console.error('[World] Leaderboard error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
