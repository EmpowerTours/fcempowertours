/**
 * RadioInlineKeyboard — Helper to generate Telegram inline keyboard markup
 * for radio controls.
 *
 * Buttons link to the Mini App with deep links so users can interact
 * with the radio from within Telegram.
 *
 * Usage:
 *   import { buildRadioKeyboard, buildNowPlayingKeyboard } from './RadioInlineKeyboard';
 *
 *   // In bot code or webhook:
 *   const keyboard = buildRadioKeyboard();
 *   await bot.sendMessage(chatId, text, { reply_markup: keyboard });
 */

const BOT_USERNAME = 'AI_RobotExpert_bot';
const MINI_APP_SHORT_NAME = 'radio';

// ── Types ────────────────────────────────────────────────────────────────

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// ── Deep Link Helpers ────────────────────────────────────────────────────

/**
 * Build a Mini App deep link URL that opens to a specific section.
 *
 * These URLs open the Mini App within Telegram when clicked:
 *   https://t.me/AI_RobotExpert_bot/radio?startapp=queue
 *   https://t.me/AI_RobotExpert_bot/radio?startapp=stats
 *   https://t.me/AI_RobotExpert_bot/radio?startapp=leaderboard
 */
export function buildMiniAppLink(section?: string): string {
  const base = `https://t.me/${BOT_USERNAME}/${MINI_APP_SHORT_NAME}`;
  if (section) {
    return `${base}?startapp=${section}`;
  }
  return base;
}

/**
 * Build a tg:// protocol deep link for the Mini App.
 * These work more reliably inside Telegram clients.
 *
 *   tg://resolve?domain=AI_RobotExpert_bot&appurl=radio&startapp=queue
 */
export function buildTgDeepLink(section?: string): string {
  let link = `tg://resolve?domain=${BOT_USERNAME}&appurl=${MINI_APP_SHORT_NAME}`;
  if (section) {
    link += `&startapp=${section}`;
  }
  return link;
}

// ── Keyboard Builders ────────────────────────────────────────────────────

/**
 * Full radio keyboard with all control buttons.
 * Used when sending song notifications to subscribers.
 */
export function buildRadioKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '📋 Queue',
          url: buildMiniAppLink('queue'),
        },
        {
          text: '🎙️ Voice Note',
          url: buildMiniAppLink('voice'),
        },
      ],
      [
        {
          text: '📊 Stats',
          url: buildMiniAppLink('stats'),
        },
        {
          text: '🏆 Leaderboard',
          url: buildMiniAppLink('leaderboard'),
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
 * Now Playing keyboard - focused on the current song.
 * Used for /now_playing command responses.
 */
export function buildNowPlayingKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '📻 Open Radio',
          url: buildMiniAppLink(),
        },
        {
          text: '📋 View Queue',
          url: buildMiniAppLink('queue'),
        },
      ],
      [
        {
          text: '🏆 Leaderboard',
          url: buildMiniAppLink('leaderboard'),
        },
      ],
    ],
  };
}

/**
 * Subscribe prompt keyboard - for users who aren't subscribed yet.
 */
export function buildSubscribeKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '🎧 Subscribe to Radio',
          callback_data: 'radio_subscribe',
        },
      ],
      [
        {
          text: '📻 Open Radio App',
          url: buildMiniAppLink(),
        },
      ],
    ],
  };
}

/**
 * Unsubscribed state keyboard - shows re-subscribe option.
 */
export function buildResubscribeKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '🎧 Re-subscribe',
          callback_data: 'radio_subscribe',
        },
      ],
      [
        {
          text: '📻 Open Radio App',
          url: buildMiniAppLink(),
        },
      ],
    ],
  };
}

/**
 * Minimal keyboard for voice note/ad notifications.
 */
export function buildVoiceNoteKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '🎙️ Submit Your Own',
          url: buildMiniAppLink('voice'),
        },
        {
          text: '📻 Open Radio',
          url: buildMiniAppLink(),
        },
      ],
    ],
  };
}

/**
 * Song ended keyboard - prompts to queue the next song.
 */
export function buildQueuePromptKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '🎵 Queue a Song (1 WMON)',
          url: buildMiniAppLink('queue'),
        },
      ],
      [
        {
          text: '📊 Stats',
          url: buildMiniAppLink('stats'),
        },
        {
          text: '🏆 Top Listeners',
          url: buildMiniAppLink('leaderboard'),
        },
      ],
    ],
  };
}

// ── Utility ──────────────────────────────────────────────────────────────

/**
 * Get all available radio commands for BotFather setup.
 * Copy this output to BotFather /setcommands:
 *
 * radio - Subscribe to live radio
 * stop_radio - Unsubscribe from live radio
 * now_playing - See what's currently playing
 */
export function getBotCommands(): Array<{ command: string; description: string }> {
  return [
    { command: 'radio', description: 'Subscribe to live radio' },
    { command: 'stop_radio', description: 'Unsubscribe from live radio' },
    { command: 'now_playing', description: "See what's currently playing" },
  ];
}
