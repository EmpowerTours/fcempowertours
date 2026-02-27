import { NextRequest } from 'next/server';
import { redis } from '@/lib/redis';
import { addClient, removeClient, sendToClient } from '@/lib/sse-broadcaster';
import { verifyApiKey, getVenuePlaybackState, getVenueQueue, VENUE_KEYS } from '@/lib/venue';

/**
 * GET /api/venue/[venueId]/stream?key=X
 *
 * Server-Sent Events endpoint for real-time venue player updates.
 * Auth via API key in query param.
 *
 * Events: initial_state, state_update, queue_update
 * Heartbeat every 30s (handled by sse-broadcaster)
 */

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  // Authenticate via query param
  const url = new URL(req.url);
  const apiKey = url.searchParams.get('key');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key required (?key=X)' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const valid = await verifyApiKey(redis, venueId, apiKey);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Register client on venue-specific channel
      addClient(controller, [`venue:${venueId}`]);

      // Send initial state
      try {
        const [state, queue] = await Promise.all([
          getVenuePlaybackState(redis, venueId),
          getVenueQueue(redis, venueId),
        ]);

        sendToClient(controller, 'initial_state', {
          type: 'initial_state',
          state,
          queue,
        });
      } catch (error) {
        console.error(`[VenueSSE] Failed to send initial state for ${venueId}:`, error);
        sendToClient(controller, 'initial_state', {
          type: 'initial_state',
          state: null,
          queue: [],
        });
      }

      // Clean up on disconnect
      req.signal.addEventListener('abort', () => {
        removeClient(controller);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
