/**
 * Platform Detection
 *
 * Auto-detects which platform loaded the app by inspecting the runtime environment.
 * Detection order:
 *   1. Telegram - check window.Telegram?.WebApp?.initData
 *   2. Farcaster - check if running inside an iframe (frame context)
 *   3. Web - fallback for standalone browser
 *
 * This module is client-side only (references window/document).
 */

import type { Platform } from './types';

/**
 * Detect the current platform at runtime.
 * Safe to call on the server (returns 'web' when window is undefined).
 */
export function detectPlatform(): Platform {
  // Server-side rendering: default to web
  if (typeof window === 'undefined') {
    return 'web';
  }

  // 1. Telegram Mini App detection
  //    The Telegram WebApp JS bridge injects window.Telegram.WebApp
  //    and populates initData when launched from a bot's web_app button.
  if (isTelegramMiniApp()) {
    return 'telegram';
  }

  // 2. Farcaster Mini App / Frame detection
  //    Farcaster frames load inside an iframe within Warpcast or other clients.
  //    We also check for the Farcaster SDK context message.
  if (isFarcasterFrame()) {
    return 'farcaster';
  }

  // 3. Fallback: standalone browser
  return 'web';
}

/**
 * Check if running inside a Telegram Mini App.
 * Telegram injects window.Telegram.WebApp with initData containing
 * the signed launch parameters.
 */
export function isTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const tg = (window as any).Telegram;
    if (!tg?.WebApp) return false;

    // initData is populated only when launched from Telegram
    const initData = tg.WebApp.initData;
    return typeof initData === 'string' && initData.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if running inside a Farcaster frame.
 * Farcaster clients embed frames in iframes. We also check the URL
 * for fc-specific query params and the referrer.
 */
export function isFarcasterFrame(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // Check if running in an iframe (Farcaster frames are embedded)
    const isInIframe = window.self !== window.top;

    // Check URL for Farcaster-specific query parameters
    const url = new URL(window.location.href);
    const hasFarcasterParams =
      url.searchParams.has('fid') ||
      url.searchParams.has('castHash') ||
      url.searchParams.has('fc-frame');

    // Check referrer for Warpcast
    const isWarpcastReferrer =
      document.referrer.includes('warpcast.com') ||
      document.referrer.includes('farcaster');

    // If we're in an iframe and have Farcaster signals, it's Farcaster
    if (isInIframe && (hasFarcasterParams || isWarpcastReferrer)) {
      return true;
    }

    // Also detect if the Farcaster miniapp SDK is available and has context
    // This covers cases where the iframe check alone isn't sufficient
    if (isInIframe) {
      // In an iframe without clear Telegram signals, assume Farcaster
      // since our app is primarily a Farcaster Mini App
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
