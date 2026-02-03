import { NextRequest, NextResponse } from 'next/server';
import { Address } from 'viem';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/auth';
import {
  isAgentRegistered,
  getAgent,
  recordAgentAction,
  addEvent,
} from '@/lib/world/state';
import { getTokenHoldings } from '@/lib/world/token-gate';
import {
  WorldRateLimits,
  WorldActionType,
  ACTION_MAP,
  EMPTOURS_TOKEN,
} from '@/lib/world/types';

const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  'https://fcempowertours-production-6551.up.railway.app';

/**
 * POST /api/world/action
 *
 * Execute an action in the world. Delegates to /api/execute-delegated.
 * Body: { agentAddress, action, params }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);

    const body = await req.json();
    const { agentAddress, action, params } = body;

    if (!agentAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing agentAddress or action' },
        { status: 400 }
      );
    }

    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(agentAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Rate limit per agent
    const rateLimit = await checkRateLimit(
      WorldRateLimits.action,
      ip,
      agentAddress
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded (${WorldRateLimits.action.maxRequests}/min). Try again in ${rateLimit.resetIn}s.`,
        },
        { status: 429 }
      );
    }

    // Check agent is registered
    if (!(await isAgentRegistered(agentAddress))) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Agent not registered. Pay the entry fee first via POST /api/world/enter',
        },
        { status: 403 }
      );
    }

    // EMPTOURS Token Gate: Agents must hold EMPTOURS to perform actions
    const holdings = await getTokenHoldings(agentAddress as Address);
    if (holdings.emptours.balanceRaw === 0n) {
      return NextResponse.json(
        {
          success: false,
          error: `EMPTOURS token required to perform actions. ` +
            `You need to hold EMPTOURS. Buy at: https://nad.fun/tokens/${EMPTOURS_TOKEN}`,
        },
        { status: 403 }
      );
    }

    // Validate action type
    const actionType = action as WorldActionType;
    const delegatedAction = ACTION_MAP[actionType];
    if (!delegatedAction) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown action: ${action}. Available: ${Object.keys(ACTION_MAP).join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Build params for execute-delegated
    const delegatedParams = { ...(params || {}) };

    // Sanitize string params
    for (const [key, val] of Object.entries(delegatedParams)) {
      if (typeof val === 'string') {
        delegatedParams[key] = sanitizeInput(val, 500);
      }
    }

    // Call execute-delegated internally
    const delegatedBody = {
      userAddress: agentAddress,
      action: delegatedAction,
      params: delegatedParams,
    };

    const res = await fetch(`${APP_URL}/api/execute-delegated`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip,
      },
      body: JSON.stringify(delegatedBody),
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Action execution failed',
          details: result,
        },
        { status: res.status }
      );
    }

    // Record the action
    const toursEarned = result.toursReward || result.toursEarned || '0';
    await recordAgentAction(agentAddress, toursEarned);

    // Log event
    const agent = await getAgent(agentAddress);
    await addEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'action',
      agent: agentAddress,
      agentName: agent?.name || agentAddress.slice(0, 10),
      description: `Executed ${action}${result.txHash ? ` (tx: ${result.txHash.slice(0, 14)}...)` : ''}`,
      txHash: result.txHash,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      action: actionType,
      result: {
        txHash: result.txHash,
        message: result.message || result.result || 'Action completed',
        toursEarned,
      },
    });
  } catch (err: any) {
    console.error('[World] Action error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to execute action' },
      { status: 500 }
    );
  }
}
