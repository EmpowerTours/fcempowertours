import { NextRequest } from 'next/server';
import { redis } from '@/lib/redis';
import { addClient, removeClient, sendToClient } from '@/lib/sse-broadcaster';
import { initializeEventManager, isEventManagerActive } from '@/lib/event-manager';

/**
 * GET /api/live-radio/stream
 *
 * Server-Sent Events endpoint for real-time radio updates.
 * - Sends initial radio state immediately on connect
 * - Pushes updates as on-chain events arrive
 * - Heartbeat every 30s to keep the connection alive
 * - Client disconnects are handled via AbortSignal
 */

const RADIO_STATE_KEY = 'live-radio:state';
const RADIO_QUEUE_KEY = 'live-radio:queue';
const VOICE_NOTES_KEY = 'live-radio:voice-notes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Lazily initialize the event manager on first SSE connection
  if (!isEventManagerActive()) {
    // Fire and forget — don't block the SSE response
    initializeEventManager().catch((err) =>
      console.error('[SSE] Event manager init failed:', err),
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Register this client with the SSE broadcaster
      addClient(controller, ['live-radio']);

      // Send initial state immediately so the client doesn't have to wait
      try {
        const [state, queueRaw, voiceNotesRaw] = await Promise.all([
          redis.get(RADIO_STATE_KEY),
          redis.lrange(RADIO_QUEUE_KEY, 0, 20),
          redis.lrange(VOICE_NOTES_KEY, 0, 10),
        ]);

        const queue = queueRaw.map((item: any) =>
          typeof item === 'string' ? JSON.parse(item) : item,
        );
        const voiceNotes = voiceNotesRaw.map((item: any) =>
          typeof item === 'string' ? JSON.parse(item) : item,
        );

        sendToClient(controller, 'initial_state', {
          type: 'initial_state',
          state: state || {
            isLive: false,
            currentSong: null,
            currentVoiceNote: null,
            listenerCount: 0,
            lastUpdated: Date.now(),
            totalSongsPlayed: 0,
            totalVoiceNotesPlayed: 0,
          },
          queue,
          voiceNotes,
          wsConnected: isEventManagerActive(),
        });
      } catch (error) {
        console.error('[SSE] Failed to send initial state:', error);
        // Send a minimal state so the client knows we're connected
        sendToClient(controller, 'initial_state', {
          type: 'initial_state',
          state: null,
          queue: [],
          voiceNotes: [],
          wsConnected: false,
        });
      }

      // Clean up on client disconnect
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
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
