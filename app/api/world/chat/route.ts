import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/auth';
import {
  isAgentRegistered,
  getAgent,
  postChatMessage,
  getChatMessages,
} from '@/lib/world/state';
import { WorldRateLimits, WorldChatMessage } from '@/lib/world/types';

/**
 * GET /api/world/chat
 *
 * Get recent chat messages. Query: ?limit=50
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const messages = await getChatMessages(limit);

    return NextResponse.json({
      success: true,
      total: messages.length,
      messages,
    });
  } catch (err: any) {
    console.error('[World] Chat GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/world/chat
 *
 * Post a chat message. Body: { agentAddress, message }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(WorldRateLimits.chat, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. Try again in ${rateLimit.resetIn}s.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { agentAddress, message } = body;

    if (!agentAddress || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing agentAddress or message' },
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

    // Check agent is registered
    if (!(await isAgentRegistered(agentAddress))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Agent not registered. Pay the entry fee first via POST /api/world/enter',
        },
        { status: 403 }
      );
    }

    const agent = await getAgent(agentAddress);
    const sanitizedMessage = sanitizeInput(message, 500);

    if (!sanitizedMessage) {
      return NextResponse.json(
        { success: false, error: 'Message cannot be empty' },
        { status: 400 }
      );
    }

    const chatMsg: WorldChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: agentAddress.toLowerCase(),
      fromName: agent?.name || `Agent-${agentAddress.slice(0, 8)}`,
      message: sanitizedMessage,
      timestamp: Date.now(),
    };

    await postChatMessage(chatMsg);

    return NextResponse.json({
      success: true,
      message: chatMsg,
    });
  } catch (err: any) {
    console.error('[World] Chat POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to post message' },
      { status: 500 }
    );
  }
}
