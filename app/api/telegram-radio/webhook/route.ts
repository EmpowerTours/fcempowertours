import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * Telegram Radio Webhook Handler
 *
 * Receives Telegram Bot webhook updates (callback queries, messages)
 * and handles radio-related interactions:
 *
 * - Callback queries from inline keyboards (unsubscribe, etc.)
 * - /radio command to subscribe
 * - /stop_radio command to unsubscribe
 * - /now_playing command to get current song info
 *
 * This webhook should be registered with Telegram Bot API:
 * POST https://api.telegram.org/bot<token>/setWebhook
 *   { "url": "https://yourdomain.com/api/telegram-radio/webhook" }
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUBSCRIBERS_KEY = 'telegram-radio:subscribers';
const SUBSCRIBER_DATA_KEY = 'telegram-radio:subscriber-data';
const RADIO_STATE_KEY = 'live-radio:state';
const BOT_USERNAME = 'AI_RobotExpert_bot';

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    is_bot: boolean;
  };
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
  };
  date: number;
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number;
    };
  };
  data?: string;
}

interface RadioState {
  isLive: boolean;
  currentSong: {
    tokenId: string;
    name: string;
    artist: string;
    audioUrl: string;
    imageUrl: string;
    queuedBy: string;
    startedAt: number;
    duration: number;
    isRandom: boolean;
  } | null;
  currentVoiceNote: {
    id: string;
    username?: string;
    duration: number;
    isAd: boolean;
  } | null;
  listenerCount: number;
  totalSongsPlayed: number;
}

// ── POST Handler (Webhook) ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const update: TelegramUpdate = await req.json();

    // Handle callback queries (inline keyboard button presses)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    // Handle messages (commands)
    if (update.message?.text) {
      await handleMessage(update.message);
      return NextResponse.json({ ok: true });
    }

    // Acknowledge unhandled updates
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[TelegramRadioWebhook] Error:', error);
    // Always return 200 to Telegram to prevent retries
    return NextResponse.json({ ok: true });
  }
}

// ── Callback Query Handler ───────────────────────────────────────────────

async function handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const chatId = query.message?.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!chatId || !data) {
    await answerCallbackQuery(query.id, 'Unknown action');
    return;
  }

  switch (data) {
    case 'radio_unsubscribe': {
      const chatIdStr = String(chatId);
      await redis.srem(SUBSCRIBERS_KEY, chatIdStr);
      await redis.hdel(SUBSCRIBER_DATA_KEY, chatIdStr);

      await answerCallbackQuery(query.id, 'Unsubscribed from radio');

      // Edit the message to reflect unsubscribed state
      await sendTelegramRequest('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎧 Re-subscribe',
                callback_data: 'radio_subscribe',
              },
            ],
          ],
        },
      });

      console.log(`[TelegramRadioWebhook] User ${userId} unsubscribed from chat ${chatId}`);
      break;
    }

    case 'radio_subscribe': {
      const chatIdStr = String(chatId);
      await redis.sadd(SUBSCRIBERS_KEY, chatIdStr);
      await redis.hset(SUBSCRIBER_DATA_KEY, {
        [chatIdStr]: JSON.stringify({
          telegramChatId: chatIdStr,
          telegramUserId: String(userId),
          subscribedAt: Date.now(),
          username: query.from.username,
          firstName: query.from.first_name,
        }),
      });

      await answerCallbackQuery(query.id, 'Subscribed to radio! Songs will be sent here.');

      // Update the inline keyboard
      if (query.message?.message_id) {
        await sendTelegramRequest('editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: buildRadioKeyboard(),
        });
      }

      console.log(`[TelegramRadioWebhook] User ${userId} re-subscribed in chat ${chatId}`);
      break;
    }

    case 'radio_now_playing': {
      const state = await redis.get<RadioState>(RADIO_STATE_KEY);
      if (state?.currentSong) {
        await answerCallbackQuery(
          query.id,
          `Now: ${state.currentSong.name} by ${state.currentSong.artist}`,
          true
        );
      } else {
        await answerCallbackQuery(query.id, 'No song currently playing', true);
      }
      break;
    }

    default:
      await answerCallbackQuery(query.id, 'Unknown action');
  }
}

// ── Message Handler ──────────────────────────────────────────────────────

async function handleMessage(message: TelegramMessage): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const text = message.text?.trim().toLowerCase() || '';
  const chatId = message.chat.id;
  const userId = message.from.id;
  const username = message.from.username;
  const firstName = message.from.first_name;

  // /start - Welcome message with climbing + radio features
  if (text === '/start') {
    await sendTelegramMessage(chatId, [
      `🧗 *Welcome to EmpowerTours\\!*`,
      ``,
      `Discover and share climbing locations on Monad\\.`,
      ``,
      `*🪨 Climbing:*`,
      `/connectwallet \\- Link your wallet`,
      `/findaclimb \\- Browse climbs`,
      `/buildaclimb \\- Create your own \\(35 WMON\\)`,
      `/mypurchases \\- View purchased climbs`,
      `/mynfts \\- View your NFTs`,
      `/balance \\- Check wallet balance`,
      ``,
      `*📻 Radio:*`,
      `/radio \\- Subscribe to live radio`,
      `/now\\_playing \\- See what's playing`,
      `/stop\\_radio \\- Unsubscribe`,
      ``,
      `Run /tutorial for a full guide or /help for all commands\\.`,
      `Join us: [EmpowerTours Chat](https://t.me/empowertourschat)`,
    ].join('\n'), 'MarkdownV2', {
      inline_keyboard: [
        [
          {
            text: '🧗 Find a Climb',
            url: `https://t.me/${BOT_USERNAME}`,
          },
          {
            text: '🎧 Subscribe to Radio',
            callback_data: 'radio_subscribe',
          },
        ],
      ],
    });
    return;
  }

  // /radio or /start radio - Subscribe to radio
  if (text === '/radio' || text === '/start radio' || text.startsWith('/start radio')) {
    const chatIdStr = String(chatId);
    const isAlreadySubscribed = await redis.sismember(SUBSCRIBERS_KEY, chatIdStr);

    if (isAlreadySubscribed) {
      await sendTelegramMessage(chatId, [
        `🎧 *You're already subscribed to EmpowerTours Radio\\!*`,
        ``,
        `Songs are being sent to this chat as they play\\.`,
        `Use /stop\\_radio to unsubscribe\\.`,
      ].join('\n'), 'MarkdownV2', buildRadioKeyboard());
      return;
    }

    // Subscribe
    await redis.sadd(SUBSCRIBERS_KEY, chatIdStr);
    await redis.hset(SUBSCRIBER_DATA_KEY, {
      [chatIdStr]: JSON.stringify({
        telegramChatId: chatIdStr,
        telegramUserId: String(userId),
        subscribedAt: Date.now(),
        username,
        firstName,
      }),
    });

    // Get current state
    const state = await redis.get<RadioState>(RADIO_STATE_KEY);
    const currentInfo = state?.currentSong
      ? `\n\n🎵 *Currently Playing:* ${escapeMarkdown(state.currentSong.name)} by ${escapeMarkdown(state.currentSong.artist)}`
      : '\n\n_Radio is warming up\\.\\.\\._';

    await sendTelegramMessage(chatId, [
      `📻 *Welcome to EmpowerTours Radio\\!*`,
      ``,
      `You're now subscribed\\! Songs will be sent directly to this chat as they play on the radio\\.`,
      currentInfo,
      ``,
      `*Commands:*`,
      `/now\\_playing \\- See what's playing`,
      `/stop\\_radio \\- Unsubscribe`,
    ].join('\n'), 'MarkdownV2', buildRadioKeyboard());

    console.log(`[TelegramRadioWebhook] User ${userId} (${username}) subscribed via /radio`);
    return;
  }

  // /stop_radio - Unsubscribe
  if (text === '/stop_radio' || text === '/stopradio') {
    const chatIdStr = String(chatId);
    await redis.srem(SUBSCRIBERS_KEY, chatIdStr);
    await redis.hdel(SUBSCRIBER_DATA_KEY, chatIdStr);

    await sendTelegramMessage(chatId, [
      `🔇 *Unsubscribed from EmpowerTours Radio*`,
      ``,
      `You will no longer receive songs in this chat\\.`,
      `Use /radio to subscribe again anytime\\!`,
    ].join('\n'), 'MarkdownV2', {
      inline_keyboard: [
        [
          {
            text: '🎧 Re-subscribe',
            callback_data: 'radio_subscribe',
          },
        ],
      ],
    });

    console.log(`[TelegramRadioWebhook] User ${userId} unsubscribed via /stop_radio`);
    return;
  }

  // /now_playing - Get current song info
  if (text === '/now_playing' || text === '/nowplaying' || text === '/np') {
    const state = await redis.get<RadioState>(RADIO_STATE_KEY);

    if (!state?.isLive) {
      await sendTelegramMessage(chatId, '📻 The radio is currently offline\\. Check back soon\\!', 'MarkdownV2');
      return;
    }

    if (state.currentSong) {
      const song = state.currentSong;
      const elapsedSec = Math.floor((Date.now() - song.startedAt) / 1000);
      const remainingSec = Math.max(0, song.duration - elapsedSec);

      const messageLines = [
        `🎵 *Now Playing on EmpowerTours Radio*`,
        ``,
        `*${escapeMarkdown(song.name)}*`,
        `by ${escapeMarkdown(song.artist || 'Unknown Artist')}`,
        ``,
        `⏱ ${formatDuration(elapsedSec)} / ${formatDuration(song.duration)}`,
        `👥 ${state.listenerCount} listener${state.listenerCount === 1 ? '' : 's'}`,
        `🎵 ${state.totalSongsPlayed} songs played total`,
      ];

      // Try to send with cover art
      if (song.imageUrl) {
        try {
          await sendTelegramRequest('sendPhoto', {
            chat_id: chatId,
            photo: song.imageUrl,
            caption: messageLines.join('\n'),
            parse_mode: 'MarkdownV2',
            reply_markup: buildRadioKeyboard(),
          });
          return;
        } catch {
          // Fall through to text message
        }
      }

      await sendTelegramMessage(chatId, messageLines.join('\n'), 'MarkdownV2', buildRadioKeyboard());
    } else if (state.currentVoiceNote) {
      await sendTelegramMessage(chatId, [
        `🎙️ *Voice ${state.currentVoiceNote.isAd ? 'Ad' : 'Shoutout'} Playing*`,
        ``,
        `From: ${escapeMarkdown(state.currentVoiceNote.username || 'Anonymous')}`,
        `Next song coming up soon\\!`,
      ].join('\n'), 'MarkdownV2');
    } else {
      await sendTelegramMessage(chatId, '🎵 Waiting for next song\\.\\.\\. The DJ is picking something good\\!', 'MarkdownV2');
    }
    return;
  }
}

// ── Telegram API Helpers ─────────────────────────────────────────────────

async function sendTelegramRequest(method: string, params: Record<string, any>): Promise<any> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram API ${method} error: ${result.error_code} ${result.description}`);
  }

  return result;
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  parseMode?: string,
  replyMarkup?: any
): Promise<void> {
  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  });
}

async function answerCallbackQuery(queryId: string, text: string, showAlert = false): Promise<void> {
  await sendTelegramRequest('answerCallbackQuery', {
    callback_query_id: queryId,
    text,
    show_alert: showAlert,
  });
}

/**
 * Build the standard radio inline keyboard
 */
function buildRadioKeyboard() {
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
 * Escape special characters for Telegram MarkdownV2
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Format seconds to mm:ss
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
