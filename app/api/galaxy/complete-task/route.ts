import { NextRequest, NextResponse } from 'next/server';
import { encodeFunctionData, parseUnits, Address } from 'viem';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { getProjectById, TOURS_REWARD_PER_TASK } from '@/lib/galaxy/projects';
import { env } from '@/lib/env';

// Redis for storing completed tasks (optional - for persistence across devices)
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const TOURS_TOKEN = env.TOURS_TOKEN as Address;
const SAFE_ACCOUNT = env.SAFE_ACCOUNT as Address;

// ERC20 transfer ABI
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export async function POST(req: NextRequest) {
  try {
    const { projectId, taskId, walletAddress, fid, toursReward } = await req.json();

    // Validation
    if (!projectId || !taskId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify project and task exist
    const project = getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Check if task was already completed (Redis check)
    const redisKey = `galaxy:completed:${walletAddress}:${projectId}:${taskId}`;
    const alreadyCompleted = await redis.get(redisKey);

    if (alreadyCompleted) {
      return NextResponse.json(
        { success: false, error: 'Task already completed' },
        { status: 400 }
      );
    }

    console.log('🌌 [GALAXY] Processing task completion:', {
      project: project.name,
      task: task.title,
      wallet: walletAddress,
      reward: TOURS_REWARD_PER_TASK,
    });

    // Calculate reward amount (with 18 decimals for TOURS token)
    const rewardAmount = parseUnits(String(TOURS_REWARD_PER_TASK), 18);

    // Encode transfer function call
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [walletAddress as Address, rewardAmount],
    });

    let txHash: string | null = null;

    try {
      // Send TOURS reward via Safe (gasless)
      console.log('💸 Sending TOURS reward to:', walletAddress);

      const result = await sendSafeTransaction([
        {
          to: TOURS_TOKEN,
          data: transferData,
          value: BigInt(0),
        },
      ]);

      txHash = result.hash;
      console.log('✅ TOURS transfer successful:', txHash);
    } catch (transferError) {
      console.error('⚠️ TOURS transfer failed:', transferError);
      // Continue even if transfer fails - record completion anyway
      // User can claim rewards later or we can retry
    }

    // Record completion in Redis
    await redis.set(redisKey, {
      completedAt: Date.now(),
      txHash,
      reward: TOURS_REWARD_PER_TASK,
      fid,
    });

    // Also store in a list for the user's completed tasks
    const userTasksKey = `galaxy:user:${walletAddress}:tasks`;
    await redis.sadd(userTasksKey, `${projectId}:${taskId}`);

    // Update user's total earned TOURS from galaxy
    const userEarnedKey = `galaxy:user:${walletAddress}:earned`;
    await redis.incrby(userEarnedKey, TOURS_REWARD_PER_TASK);

    // Get updated total earned
    const totalEarned = await redis.get(userEarnedKey);

    return NextResponse.json({
      success: true,
      message: `Task completed! Earned ${TOURS_REWARD_PER_TASK} TOURS`,
      data: {
        projectId,
        taskId,
        reward: TOURS_REWARD_PER_TASK,
        txHash,
        totalEarned: Number(totalEarned) || TOURS_REWARD_PER_TASK,
      },
    });
  } catch (error) {
    console.error('❌ [GALAXY] Task completion error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete task',
      },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch user's completed tasks
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing wallet address' },
        { status: 400 }
      );
    }

    // Get user's completed tasks
    const userTasksKey = `galaxy:user:${walletAddress}:tasks`;
    const completedTasks = await redis.smembers(userTasksKey);

    // Get total earned
    const userEarnedKey = `galaxy:user:${walletAddress}:earned`;
    const totalEarned = await redis.get(userEarnedKey);

    // Parse completed tasks into projectId -> taskId[] format
    const tasksByProject: Record<string, string[]> = {};

    for (const entry of completedTasks) {
      const [projectId, taskId] = (entry as string).split(':');
      if (!tasksByProject[projectId]) {
        tasksByProject[projectId] = [];
      }
      tasksByProject[projectId].push(taskId);
    }

    return NextResponse.json({
      success: true,
      data: {
        completedTasks: tasksByProject,
        totalEarned: Number(totalEarned) || 0,
      },
    });
  } catch (error) {
    console.error('❌ [GALAXY] Failed to fetch completed tasks:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tasks',
      },
      { status: 500 }
    );
  }
}
