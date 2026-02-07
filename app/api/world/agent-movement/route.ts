import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import {
  REDIS_KEYS,
  ZONE_POSITIONS,
  type AgentMovementIntention,
  type WorldZoneTarget,
  type AgentMovementAction
} from '@/lib/world/types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Movement TTL in seconds (60 seconds) */
const MOVEMENT_TTL_SECONDS = 60;

/** Valid action types */
const VALID_ACTIONS: AgentMovementAction[] = ['walk_to', 'interact', 'idle', 'celebrate'];

/** Valid zone targets */
const VALID_TARGETS: WorldZoneTarget[] = Object.keys(ZONE_POSITIONS) as WorldZoneTarget[];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Clean up expired movements from Redis
 */
async function cleanExpiredMovements(): Promise<void> {
  const now = Date.now();
  const cutoff = now - MOVEMENT_TTL_SECONDS * 1000;

  const all = await redis.hgetall(REDIS_KEYS.agentMovements);
  if (!all || Object.keys(all).length === 0) return;

  const expiredKeys: string[] = [];

  for (const [agentId, data] of Object.entries(all)) {
    try {
      const movement = typeof data === 'string' ? JSON.parse(data) : data;
      if (movement.timestamp < cutoff) {
        expiredKeys.push(agentId);
      }
    } catch {
      expiredKeys.push(agentId);
    }
  }

  if (expiredKeys.length > 0) {
    await redis.hdel(REDIS_KEYS.agentMovements, ...expiredKeys);
  }
}

// ============================================================================
// POST /api/world/agent-movement
// Submit movement intention for an agent (called by AWS agent scripts)
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, agentName, action, target, reason } = body;

    // Validate required fields
    if (!agentId || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: agentId and action' },
        { status: 400 }
      );
    }

    // Validate action type
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // For walk_to and interact, target is required
    if ((action === 'walk_to' || action === 'interact') && !target) {
      return NextResponse.json(
        { success: false, error: `Target is required for action: ${action}` },
        { status: 400 }
      );
    }

    // Validate target if provided
    if (target && !VALID_TARGETS.includes(target)) {
      return NextResponse.json(
        { success: false, error: `Invalid target: ${target}. Valid: ${VALID_TARGETS.join(', ')}` },
        { status: 400 }
      );
    }

    // Create movement record
    const movement: AgentMovementIntention = {
      agentId: agentId.toLowerCase(),
      agentName: agentName || agentId.slice(0, 8),
      action,
      target: target || null,
      reason: reason || undefined,
      timestamp: Date.now(),
    };

    // Store in Redis
    await redis.hset(REDIS_KEYS.agentMovements, {
      [agentId.toLowerCase()]: JSON.stringify(movement),
    });

    console.log(`[AgentMovement] ${agentName || agentId} -> ${action} ${target || ''}`);

    return NextResponse.json({
      success: true,
      movement,
      position: target ? ZONE_POSITIONS[target as keyof typeof ZONE_POSITIONS] : ZONE_POSITIONS.center,
      message: `Movement recorded: ${action}${target ? ` to ${target}` : ''}`,
    });
  } catch (err: unknown) {
    console.error('[AgentMovement] POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to record movement intention' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/world/agent-movement
// Fetch current movement intentions (polled by 3D scene)
// ============================================================================

export async function GET() {
  try {
    // Clean expired movements first
    await cleanExpiredMovements();

    // Fetch all current movements
    const all = await redis.hgetall(REDIS_KEYS.agentMovements);

    if (!all || Object.keys(all).length === 0) {
      return NextResponse.json({
        success: true,
        movements: [],
        zones: ZONE_POSITIONS,
        ttlSeconds: MOVEMENT_TTL_SECONDS,
      });
    }

    // Parse movements
    const movements: AgentMovementIntention[] = [];
    const now = Date.now();

    for (const [, data] of Object.entries(all)) {
      try {
        const movement = typeof data === 'string' ? JSON.parse(data) : data;
        // Only include non-expired movements
        if (now - movement.timestamp <= MOVEMENT_TTL_SECONDS * 1000) {
          movements.push(movement as AgentMovementIntention);
        }
      } catch {
        // Skip invalid entries
      }
    }

    // Sort by timestamp (most recent first)
    movements.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      success: true,
      movements,
      zones: ZONE_POSITIONS,
      ttlSeconds: MOVEMENT_TTL_SECONDS,
      timestamp: now,
    });
  } catch (err: unknown) {
    console.error('[AgentMovement] GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent movements' },
      { status: 500 }
    );
  }
}
