/**
 * Web Platform Adapter
 *
 * Implements PlatformContext for standalone browser access.
 * No native platform SDK is available. User identity comes from
 * wallet connection (wagmi / RainbowKit) rather than a platform SDK.
 *
 * This is the fallback when neither Telegram nor Farcaster is detected.
 */

import type { PlatformContext, PlatformUser } from './types';

/**
 * Create a web (standalone browser) platform context.
 */
export function createWebContext(): PlatformContext {
  let _isReady = false;
  let _cachedUser: PlatformUser | null = null;

  const context: PlatformContext = {
    platform: 'web',

    get isReady() {
      return _isReady;
    },

    async getUser(): Promise<PlatformUser | null> {
      if (_cachedUser) return _cachedUser;

      // In standalone web mode, we don't have a platform SDK to pull
      // user data from. The user's identity is their connected wallet.
      // We check if a wallet address was previously stored in sessionStorage.
      if (typeof window === 'undefined') {
        _isReady = true;
        return null;
      }

      try {
        const storedAddress = sessionStorage.getItem('web_wallet_address');

        if (storedAddress) {
          const user: PlatformUser = {
            id: storedAddress.toLowerCase(),
            username: truncateAddress(storedAddress),
            displayName: truncateAddress(storedAddress),
            platform: 'web',
            walletAddress: storedAddress,
          };
          _cachedUser = user;
        }
      } catch {
        // sessionStorage not available
      }

      _isReady = true;
      return _cachedUser;
    },
  };

  return context;
}

/**
 * Update the web context with a connected wallet address.
 * Call this when the user connects their wallet via wagmi/RainbowKit.
 */
export function setWebWalletAddress(address: string): PlatformUser {
  const user: PlatformUser = {
    id: address.toLowerCase(),
    username: truncateAddress(address),
    displayName: truncateAddress(address),
    platform: 'web',
    walletAddress: address,
  };

  // Persist for the session
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('web_wallet_address', address);
    }
  } catch {
    // sessionStorage not available
  }

  return user;
}

/**
 * Truncate an Ethereum address for display: 0x1234...abcd
 */
function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
