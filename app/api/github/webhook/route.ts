import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, extractWeekFromPath } from '@/lib/homework/github';
import { CURRICULUM } from '@/lib/homework/curriculum';
import { getRewardForWeek } from '@/lib/homework/rewards';
import { redis } from '@/lib/redis';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature)) {
      console.error('[Homework] Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = req.headers.get('x-github-event');
    if (event !== 'push') {
      return NextResponse.json({ ok: true, skipped: true, reason: `Event type: ${event}` });
    }

    const body = JSON.parse(payload);
    const repoFullName = body.repository?.full_name;
    const pusherUsername = body.pusher?.name;

    if (!pusherUsername) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'No pusher' });
    }

    // Look up wallet by GitHub username
    const wallet = await redis.get(`hw:wallet:${pusherUsername.toLowerCase()}`) as string | null;
    if (!wallet) {
      console.log(`[Homework] Push from unlinked GitHub user: ${pusherUsername}`);
      return NextResponse.json({ ok: true, skipped: true, reason: 'User not linked' });
    }

    // Extract all file paths from push commits
    const filePaths: string[] = [];
    for (const commit of body.commits || []) {
      filePaths.push(...(commit.added || []), ...(commit.modified || []));
    }

    if (filePaths.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'No files' });
    }

    // Check each week's required files
    const completedWeeks: number[] = [];
    const alreadyCompleted = await redis.smembers(`hw:completed:${wallet}`) as string[];
    const alreadyCompletedSet = new Set(alreadyCompleted.map(String));

    for (const weekData of CURRICULUM) {
      const weekStr = String(weekData.week);
      if (alreadyCompletedSet.has(weekStr)) continue;

      // Check if all required files for this week are in the push
      const allFilesPresent = weekData.requiredFiles.every(required =>
        filePaths.some(pushed => pushed.endsWith(required) || pushed.includes(required))
      );

      if (allFilesPresent) {
        // Mark week as completed
        const commitSha = body.commits?.[0]?.id || body.after || '';
        const progressData = {
          completedAt: new Date().toISOString(),
          commitSha,
          verified: true,
          repo: repoFullName,
        };

        await redis.hset(`hw:progress:${wallet}`, { [weekStr]: JSON.stringify(progressData) });
        await redis.sadd(`hw:completed:${wallet}`, weekStr);

        // Add to pending reward queue
        const rewardAmount = getRewardForWeek(weekData.week);
        await redis.sadd(`hw:pending-reward:${weekStr}`, wallet);

        // Update leaderboard
        await redis.zincrby('hw:leaderboard', 1, wallet);

        completedWeeks.push(weekData.week);
        console.log(`[Homework] Week ${weekData.week} completed by ${wallet} (${pusherUsername}), reward: ${rewardAmount} TOURS`);
      }
    }

    return NextResponse.json({
      ok: true,
      completedWeeks,
      user: pusherUsername,
      filesProcessed: filePaths.length,
    });
  } catch (error: any) {
    console.error('[Homework] Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
