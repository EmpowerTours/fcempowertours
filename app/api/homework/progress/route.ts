import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { CURRICULUM } from '@/lib/homework/curriculum';
import { getRewardForWeek, getTotalPossibleReward } from '@/lib/homework/rewards';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const walletLower = wallet.toLowerCase();

    // Get GitHub link
    const githubRaw = await redis.get(`hw:github:${walletLower}`) as string | null;
    const github = githubRaw ? (typeof githubRaw === 'string' ? JSON.parse(githubRaw) : githubRaw) : null;

    // Get completed weeks
    const completedWeeks = await redis.smembers(`hw:completed:${walletLower}`) as string[];
    const completedSet = new Set(completedWeeks.map(Number));

    // Get progress details
    const progressRaw = await redis.hgetall(`hw:progress:${walletLower}`) as Record<string, string> | null;
    const progress: Record<string, any> = {};
    if (progressRaw) {
      for (const [key, val] of Object.entries(progressRaw)) {
        progress[key] = typeof val === 'string' ? JSON.parse(val) : val;
      }
    }

    // Get rewards
    const rewardsRaw = await redis.hgetall(`hw:rewards:${walletLower}`) as Record<string, string> | null;
    const rewards: Record<string, any> = {};
    if (rewardsRaw) {
      for (const [key, val] of Object.entries(rewardsRaw)) {
        rewards[key] = typeof val === 'string' ? JSON.parse(val) : val;
      }
    }

    // Calculate total rewards earned
    let totalEarned = 0;
    let totalPending = 0;
    for (const week of completedSet) {
      const reward = getRewardForWeek(week);
      if (rewards[String(week)]) {
        totalEarned += reward;
      } else {
        totalPending += reward;
      }
    }

    // Get leaderboard rank
    const rank = await redis.zrevrank('hw:leaderboard', walletLower);

    // Build curriculum with completion status
    const curriculum = CURRICULUM.map(c => ({
      ...c,
      completed: completedSet.has(c.week),
      progress: progress[String(c.week)] || null,
      reward: rewards[String(c.week)] || null,
    }));

    return NextResponse.json({
      github: github ? { username: github.username, avatarUrl: github.avatarUrl, linkedAt: github.linkedAt } : null,
      completedCount: completedSet.size,
      totalWeeks: 52,
      percentage: Math.round((completedSet.size / 52) * 100),
      totalEarned,
      totalPending,
      totalPossible: getTotalPossibleReward(),
      leaderboardRank: rank !== null ? rank + 1 : null,
      curriculum,
    });
  } catch (error: any) {
    console.error('[Homework] Progress error:', error);
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}
