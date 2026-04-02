import { Redis } from '@upstash/redis';

/**
 * Telegram Radio Bridge
 *
 * Bridges the Live Radio system to Telegram by notifying subscribed users
 * when songs change. Called from the radio scheduler when a new song starts.
 *
 * Features:
 * - Fetches subscriber list from Redis
 * - Sends audio + song info to each subscriber via Telegram Bot API
 * - Handles rate limiting (Telegram allows 30 msg/sec to different chats)
 * - Auto-removes subscribers who have blocked the bot
 * - Graceful error handling per subscriber (one failure doesn't stop others)
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUBSCRIBERS_KEY = 'telegram-radio:subscribers';
const SUBSCRIBER_DATA_KEY = 'telegram-radio:subscriber-data';
const BOT_USERNAME = 'AI_RobotExpert_bot';

// Rate limit: Telegram allows ~30 messages per second to different chats
const RATE_LIMIT_BATCH_SIZE = 25;
const RATE_LIMIT_DELAY_MS = 1100; // Slightly over 1 second for safety

export interface RadioSong {
  tokenId: string;
  name: string;
  artist: string;
  artistAddress?: string;
  audioUrl: string;
  imageUrl: string;
  queuedBy: string;
  queuedByFid: number;
  startedAt: number;
  duration: number;
  isRandom: boolean;
}

interface NotifyResult {
  notified: number;
  failed: number;
  removed: number;
  total: number;
}

/**
 * Notify all Telegram subscribers that a new song is playing.
 *
 * This function is designed to be called non-blocking from the scheduler:
 *   notifyTelegramSubscribers(song).catch(err => console.error(...))
 *
 * @param song - The currently playing RadioSong
 * @returns NotifyResult with counts of notified/failed/removed subscribers
 */
export async function notifyTelegramSubscribers(song: RadioSong): Promise<NotifyResult> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[TelegramBridge] Skipping notification: TELEGRAM_BOT_TOKEN not set');
    return { notified: 0, failed: 0, removed: 0, total: 0 };
  }

  try {
    // Get all subscriber chat IDs
    const subscribers = await redis.smembers(SUBSCRIBERS_KEY) as string[];

    if (subscribers.length === 0) {
      return { notified: 0, failed: 0, removed: 0, total: 0 };
    }

    console.log(`[TelegramBridge] Notifying ${subscribers.length} subscribers: "${song.name}" by ${song.artist}`);

    let notified = 0;
    let failed = 0;
    let removed = 0;

    // Process in batches to respect Telegram rate limits
    for (let i = 0; i < subscribers.length; i += RATE_LIMIT_BATCH_SIZE) {
      const batch = subscribers.slice(i, i + RATE_LIMIT_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(chatId => sendSongNotification(chatId, song))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const chatId = batch[j];

        if (result.status === 'fulfilled') {
          notified++;
        } else {
          const errorMsg = result.reason?.message || String(result.reason);
          failed++;

          // Auto-cleanup: remove subscribers who blocked the bot or deleted their account
          if (shouldRemoveSubscriber(errorMsg)) {
            await redis.srem(SUBSCRIBERS_KEY, chatId);
            await redis.hdel(SUBSCRIBER_DATA_KEY, chatId);
            removed++;
            console.log(`[TelegramBridge] Removed inactive subscriber ${chatId}: ${errorMsg}`);
          } else {
            console.warn(`[TelegramBridge] Failed to notify ${chatId}: ${errorMsg}`);
          }
        }
      }

      // Delay between batches to respect rate limits
      if (i + RATE_LIMIT_BATCH_SIZE < subscribers.length) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }

    console.log(
      `[TelegramBridge] Notification complete: ${notified} notified, ${failed} failed, ${removed} removed (of ${subscribers.length} total)`
    );

    return {
      notified,
      failed,
      removed,
      total: subscribers.length,
    };
  } catch (error: any) {
    console.error('[TelegramBridge] notifyTelegramSubscribers error:', error.message);
    return { notified: 0, failed: 0, removed: 0, total: 0 };
  }
}

/**
 * Send a song notification to a single Telegram chat.
 * Attempts sendAudio first, falls back to sendPhoto, then sendMessage.
 */
async function sendSongNotification(chatId: string, song: RadioSong): Promise<void> {
  const caption = buildCaption(song);
  const plainCaption = buildPlainCaption(song);
  const keyboard = buildInlineKeyboard();

  // Strategy 1: Try sending as native audio (best UX - plays in Telegram)
  if (isDirectAudioUrl(song.audioUrl)) {
    try {
      const result = await telegramApiCall('sendAudio', {
        chat_id: chatId,
        audio: song.audioUrl,
        title: song.name,
        performer: song.artist || 'Unknown Artist',
        duration: song.duration > 0 ? song.duration : undefined,
        caption,
        parse_mode: 'MarkdownV2',
        thumbnail: song.imageUrl || undefined,
        reply_markup: keyboard,
      });

      if (result.ok) return;
    } catch {
      // Fall through to next strategy
    }
  }

  // Strategy 2: Send as photo with caption (good for cover art display)
  if (song.imageUrl) {
    try {
      const result = await telegramApiCall('sendPhoto', {
        chat_id: chatId,
        photo: song.imageUrl,
        caption,
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard,
      });

      if (result.ok) return;
    } catch {
      // Fall through to text-only
    }
  }

  // Strategy 3: Plain text message (always works)
  const result = await telegramApiCall('sendMessage', {
    chat_id: chatId,
    text: plainCaption,
    reply_markup: keyboard,
  });

  if (!result.ok) {
    throw new Error(`${result.error_code}: ${result.description}`);
  }
}

/**
 * Check if a URL points to a direct audio file that Telegram can play.
 */
function isDirectAudioUrl(url: string): boolean {
  if (!url) return false;

  // Common audio file extensions
  const audioExtensions = /\.(mp3|wav|ogg|m4a|flac|aac|opus)(\?.*)?$/i;
  if (audioExtensions.test(url)) return true;

  // IPFS and Arweave URLs often serve audio directly
  if (url.includes('ipfs.io') || url.includes('ipfs.') || url.includes('arweave.net')) {
    return true;
  }

  // Pinata, nft.storage, web3.storage
  if (url.includes('pinata.cloud') || url.includes('nft.storage') || url.includes('web3.storage')) {
    return true;
  }

  return false;
}

/**
 * Build MarkdownV2-formatted caption for the song notification.
 */
function buildCaption(song: RadioSong): string {
  const lines = [
    `🎵 *Now Playing on EmpowerTours Radio*`,
    ``,
    `*${escapeMarkdownV2(song.name)}*`,
    `by ${escapeMarkdownV2(song.artist || 'Unknown Artist')}`,
    ``,
  ];

  if (song.isRandom) {
    lines.push(`_Auto\\-selected from Music NFTs_`);
  } else if (song.queuedBy && song.queuedBy !== 'radio') {
    lines.push(`_Queued by ${escapeMarkdownV2(truncateAddr(song.queuedBy))}_`);
  }

  return lines.join('\n');
}

/**
 * Build plain text caption (no markdown, for fallback).
 */
function buildPlainCaption(song: RadioSong): string {
  const lines = [
    `🎵 Now Playing on EmpowerTours Radio`,
    ``,
    song.name,
    `by ${song.artist || 'Unknown Artist'}`,
    ``,
  ];

  if (song.isRandom) {
    lines.push(`Auto-selected from Music NFTs`);
  } else if (song.queuedBy && song.queuedBy !== 'radio') {
    lines.push(`Queued by ${truncateAddr(song.queuedBy)}`);
  }

  return lines.join('\n');
}

/**
 * Build inline keyboard for radio controls.
 * Buttons open the Mini App to relevant sections.
 */
function buildInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '📋 Queue',
          url: `https://t.me/${BOT_USERNAME}/radio?startapp=queue`,
        },
        {
          text: '🎙️ Voice Note',
          url: `https://t.me/${BOT_USERNAME}/radio?startapp=voice`,
        },
      ],
      [
        {
          text: '📊 Stats',
          url: `https://t.me/${BOT_USERNAME}/radio?startapp=stats`,
        },
        {
          text: '🏆 Leaderboard',
          url: `https://t.me/${BOT_USERNAME}/radio?startapp=leaderboard`,
        },
      ],
      [
        {
          text: '🔇 Unsubscribe',
          callback_data: 'radio_unsubscribe',
        },
      ],
    ],
  };
}

/**
 * Determine if a subscriber should be removed based on the Telegram API error.
 */
function shouldRemoveSubscriber(errorMessage: string): boolean {
  const removableErrors = [
    '403',                    // Bot was blocked by the user
    'Forbidden',              // User deleted account or blocked bot
    'chat not found',         // Chat no longer exists
    'bot was blocked',        // Explicit block
    'user is deactivated',    // Deactivated account
    'PEER_ID_INVALID',        // Invalid peer
    'bot was kicked',         // Bot removed from group
    'not enough rights',      // Bot lost permissions in group
  ];

  const lowerError = errorMessage.toLowerCase();
  return removableErrors.some(err => lowerError.includes(err.toLowerCase()));
}

/**
 * Make a Telegram Bot API call.
 */
async function telegramApiCall(method: string, params: Record<string, any>): Promise<any> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  return response.json();
}

/**
 * Escape special characters for Telegram MarkdownV2 format.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Truncate an Ethereum address for display.
 */
function truncateAddr(address: string): string {
  if (!address || address === 'radio') return 'Radio DJ';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Promise-based sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
