/**
 * SSE Broadcaster — manages connected Server-Sent Events clients
 * and broadcasts real-time updates to all of them.
 *
 * Channels allow filtering (e.g. 'live-radio', 'dashboard').
 * Heartbeat every 30s keeps connections alive through proxies/load balancers.
 */

type SSEController = ReadableStreamDefaultController<Uint8Array>;

interface ConnectedClient {
  controller: SSEController;
  channels: Set<string>;
  connectedAt: number;
}

const clients = new Map<SSEController, ConnectedClient>();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

const encoder = new TextEncoder();

function startHeartbeat() {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    const deadClients: SSEController[] = [];

    for (const [controller, client] of clients) {
      try {
        controller.enqueue(encoder.encode(`: heartbeat ${now}\n\n`));
      } catch {
        deadClients.push(controller);
      }
    }

    for (const controller of deadClients) {
      clients.delete(controller);
    }

    if (clients.size === 0 && heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }, 30_000);
}

/**
 * Register a new SSE client on the given channels.
 */
export function addClient(controller: SSEController, channels: string[] = ['live-radio']): void {
  clients.set(controller, {
    controller,
    channels: new Set(channels),
    connectedAt: Date.now(),
  });
  startHeartbeat();
  console.log(`[SSE] Client connected (total: ${clients.size}) channels: [${channels.join(', ')}]`);
}

/**
 * Remove a disconnected SSE client.
 */
export function removeClient(controller: SSEController): void {
  clients.delete(controller);
  console.log(`[SSE] Client disconnected (total: ${clients.size})`);

  if (clients.size === 0 && heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Broadcast an event to all clients subscribed to the given channel.
 *
 * Sends as SSE format:
 *   event: <eventType>\n
 *   data: <JSON>\n\n
 */
export function broadcast(channel: string, eventType: string, data: Record<string, unknown>): void {
  const payload = encoder.encode(
    `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
  );

  const deadClients: SSEController[] = [];

  for (const [controller, client] of clients) {
    if (!client.channels.has(channel)) continue;
    try {
      controller.enqueue(payload);
    } catch {
      deadClients.push(controller);
    }
  }

  for (const controller of deadClients) {
    clients.delete(controller);
  }
}

/**
 * Send a message to a specific client (e.g. initial state on connect).
 */
export function sendToClient(
  controller: SSEController,
  eventType: string,
  data: Record<string, unknown>,
): void {
  try {
    const payload = encoder.encode(
      `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
    );
    controller.enqueue(payload);
  } catch {
    clients.delete(controller);
  }
}

/**
 * Get the number of connected SSE clients.
 */
export function getClientCount(): number {
  return clients.size;
}
