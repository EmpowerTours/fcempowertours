/**
 * Farcaster Platform Adapter
 *
 * Implements PlatformContext for Farcaster Mini Apps / Frames.
 * Uses the @farcaster/miniapp-sdk to get user context, then resolves
 * the verified wallet address via Neynar API.
 *
 * This mirrors the existing useFarcasterContext.tsx logic but maps
 * into the unified PlatformContext interface.
 */

import type { PlatformContext, PlatformUser } from './types';

/**
 * Create a Farcaster platform context.
 * Must be called client-side only.
 */
export function createFarcasterContext(): PlatformContext {
  let _isReady = false;
  let _cachedUser: PlatformUser | null = null;

  const context: PlatformContext = {
    platform: 'farcaster',

    get isReady() {
      return _isReady;
    },

    async getUser(): Promise<PlatformUser | null> {
      // Return cached user if already resolved
      if (_cachedUser) return _cachedUser;

      try {
        // Dynamic import to avoid SSR issues
        const farcasterModule = await import('@farcaster/miniapp-sdk');
        const { sdk: farcasterSdk } = farcasterModule;

        if (!farcasterSdk) {
          console.warn('[Platform:Farcaster] SDK import returned undefined');
          _isReady = true;
          return null;
        }

        // Wait for SDK context with retries
        let ctx: any = null;
        let attempts = 0;

        while (attempts < 10) {
          try {
            ctx = await farcasterSdk.context;
            if (ctx?.user?.fid) break;
          } catch {
            // Context not ready yet
          }
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!ctx?.user?.fid) {
          console.warn('[Platform:Farcaster] Could not resolve user context');
          _isReady = true;
          return null;
        }

        const farcasterUser = ctx.user;

        // Build initial user object
        const user: PlatformUser = {
          id: String(farcasterUser.fid),
          username: farcasterUser.username || '',
          displayName: farcasterUser.displayName || farcasterUser.display_name,
          avatar: farcasterUser.pfpUrl || farcasterUser.pfp_url,
          platform: 'farcaster',
          fid: farcasterUser.fid,
        };

        // Resolve verified wallet address via Neynar API
        const walletAddress = await resolveWalletAddress(farcasterUser.fid);
        if (walletAddress) {
          user.walletAddress = walletAddress;
        }

        // Signal ready to Farcaster client
        try {
          await farcasterSdk.actions.ready();
        } catch {
          console.warn('[Platform:Farcaster] Ready signal failed');
        }

        _cachedUser = user;
        _isReady = true;
        return user;
      } catch (err) {
        console.error('[Platform:Farcaster] Failed to initialize:', err);
        _isReady = true;
        return null;
      }
    },
  };

  return context;
}

/**
 * Resolve the verified wallet address for a Farcaster FID via Neynar API.
 * Uses sessionStorage caching to avoid redundant API calls.
 */
async function resolveWalletAddress(fid: number): Promise<string | null> {
  // Check session cache first
  const cacheKey = `neynar_wallet_${fid}`;
  if (typeof sessionStorage !== 'undefined') {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  }

  try {
    const apiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
    if (!apiKey) {
      console.warn('[Platform:Farcaster] NEYNAR_API_KEY not configured');
      return null;
    }

    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      { headers: { api_key: apiKey } }
    );

    if (!response.ok) {
      console.warn('[Platform:Farcaster] Neynar API returned:', response.status);
      return null;
    }

    const data = await response.json();
    const userData = data.users?.[0];

    if (!userData) return null;

    // Priority: primary verified address > first verified address > custody
    const address =
      userData.verified_addresses?.primary?.eth_address ||
      userData.verifiedAddresses?.primary?.eth_address ||
      userData.verified_addresses?.eth_addresses?.[0] ||
      userData.verifiedAddresses?.eth_addresses?.[0] ||
      userData.verifiedAddresses?.ethAddresses?.[0] ||
      userData.custody_address;

    if (address && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(cacheKey, address);
    }

    return address || null;
  } catch (err) {
    console.warn('[Platform:Farcaster] Neynar fetch failed:', err);
    return null;
  }
}
