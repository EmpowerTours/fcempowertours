import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * Telegram Radio Bridge API
 *
 * Manages subscriptions for Telegram users who want to receive
 * radio audio directly in their chat via the Telegram bot.
 *
 * POST ?action=subscribe   - Subscribe to radio audio in Telegram chat
 * POST ?action=unsubscribe - Stop receiving audio
 * GET  ?action=status      - Get subscription status
 * POST ?action=notify_song_change - Notify all subscribers of new song (called by scheduler)
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const SUBSCRIBERS_KEY = 'telegram-radio:subscribers';
const SUBSCRIBER_DATA_KEY = 'telegram-radio:subscriber-data';
const KEEPER_SECRET = process.env.KEEPER_SECRET || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

interface TelegramSubscriber {
  telegramChatId: string;
  telegramUserId: string;
  subscribedAt: number;
  username?: string;
  firstName?: string;
}

interface RadioSong {
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

// ── POST Handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const body = await req.json();

    // ── Subscribe ──────────────────────────────────────────────────────
    if (action === 'subscribe') {
      const { telegramChatId, telegramUserId, username, firstName } = body;

      if (!telegramChatId || !telegramUserId) {
        return NextResponse.json(
          { success: false, error: 'telegramChatId and telegramUserId are required' },
          { status: 400 }
        );
      }

      const chatIdStr = String(telegramChatId);
      const userIdStr = String(telegramUserId);

      // Add to subscriber set (chatId as member)
      await redis.sadd(SUBSCRIBERS_KEY, chatIdStr);

      // Store subscriber metadata
      const subscriber: TelegramSubscriber = {
        telegramChatId: chatIdStr,
        telegramUserId: userIdStr,
        subscribedAt: Date.now(),
        username,
        firstName,
      };
      await redis.hset(SUBSCRIBER_DATA_KEY, { [chatIdStr]: JSON.stringify(subscriber) });

      console.log(`[TelegramRadio] User ${userIdStr} subscribed (chat: ${chatIdStr})`);

      // Fetch current radio state to return
      const radioState = await redis.get('live-radio:state');
      let currentSong = null;
      if (radioState && typeof radioState === 'object') {
        currentSong = (radioState as any).currentSong || null;
      }

      return NextResponse.json({
        success: true,
        message: 'Subscribed to radio! You will receive songs in this chat.',
        subscribed: true,
        currentSong,
      });
    }

    // ── Unsubscribe ────────────────────────────────────────────────────
    if (action === 'unsubscribe') {
      const { telegramChatId, telegramUserId } = body;

      if (!telegramChatId && !telegramUserId) {
        return NextResponse.json(
          { success: false, error: 'telegramChatId or telegramUserId required' },
          { status: 400 }
        );
      }

      const chatIdStr = String(telegramChatId || telegramUserId);

      // Remove from subscriber set
      await redis.srem(SUBSCRIBERS_KEY, chatIdStr);

      // Remove subscriber data
      await redis.hdel(SUBSCRIBER_DATA_KEY, chatIdStr);

      console.log(`[TelegramRadio] Chat ${chatIdStr} unsubscribed`);

      return NextResponse.json({
        success: true,
        message: 'Unsubscribed from radio. You will no longer receive songs.',
        subscribed: false,
      });
    }

    // ── Notify Song Change (called by scheduler/bridge) ────────────────
    if (action === 'notify_song_change') {
      // Verify this is called internally (scheduler secret)
      const { secret, song } = body;

      if (KEEPER_SECRET && secret !== KEEPER_SECRET) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }

      if (!song) {
        return NextResponse.json(
          { success: false, error: 'Song data required' },
          { status: 400 }
        );
      }

      // Get all subscribers
      const subscribers = await redis.smembers(SUBSCRIBERS_KEY) as string[];

      if (subscribers.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No subscribers to notify',
          notified: 0,
        });
      }

      console.log(`[TelegramRadio] Notifying ${subscribers.length} subscribers of song change: ${song.name}`);

      // Send to webhook for bot to distribute audio
      let notified = 0;
      let failed = 0;

      // Process subscribers in batches to respect Telegram rate limits (30 msg/sec)
      const BATCH_SIZE = 25;
      for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
        const batch = subscribers.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (chatId) => {
          try {
            await sendSongToChat(chatId, song as RadioSong);
            notified++;
          } catch (err: any) {
            console.error(`[TelegramRadio] Failed to send to chat ${chatId}:`, err.message);
            failed++;

            // If bot was blocked or chat not found, remove subscriber
            if (err.message?.includes('403') || err.message?.includes('chat not found')) {
              await redis.srem(SUBSCRIBERS_KEY, chatId);
              await redis.hdel(SUBSCRIBER_DATA_KEY, chatId);
              console.log(`[TelegramRadio] Removed inactive subscriber: ${chatId}`);
            }
          }
        });

        await Promise.all(promises);

        // Small delay between batches to respect rate limits
        if (i + BATCH_SIZE < subscribers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`[TelegramRadio] Notified ${notified}/${subscribers.length} subscribers (${failed} failed)`);

      return NextResponse.json({
        success: true,
        notified,
        failed,
        total: subscribers.length,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action. Use: subscribe, unsubscribe, notify_song_change' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[TelegramRadio] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// ── GET Handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // ── Subscription Status ────────────────────────────────────────────
    if (action === 'status') {
      const telegramUserId = searchParams.get('telegramUserId');
      const telegramChatId = searchParams.get('telegramChatId');

      const checkId = telegramChatId || telegramUserId;
      if (!checkId) {
        return NextResponse.json(
          { success: false, error: 'telegramUserId or telegramChatId required' },
          { status: 400 }
        );
      }

      const isMember = await redis.sismember(SUBSCRIBERS_KEY, String(checkId));

      // Get subscriber data if subscribed
      let subscriberData: TelegramSubscriber | null = null;
      if (isMember) {
        const raw = await redis.hget(SUBSCRIBER_DATA_KEY, String(checkId));
        if (raw) {
          subscriberData = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
        }
      }

      // Get total subscriber count
      const totalSubscribers = await redis.scard(SUBSCRIBERS_KEY);

      return NextResponse.json({
        success: true,
        subscribed: Boolean(isMember),
        subscriber: subscriberData,
        totalSubscribers,
      });
    }

    // ── List Subscribers (admin) ───────────────────────────────────────
    if (action === 'subscribers') {
      const secret = searchParams.get('secret');
      if (KEEPER_SECRET && secret !== KEEPER_SECRET) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const subscriberIds = await redis.smembers(SUBSCRIBERS_KEY) as string[];
      const totalSubscribers = subscriberIds.length;

      return NextResponse.json({
        success: true,
        totalSubscribers,
        subscribers: subscriberIds,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Telegram Radio Bridge API',
      endpoints: {
        'POST ?action=subscribe': 'Subscribe to radio audio',
        'POST ?action=unsubscribe': 'Unsubscribe from radio audio',
        'POST ?action=notify_song_change': 'Notify subscribers of new song',
        'GET ?action=status': 'Check subscription status',
        'GET ?action=subscribers': 'List all subscribers (admin)',
      },
    });
  } catch (error: any) {
    console.error('[TelegramRadio] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// ── Telegram Bot API Helpers ─────────────────────────────────────────────

/**
 * Send a song to a Telegram chat via Bot API sendAudio.
 * Includes inline keyboard for radio controls.
 */
async function sendSongToChat(chatId: string, song: RadioSong): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  const BOT_USERNAME = 'AI_RobotExpert_bot';
  const MINI_APP_URL = `https://t.me/${BOT_USERNAME}/radio`;

  // Build inline keyboard
  const inlineKeyboard = {
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

  // Caption with song info
  const caption = [
    `🎵 *Now Playing on EmpowerTours Radio*`,
    ``,
    `*${escapeMarkdown(song.name)}*`,
    `by ${escapeMarkdown(song.artist || 'Unknown Artist')}`,
    ``,
    song.isRandom ? `_Auto-selected from Music NFTs_` : `_Queued by ${truncateAddr(song.queuedBy)}_`,
  ].join('\n');

  // Try sending as audio first (if URL is a direct audio file)
  try {
    const audioUrl = song.audioUrl;

    // Check if the URL looks like a direct audio file
    const isDirectAudio = audioUrl.match(/\.(mp3|wav|ogg|m4a|flac)(\?.*)?$/i) ||
      audioUrl.includes('ipfs') ||
      audioUrl.includes('arweave');

    if (isDirectAudio) {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAudio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          audio: audioUrl,
          title: song.name,
          performer: song.artist || 'Unknown Artist',
          caption,
          parse_mode: 'MarkdownV2',
          thumbnail: song.imageUrl || undefined,
          reply_markup: inlineKeyboard,
        }),
      });

      const result = await response.json();
      if (result.ok) return;

      // If sendAudio fails, fall through to sendMessage with photo
      console.warn(`[TelegramRadio] sendAudio failed for chat ${chatId}, falling back to message:`, result.description);
    }
  } catch (err) {
    // Fall through to message fallback
  }

  // Fallback: Send as a message with cover art photo
  if (song.imageUrl) {
    try {
      const photoResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: song.imageUrl,
          caption,
          parse_mode: 'MarkdownV2',
          reply_markup: inlineKeyboard,
        }),
      });

      const photoResult = await photoResponse.json();
      if (photoResult.ok) return;
    } catch {
      // Fall through to text-only message
    }
  }

  // Final fallback: Plain text message
  const plainCaption = [
    `🎵 Now Playing on EmpowerTours Radio`,
    ``,
    `${song.name}`,
    `by ${song.artist || 'Unknown Artist'}`,
    ``,
    song.isRandom ? `Auto-selected from Music NFTs` : `Queued by ${truncateAddr(song.queuedBy)}`,
  ].join('\n');

  const msgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: plainCaption,
      reply_markup: inlineKeyboard,
    }),
  });

  const msgResult = await msgResponse.json();
  if (!msgResult.ok) {
    throw new Error(`Telegram API error: ${msgResult.error_code} ${msgResult.description}`);
  }
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Truncate an address for display
 */
function truncateAddr(address: string): string {
  if (!address || address === 'radio') return 'Radio DJ';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
