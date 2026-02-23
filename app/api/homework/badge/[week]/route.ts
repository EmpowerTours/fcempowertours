import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateBadgeSVG, MILESTONE_WEEKS } from '@/lib/homework/badges';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ week: string }> }
) {
  try {
    const { week: weekStr } = await params;
    const week = parseInt(weekStr, 10);

    if (!MILESTONE_WEEKS.includes(week)) {
      return NextResponse.json({ error: 'Not a milestone week. Valid: 8, 20, 36, 52' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const walletLower = wallet.toLowerCase();

    // Check that all weeks up to milestone are completed
    const completedWeeks = await redis.smembers(`hw:completed:${walletLower}`) as string[];
    const completedSet = new Set(completedWeeks.map(Number));

    for (let w = 1; w <= week; w++) {
      if (!completedSet.has(w)) {
        return NextResponse.json(
          { error: `Week ${w} not yet completed. Complete all weeks up to ${week} to earn this badge.` },
          { status: 403 }
        );
      }
    }

    // Get GitHub username for badge
    const githubRaw = await redis.get(`hw:github:${walletLower}`) as string | null;
    const github = githubRaw ? (typeof githubRaw === 'string' ? JSON.parse(githubRaw) : githubRaw) : null;
    const memberName = github?.username || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

    // Get completion date of milestone week
    const progressRaw = await redis.hget(`hw:progress:${walletLower}`, String(week)) as string | null;
    const progressData = progressRaw ? (typeof progressRaw === 'string' ? JSON.parse(progressRaw) : progressRaw) : null;
    const completedAt = progressData?.completedAt || new Date().toISOString();

    // Generate SVG
    const svg = generateBadgeSVG(week, memberName, completedAt);
    if (!svg) {
      return NextResponse.json({ error: 'Badge generation failed' }, { status: 500 });
    }

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('[Homework] Badge error:', error);
    return NextResponse.json({ error: 'Badge generation failed' }, { status: 500 });
  }
}
