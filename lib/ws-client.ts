import { createPublicClient, webSocket, http, type PublicClient } from 'viem';
import { activeChain } from './pimlico/config';
import { env } from './env';

/**
 * Singleton WebSocket viem PublicClient for real-time event subscriptions.
 *
 * - One WS connection shared across all event watchers
 * - Exponential backoff reconnection (1s -> 2s -> 4s -> ... -> 30s max)
 * - Falls back to null after MAX_RETRIES so callers can use HTTP polling
 */

const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

let wsClient: PublicClient | null = null;
let connectionAttempts = 0;
let isConnecting = false;
let isFailed = false;

function createWsClient(): PublicClient | null {
  const wsUrl = env.MONAD_WS_RPC;
  if (!wsUrl || !wsUrl.startsWith('wss://')) {
    console.warn('[WsClient] Invalid or missing MONAD_WS_RPC:', wsUrl);
    return null;
  }

  try {
    const client = createPublicClient({
      chain: activeChain,
      transport: webSocket(wsUrl, {
        retryCount: 3,
        retryDelay: 1_000,
        keepAlive: true,
        reconnect: true,
        timeout: 10_000,
      }),
    });

    console.log('[WsClient] WebSocket client created for', activeChain.name);
    connectionAttempts = 0;
    isFailed = false;
    return client;
  } catch (error) {
    console.error('[WsClient] Failed to create WebSocket client:', error);
    return null;
  }
}

/**
 * Get the singleton WebSocket PublicClient.
 * Returns null if WS is unavailable after MAX_RETRIES.
 */
export function getWsClient(): PublicClient | null {
  if (isFailed) return null;
  if (wsClient) return wsClient;
  if (isConnecting) return null;

  isConnecting = true;
  wsClient = createWsClient();
  isConnecting = false;

  if (!wsClient) {
    connectionAttempts++;
    if (connectionAttempts >= MAX_RETRIES) {
      console.error(`[WsClient] Failed after ${MAX_RETRIES} attempts. Giving up — callers should fall back to HTTP polling.`);
      isFailed = true;
    }
  }

  return wsClient;
}

/**
 * Attempt to reconnect with exponential backoff.
 * Called by event-manager when a subscription drops.
 */
export async function reconnectWsClient(): Promise<PublicClient | null> {
  if (isFailed) {
    console.warn('[WsClient] Permanently failed. Call resetWsClient() to retry.');
    return null;
  }

  wsClient = null;
  connectionAttempts++;

  if (connectionAttempts > MAX_RETRIES) {
    console.error(`[WsClient] Exceeded ${MAX_RETRIES} reconnection attempts.`);
    isFailed = true;
    return null;
  }

  const backoff = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, connectionAttempts - 1),
    MAX_BACKOFF_MS,
  );
  console.log(`[WsClient] Reconnecting in ${backoff}ms (attempt ${connectionAttempts}/${MAX_RETRIES})`);

  await new Promise((resolve) => setTimeout(resolve, backoff));

  wsClient = createWsClient();
  return wsClient;
}

/**
 * Reset failure state so reconnection can be attempted again.
 */
export function resetWsClient(): void {
  wsClient = null;
  connectionAttempts = 0;
  isConnecting = false;
  isFailed = false;
  console.log('[WsClient] Reset — ready to reconnect.');
}

/**
 * Get the HTTP public client as a fallback.
 */
export function getHttpClient(): PublicClient {
  return createPublicClient({
    chain: activeChain,
    transport: http(env.MONAD_RPC),
  });
}
