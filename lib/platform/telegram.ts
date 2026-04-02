/**
 * Telegram Platform Adapter
 *
 * Implements PlatformContext for Telegram Mini Apps.
 * Uses the Telegram WebApp bridge (window.Telegram.WebApp) to extract
 * user data from the signed initData payload.
 *
 * The Telegram WebApp JS is injected by the Telegram client when loading
 * a Mini App. We also support @twa-dev/sdk as a typed wrapper.
 */

import type { PlatformContext, PlatformUser } from './types';

/**
 * Telegram WebApp user object shape (from initDataUnsafe).
 * See: https://core.telegram.org/bots/webapps#webappuser
 */
interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

/**
 * Create a Telegram platform context.
 * Must be called client-side only.
 */
export function createTelegramContext(): PlatformContext {
  let _isReady = false;
  let _cachedUser: PlatformUser | null = null;

  const context: PlatformContext = {
    platform: 'telegram',

    get isReady() {
      return _isReady;
    },

    async getUser(): Promise<PlatformUser | null> {
      // Return cached user if already resolved
      if (_cachedUser) return _cachedUser;

      if (typeof window === 'undefined') {
        _isReady = true;
        return null;
      }

      try {
        const tg = (window as any).Telegram?.WebApp;

        if (!tg) {
          console.warn('[Platform:Telegram] Telegram WebApp not available');
          _isReady = true;
          return null;
        }

        // Extract user from initDataUnsafe (client-side parsed, NOT for auth)
        // Server-side validation of initData happens in lib/auth/telegram.ts
        const tgUser: TelegramWebAppUser | undefined = tg.initDataUnsafe?.user;

        if (!tgUser) {
          console.warn('[Platform:Telegram] No user in initDataUnsafe');
          _isReady = true;
          return null;
        }

        const displayName = [tgUser.first_name, tgUser.last_name]
          .filter(Boolean)
          .join(' ');

        const user: PlatformUser = {
          id: String(tgUser.id),
          username: tgUser.username || `tg_${tgUser.id}`,
          displayName,
          avatar: tgUser.photo_url,
          platform: 'telegram',
          telegramId: tgUser.id,
          // Wallet address will be resolved server-side when user connects
          // their wallet via the app's wallet connection flow
        };

        // Try to load a previously-linked wallet address from session storage
        const cachedWallet = typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(`tg_wallet_${tgUser.id}`)
          : null;

        if (cachedWallet) {
          user.walletAddress = cachedWallet;
        }

        _cachedUser = user;
        _isReady = true;

        console.log('[Platform:Telegram] User loaded:', user.username, 'id:', user.telegramId);
        return user;
      } catch (err) {
        console.error('[Platform:Telegram] Failed to get user:', err);
        _isReady = true;
        return null;
      }
    },
  };

  return context;
}

/**
 * Get the raw Telegram WebApp initData string for server-side validation.
 * Returns null if not in a Telegram Mini App.
 */
export function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const initData = (window as any).Telegram?.WebApp?.initData;
    return typeof initData === 'string' && initData.length > 0 ? initData : null;
  } catch {
    return null;
  }
}

/**
 * Get the Telegram WebApp instance for direct access to
 * MainButton, BackButton, HapticFeedback, etc.
 * Returns null if not in a Telegram Mini App.
 */
export function getTelegramWebApp(): any | null {
  if (typeof window === 'undefined') return null;

  try {
    return (window as any).Telegram?.WebApp || null;
  } catch {
    return null;
  }
}
