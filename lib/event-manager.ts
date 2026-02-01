import { type WatchContractEventReturnType, formatEther, type Log } from 'viem';
import { getWsClient, reconnectWsClient } from './ws-client';
import { broadcast } from './sse-broadcaster';
import { redis } from './redis';
import { env } from './env';

/**
 * Event Manager — subscribes to on-chain contract events via WebSocket,
 * updates Redis state reactively, and broadcasts to SSE clients.
 *
 * Lazily initialized on first SSE client connection.
 */

// ── Redis Keys (must match app/api/live-radio/route.ts) ──────────────
const RADIO_STATE_KEY = 'live-radio:state';
const RADIO_QUEUE_KEY = 'live-radio:queue';
const VOICE_NOTES_KEY = 'live-radio:voice-notes';

// ── Contract Addresses ───────────────────────────────────────────────
const LIVE_RADIO_ADDRESS = (env.LIVE_RADIO || '0x042EDF80713e6822a891e4e8a0800c332B8200fd') as `0x${string}`;
const MUSIC_SUBSCRIPTION_ADDRESS = (env.MUSIC_SUBSCRIPTION || '0x5372aD0291a69c1EBc0BE2dc6DE9dab224045f19') as `0x${string}`;
const TOURS_REWARD_MANAGER_ADDRESS = (env.TOURS_REWARD_MANAGER || '0x7fff35BB27307806B92Fb1D1FBe52D168093eF87') as `0x${string}`;

// ── Event ABIs (extracted from compiled Foundry artifacts) ───────────

const liveRadioV3Abi = [
  {
    type: 'event',
    name: 'SongQueued',
    inputs: [
      { name: 'queueId', type: 'uint256', indexed: true },
      { name: 'masterTokenId', type: 'uint256', indexed: true },
      { name: 'queuedBy', type: 'address', indexed: true },
      { name: 'fid', type: 'uint256', indexed: false },
      { name: 'paidAmount', type: 'uint256', indexed: false },
      { name: 'tipAmount', type: 'uint256', indexed: false },
      { name: 'hadLicense', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SongPlayed',
    inputs: [
      { name: 'queueId', type: 'uint256', indexed: true },
      { name: 'masterTokenId', type: 'uint256', indexed: true },
      { name: 'artist', type: 'address', indexed: true },
      { name: 'artistPayout', type: 'uint256', indexed: false },
      { name: 'wasRandom', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VoiceNoteSubmitted',
    inputs: [
      { name: 'noteId', type: 'uint256', indexed: true },
      { name: 'submitter', type: 'address', indexed: true },
      { name: 'duration', type: 'uint256', indexed: false },
      { name: 'paidAmount', type: 'uint256', indexed: false },
      { name: 'isAd', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VoiceNotePlayed',
    inputs: [
      { name: 'noteId', type: 'uint256', indexed: true },
      { name: 'submitter', type: 'address', indexed: true },
      { name: 'rewardPaid', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TipReceived',
    inputs: [
      { name: 'masterTokenId', type: 'uint256', indexed: true },
      { name: 'artist', type: 'address', indexed: true },
      { name: 'tipper', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ListenerRewarded',
    inputs: [
      { name: 'listener', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'rewardType', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
] as const;

const musicSubscriptionV5Abi = [
  {
    type: 'event',
    name: 'Subscribed',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'userFid', type: 'uint256', indexed: true },
      { name: 'tier', type: 'uint8', indexed: false },
      { name: 'expiry', type: 'uint256', indexed: false },
      { name: 'paidAmount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PlayRecorded',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'masterTokenId', type: 'uint256', indexed: true },
      { name: 'duration', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;

const toursRewardManagerAbi = [
  {
    type: 'event',
    name: 'RewardDistributed',
    inputs: [
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'rewardType', type: 'uint8', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;

// ── Initialization State ─────────────────────────────────────────────

let initialized = false;
let initializing = false;
const unwatchers: WatchContractEventReturnType[] = [];

/**
 * Initialize all event listeners. Called lazily on first SSE connection.
 * Prevents double-init with a guard.
 */
export async function initializeEventManager(): Promise<boolean> {
  if (initialized || initializing) return initialized;
  initializing = true;

  console.log('[EventManager] Initializing event subscriptions...');

  const client = getWsClient();
  if (!client) {
    console.warn('[EventManager] No WebSocket client available. Events will not be streamed — clients will fall back to polling.');
    initializing = false;
    return false;
  }

  try {
    // ── LiveRadioV3 Events ─────────────────────────────────────────

    unwatchers.push(
      client.watchContractEvent({
        address: LIVE_RADIO_ADDRESS,
        abi: liveRadioV3Abi,
        eventName: 'SongQueued',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] SongQueued:', args.masterTokenId?.toString());

            // Re-fetch queue from Redis and broadcast fresh state
            const queue = await redis.lrange(RADIO_QUEUE_KEY, 0, 20);
            const parsedQueue = queue.map((item: any) =>
              typeof item === 'string' ? JSON.parse(item) : item,
            );

            broadcast('live-radio', 'queue_update', {
              type: 'song_queued',
              queue: parsedQueue,
              event: {
                queueId: args.queueId?.toString(),
                masterTokenId: args.masterTokenId?.toString(),
                queuedBy: args.queuedBy,
                fid: args.fid?.toString(),
                paidAmount: args.paidAmount ? formatEther(args.paidAmount) : '0',
                tipAmount: args.tipAmount ? formatEther(args.tipAmount) : '0',
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('SongQueued', error),
      }),
    );

    unwatchers.push(
      client.watchContractEvent({
        address: LIVE_RADIO_ADDRESS,
        abi: liveRadioV3Abi,
        eventName: 'SongPlayed',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] SongPlayed:', args.masterTokenId?.toString());

            // Fetch fresh state from Redis
            const state = await redis.get(RADIO_STATE_KEY);

            broadcast('live-radio', 'state_update', {
              type: 'song_played',
              state,
              event: {
                queueId: args.queueId?.toString(),
                masterTokenId: args.masterTokenId?.toString(),
                artist: args.artist,
                artistPayout: args.artistPayout ? formatEther(args.artistPayout) : '0',
                wasRandom: args.wasRandom,
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('SongPlayed', error),
      }),
    );

    unwatchers.push(
      client.watchContractEvent({
        address: LIVE_RADIO_ADDRESS,
        abi: liveRadioV3Abi,
        eventName: 'VoiceNoteSubmitted',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] VoiceNoteSubmitted:', args.noteId?.toString());

            const notes = await redis.lrange(VOICE_NOTES_KEY, 0, 10);
            const parsedNotes = notes.map((item: any) =>
              typeof item === 'string' ? JSON.parse(item) : item,
            );

            broadcast('live-radio', 'voice_notes_update', {
              type: 'voice_note_submitted',
              voiceNotes: parsedNotes,
              event: {
                noteId: args.noteId?.toString(),
                submitter: args.submitter,
                duration: args.duration?.toString(),
                paidAmount: args.paidAmount ? formatEther(args.paidAmount) : '0',
                isAd: args.isAd,
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('VoiceNoteSubmitted', error),
      }),
    );

    unwatchers.push(
      client.watchContractEvent({
        address: LIVE_RADIO_ADDRESS,
        abi: liveRadioV3Abi,
        eventName: 'VoiceNotePlayed',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] VoiceNotePlayed:', args.noteId?.toString());

            broadcast('live-radio', 'voice_note_played', {
              type: 'voice_note_played',
              event: {
                noteId: args.noteId?.toString(),
                submitter: args.submitter,
                rewardPaid: args.rewardPaid ? formatEther(args.rewardPaid) : '0',
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('VoiceNotePlayed', error),
      }),
    );

    unwatchers.push(
      client.watchContractEvent({
        address: LIVE_RADIO_ADDRESS,
        abi: liveRadioV3Abi,
        eventName: 'TipReceived',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] TipReceived:', args.amount ? formatEther(args.amount) : '0');

            broadcast('live-radio', 'tip_received', {
              type: 'tip_received',
              event: {
                masterTokenId: args.masterTokenId?.toString(),
                artist: args.artist,
                tipper: args.tipper,
                amount: args.amount ? formatEther(args.amount) : '0',
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('TipReceived', error),
      }),
    );

    unwatchers.push(
      client.watchContractEvent({
        address: LIVE_RADIO_ADDRESS,
        abi: liveRadioV3Abi,
        eventName: 'ListenerRewarded',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] ListenerRewarded:', args.listener);

            broadcast('live-radio', 'listener_rewarded', {
              type: 'listener_rewarded',
              event: {
                listener: args.listener,
                amount: args.amount ? formatEther(args.amount) : '0',
                rewardType: args.rewardType,
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('ListenerRewarded', error),
      }),
    );

    // ── MusicSubscriptionV5 Events ─────────────────────────────────

    unwatchers.push(
      client.watchContractEvent({
        address: MUSIC_SUBSCRIPTION_ADDRESS,
        abi: musicSubscriptionV5Abi,
        eventName: 'Subscribed',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] Subscribed:', args.user);

            broadcast('live-radio', 'subscription', {
              type: 'new_subscriber',
              event: {
                user: args.user,
                userFid: args.userFid?.toString(),
                tier: args.tier,
                expiry: args.expiry?.toString(),
                paidAmount: args.paidAmount ? formatEther(args.paidAmount) : '0',
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('Subscribed', error),
      }),
    );

    unwatchers.push(
      client.watchContractEvent({
        address: MUSIC_SUBSCRIPTION_ADDRESS,
        abi: musicSubscriptionV5Abi,
        eventName: 'PlayRecorded',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;

            broadcast('live-radio', 'play_recorded', {
              type: 'play_recorded',
              event: {
                user: args.user,
                masterTokenId: args.masterTokenId?.toString(),
                duration: args.duration?.toString(),
                timestamp: args.timestamp?.toString(),
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('PlayRecorded', error),
      }),
    );

    // ── ToursRewardManager Events ──────────────────────────────────

    unwatchers.push(
      client.watchContractEvent({
        address: TOURS_REWARD_MANAGER_ADDRESS,
        abi: toursRewardManagerAbi,
        eventName: 'RewardDistributed',
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args;
            console.log('[EventManager] RewardDistributed:', args.recipient);

            broadcast('live-radio', 'reward_distributed', {
              type: 'reward_distributed',
              event: {
                recipient: args.recipient,
                rewardType: args.rewardType,
                amount: args.amount ? formatEther(args.amount) : '0',
              },
            });
          }
        },
        onError: (error) => handleSubscriptionError('RewardDistributed', error),
      }),
    );

    initialized = true;
    initializing = false;
    console.log(`[EventManager] Subscribed to ${unwatchers.length} event watchers across 3 contracts.`);
    return true;
  } catch (error) {
    console.error('[EventManager] Failed to initialize:', error);
    initializing = false;
    return false;
  }
}

/**
 * Handle subscription errors — attempt reconnection.
 */
async function handleSubscriptionError(eventName: string, error: Error): Promise<void> {
  console.error(`[EventManager] ${eventName} subscription error:`, error.message);

  // Attempt to reconnect
  const client = await reconnectWsClient();
  if (client) {
    console.log(`[EventManager] Reconnected after ${eventName} error. Restarting subscriptions...`);
    stopEventListeners();
    initialized = false;
    await initializeEventManager();
  } else {
    console.error('[EventManager] Reconnection failed. SSE clients will fall back to polling.');
  }
}

/**
 * Stop all event listeners and clean up.
 */
export function stopEventListeners(): void {
  for (const unwatch of unwatchers) {
    try {
      unwatch();
    } catch {
      // Already cleaned up
    }
  }
  unwatchers.length = 0;
  initialized = false;
  initializing = false;
  console.log('[EventManager] All event listeners stopped.');
}

/**
 * Check if the event manager is currently active.
 */
export function isEventManagerActive(): boolean {
  return initialized;
}

/**
 * Broadcast a manual update (called from API routes when Redis is updated directly).
 * This ensures SSE clients get updates even when state changes come from
 * API requests (like queue_song, next_song, heartbeat) rather than on-chain events.
 */
export function broadcastRadioUpdate(eventType: string, data: Record<string, unknown>): void {
  broadcast('live-radio', eventType, data);
}
