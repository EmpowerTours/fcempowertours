/**
 * Platform Abstraction Layer - Main Entry Point
 *
 * Exports the usePlatform() React hook and all platform types.
 * Auto-detects the current platform (Farcaster, Telegram, Web) and
 * provides a unified context to all consuming components.
 *
 * Usage:
 *   import { usePlatform } from '@/lib/platform';
 *
 *   function MyComponent() {
 *     const { platform, user, loading } = usePlatform();
 *     // platform is 'farcaster' | 'telegram' | 'web'
 *   }
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { detectPlatform } from './detect';
import { createFarcasterContext } from './farcaster';
import { createTelegramContext } from './telegram';
import { createWebContext } from './web';
import type { Platform, PlatformContext, PlatformUser, PlatformState } from './types';

// Re-export types for convenience
export type { Platform, PlatformContext, PlatformUser, PlatformState };
export { detectPlatform } from './detect';
export { getTelegramInitData, getTelegramWebApp } from './telegram';
export { setWebWalletAddress } from './web';

/**
 * Create the appropriate platform context based on detection.
 */
function createPlatformContext(platform: Platform): PlatformContext {
  switch (platform) {
    case 'telegram':
      return createTelegramContext();
    case 'farcaster':
      return createFarcasterContext();
    case 'web':
    default:
      return createWebContext();
  }
}

/**
 * React hook that auto-detects the platform and provides unified context.
 *
 * Returns:
 *   - platform: which platform is active
 *   - user: normalized PlatformUser or null
 *   - loading: whether initialization is in progress
 *   - isReady: whether the platform SDK is initialized
 *   - error: any initialization error
 *   - refresh: function to re-fetch user data
 */
export function usePlatform(): PlatformState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<PlatformState>({
    platform: 'web',
    loading: true,
    user: null,
    isReady: false,
    error: null,
  });

  const initialize = useCallback(async () => {
    try {
      const detected = detectPlatform();
      console.log('[Platform] Detected:', detected);

      setState(prev => ({
        ...prev,
        platform: detected,
        loading: true,
        error: null,
      }));

      const ctx = createPlatformContext(detected);
      const user = await ctx.getUser();

      setState({
        platform: detected,
        loading: false,
        user,
        isReady: ctx.isReady,
        error: null,
      });

      console.log('[Platform] Initialized:', {
        platform: detected,
        userId: user?.id,
        username: user?.username,
        hasWallet: !!user?.walletAddress,
      });
    } catch (err) {
      console.error('[Platform] Initialization error:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        isReady: true,
        error: err instanceof Error ? err : new Error(String(err)),
      }));
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    await initialize();
  }, [initialize]);

  return { ...state, refresh };
}
