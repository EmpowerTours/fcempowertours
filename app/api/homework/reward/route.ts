import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { transferTOURS, getRewardForWeek } from '@/lib/homework/rewards';

export async function POST(req: NextRequest) {
  try {
    // Admin authentication
    const authHeader = req.headers.get('authorization');
    const apiKey = process.env.TURBO_ADMIN_API_KEY;

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { week, wallet } = await req.json();

    if (!week || !wallet) {
      return NextResponse.json({ error: 'Missing week or wallet' }, { status: 400 });
    }

    const walletLower = wallet.toLowerCase();
    const weekStr = String(week);

    // Verify week is completed
    const isCompleted = await redis.sismember(`hw:completed:${walletLower}`, weekStr);
    if (!isCompleted) {
      return NextResponse.json({ error: 'Week not completed by this member' }, { status: 400 });
    }

    // Check if already rewarded
    const existingReward = await redis.hget(`hw:rewards:${walletLower}`, weekStr) as string | null;
    if (existingReward) {
      return NextResponse.json({ error: 'Already rewarded for this week' }, { status: 400 });
    }

    // Calculate reward amount
    const amount = getRewardForWeek(Number(week));

    // Transfer TOURS
    const txHash = await transferTOURS(walletLower, amount);

    // Record reward
    const rewardData = {
      amount,
      txHash,
      distributedAt: new Date().toISOString(),
    };
    await redis.hset(`hw:rewards:${walletLower}`, { [weekStr]: JSON.stringify(rewardData) });

    // Remove from pending queue
    await redis.srem(`hw:pending-reward:${weekStr}`, walletLower);

    console.log(`[Homework] Reward distributed: ${amount} TOURS to ${walletLower} for week ${week}, tx: ${txHash}`);

    return NextResponse.json({
      success: true,
      amount,
      txHash,
      wallet: walletLower,
      week: Number(week),
    });
  } catch (error: any) {
    console.error('[Homework] Reward distribution error:', error);
    return NextResponse.json({ error: error.message || 'Reward distribution failed' }, { status: 500 });
  }
}
