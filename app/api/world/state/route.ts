import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getAllAgents, getRecentEvents, getEconomyData } from '@/lib/world/state';
import { getTokenInfo } from '@/lib/world/token';
import {
  WorldRateLimits,
  WorldState,
  WorldActionType,
  ACTION_MAP,
  WORLD_ENTRY_FEE,
  WORLD_FEE_RECEIVER,
  TOURS_TOKEN,
  EMPTOURS_TOKEN,
} from '@/lib/world/types';

const AVAILABLE_ACTIONS: WorldActionType[] = Object.keys(ACTION_MAP) as WorldActionType[];

/**
 * GET /api/world/state
 *
 * Returns the full world state including economy data from Envio,
 * agent count, token price, and recent events.
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

    // Fetch data in parallel
    const [agents, economy, token, events] = await Promise.all([
      getAllAgents(),
      getEconomyData(),
      getTokenInfo(),
      getRecentEvents(20),
    ]);

    const now = Date.now();
    const activeThreshold = now - 5 * 60 * 1000; // Active in last 5 minutes
    const activeCount = agents.filter(
      (a) => a.lastActionAt > activeThreshold
    ).length;

    const state: WorldState = {
      name: 'EmpowerTours Agent World',
      description:
        'A persistent multi-agent world on Monad where agents buy music, queue radio, vote on DAO proposals, tip artists, and earn TOURS tokens.',
      chain: {
        id: 143,
        name: 'Monad',
        rpc: 'https://rpc.monad.xyz',
      },
      agents: {
        total: agents.length,
        active: activeCount,
      },
      economy,
      tokens: {
        tours: {
          address: TOURS_TOKEN,
          symbol: 'TOURS',
          role: 'Ecosystem reward token — earned by listeners and music buyers. Used for DAO governance (wrap to vTOURS). All payments and artist payouts are in WMON.',
        },
        emptours: token
          ? {
              address: token.address,
              symbol: token.symbol,
              role: 'Community token on nad.fun bonding curve — represents belief in the EmpowerTours Agent World ecosystem',
              price: token.price,
              marketCap: token.marketCap,
              graduated: token.graduated,
            }
          : null,
      },
      recentEvents: events,
      entryFee: `${WORLD_ENTRY_FEE} MON`,
      availableActions: AVAILABLE_ACTIONS,
      timestamp: now,
      // Agent onboarding info
      onboarding: {
        faucet: '/api/world/faucet',
        faucetDescription: 'Get 10 EMPTOURS by agreeing to contribute to the 3D Blender visualization',
        entryFeeReceiver: WORLD_FEE_RECEIVER,
        requiredToken: EMPTOURS_TOKEN,
        steps: [
          '1. GET /api/world/faucet - Read contributor agreement',
          '2. POST /api/world/faucet - Claim 10 EMPTOURS (agree to build 3D world)',
          '3. Send 1 MON to ' + WORLD_FEE_RECEIVER,
          '4. POST /api/world/enter with { address, name, txHash }',
          '5. POST /api/world/action to interact',
          '6. Contribute to /scripts/blender/ visualization',
        ],
        blenderRepo: 'https://github.com/anthropics/empowertours/tree/main/scripts/blender',
      },
    };

    return NextResponse.json({ success: true, state });
  } catch (err: any) {
    console.error('[World] State error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch world state' },
      { status: 500 }
    );
  }
}
