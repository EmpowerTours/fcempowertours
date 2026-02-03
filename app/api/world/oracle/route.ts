import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import {
  isAgentRegistered,
  getAgent,
  recordAgentAction,
  addEvent,
} from '@/lib/world/state';
import { WorldRateLimits, WorldActionType, ACTION_MAP } from '@/lib/world/types';
import { sanitizeInput } from '@/lib/auth';

const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  'https://fcempowertours-production-6551.up.railway.app';

/**
 * Maps Oracle action types to world action types.
 * Oracle returns structured actions; we translate to world actions where possible.
 */
const ORACLE_TO_WORLD_ACTION: Record<string, WorldActionType | null> = {
  buy_music: 'buy_music',
  buy_art: 'buy_art',
  mint_passport: 'mint_passport',
  lottery_buy: 'lottery_buy',
  lottery_draw: 'lottery_draw',
};

/**
 * POST /api/world/oracle
 *
 * Agent-to-Oracle interaction endpoint.
 * Agents send natural language queries, the Oracle (Gemini) interprets them,
 * and actionable responses are auto-executed through the world action system.
 *
 * Body: { agentAddress, message }
 *
 * Flow:
 *   1. Agent sends natural language message
 *   2. Forward to Oracle API (POST /api/oracle/chat)
 *   3. If Oracle returns an executable action → execute via world action system
 *   4. Log the interaction as a world event
 *   5. Return Oracle insight + action result
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const body = await req.json();
    const { agentAddress, message } = body;

    if (!agentAddress || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing agentAddress or message' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(agentAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Rate limit (uses action rate limit — Oracle queries count as actions)
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

    const sanitizedMessage = sanitizeInput(message, 1000);

    // Step 1: Query the Oracle
    const oracleRes = await fetch(`${APP_URL}/api/oracle/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip,
      },
      body: JSON.stringify({
        message: sanitizedMessage,
        userAddress: agentAddress,
      }),
    });

    const oracleData = await oracleRes.json();

    if (!oracleRes.ok || !oracleData.success) {
      return NextResponse.json({
        success: false,
        error: oracleData.error || 'Oracle query failed',
        oracle: oracleData,
      }, { status: oracleRes.status });
    }

    // If Oracle requires payment (Maps queries), inform the agent
    if (oracleData.requiresPayment) {
      return NextResponse.json({
        success: true,
        oracle: {
          requiresPayment: true,
          estimatedCost: oracleData.estimatedCost,
          message: oracleData.message,
        },
        actionExecuted: false,
        hint: 'Maps queries require payment. Re-send with confirmPayment: true to proceed, or ask a non-location question.',
      });
    }

    const oracleAction = oracleData.action;
    const agent = await getAgent(agentAddress);
    const agentName = agent?.name || agentAddress.slice(0, 10);

    // Step 2: Check if the Oracle action is executable in the world
    let actionResult: any = null;
    let worldActionExecuted = false;

    if (oracleAction?.type === 'execute' && oracleAction?.transaction) {
      // Oracle wants to execute a transaction (buy_music, buy_art, etc.)
      const funcName = oracleAction.transaction.function?.toLowerCase().trim();
      const worldAction = ORACLE_TO_WORLD_ACTION[funcName];

      if (worldAction && ACTION_MAP[worldAction]) {
        const params: Record<string, any> = {};

        // Extract params from Oracle response
        if (oracleAction.transaction.args?.length > 0) {
          params.tokenId = oracleAction.transaction.args[0];
        }

        // Execute via world action system
        try {
          const actionRes = await fetch(`${APP_URL}/api/world/action`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': ip,
            },
            body: JSON.stringify({
              agentAddress,
              action: worldAction,
              params,
            }),
          });

          actionResult = await actionRes.json();
          worldActionExecuted = actionResult.success === true;
        } catch (actionErr) {
          console.error('[World Oracle] Action execution error:', actionErr);
          actionResult = { success: false, error: 'Action execution failed' };
        }
      }
    } else if (oracleAction?.type === 'mint_passport') {
      // Passport minting via world action
      const params: Record<string, any> = {};
      if (oracleAction.passport?.countryCode) {
        params.countryCode = oracleAction.passport.countryCode;
      }

      try {
        const actionRes = await fetch(`${APP_URL}/api/world/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({
            agentAddress,
            action: 'mint_passport' as WorldActionType,
            params,
          }),
        });

        actionResult = await actionRes.json();
        worldActionExecuted = actionResult.success === true;
      } catch (actionErr) {
        console.error('[World Oracle] Passport action error:', actionErr);
        actionResult = { success: false, error: 'Passport minting failed' };
      }
    } else if (oracleAction?.type === 'lottery_buy') {
      // Lottery ticket purchase
      const params: Record<string, any> = {
        ticketCount: oracleAction.lottery?.ticketCount || 1,
      };

      try {
        const actionRes = await fetch(`${APP_URL}/api/world/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({
            agentAddress,
            action: 'lottery_buy' as WorldActionType,
            params,
          }),
        });

        actionResult = await actionRes.json();
        worldActionExecuted = actionResult.success === true;
      } catch (actionErr) {
        console.error('[World Oracle] Lottery buy error:', actionErr);
        actionResult = { success: false, error: 'Lottery ticket purchase failed' };
      }
    } else if (oracleAction?.type === 'lottery_draw') {
      // Trigger lottery draw
      try {
        const actionRes = await fetch(`${APP_URL}/api/world/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({
            agentAddress,
            action: 'lottery_draw' as WorldActionType,
            params: {},
          }),
        });

        actionResult = await actionRes.json();
        worldActionExecuted = actionResult.success === true;
      } catch (actionErr) {
        console.error('[World Oracle] Lottery draw error:', actionErr);
        actionResult = { success: false, error: 'Lottery draw trigger failed' };
      }
    }

    // Step 3: Log Oracle interaction as a world event
    const eventDescription = worldActionExecuted
      ? `Oracle → ${oracleAction?.type}: ${oracleAction?.message?.slice(0, 80) || 'action executed'}`
      : `Oracle query: "${sanitizedMessage.slice(0, 60)}${sanitizedMessage.length > 60 ? '...' : ''}"`;

    await addEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'action',
      agent: agentAddress,
      agentName,
      description: eventDescription,
      txHash: actionResult?.result?.txHash,
      timestamp: Date.now(),
    });

    // If a world action was executed, record it
    if (worldActionExecuted) {
      const toursEarned = actionResult?.result?.toursEarned || '0';
      await recordAgentAction(agentAddress, toursEarned);
    }

    return NextResponse.json({
      success: true,
      oracle: {
        type: oracleAction?.type,
        message: oracleAction?.message,
      },
      actionExecuted: worldActionExecuted,
      actionResult: actionResult
        ? {
            txHash: actionResult.result?.txHash,
            message: actionResult.result?.message,
            toursEarned: actionResult.result?.toursEarned,
          }
        : null,
    });
  } catch (err: any) {
    console.error('[World Oracle] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Oracle interaction failed' },
      { status: 500 }
    );
  }
}
