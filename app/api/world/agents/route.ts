import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getAllAgents, getAgent } from '@/lib/world/state';
import { WorldRateLimits } from '@/lib/world/types';

/**
 * GET /api/world/agents
 *
 * List all registered agents, or get a specific agent by ?address=0x...
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
    const address = searchParams.get('address');

    if (address) {
      // Get specific agent
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json(
          { success: false, error: 'Invalid address format' },
          { status: 400 }
        );
      }

      const agent = await getAgent(address);
      if (!agent) {
        return NextResponse.json(
          { success: false, error: 'Agent not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, agent });
    }

    // List all agents
    const agents = await getAllAgents();

    return NextResponse.json({
      success: true,
      total: agents.length,
      agents,
    });
  } catch (err: any) {
    console.error('[World] Agents error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
