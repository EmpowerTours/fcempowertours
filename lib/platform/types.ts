/**
 * Platform Abstraction Types
 *
 * Shared interfaces for cross-platform support (Farcaster, Telegram, Web).
 * All platform adapters implement PlatformContext to provide a unified API.
 */

export type Platform = 'farcaster' | 'telegram' | 'web';

/**
 * Normalized user object across all platforms.
 * Each platform adapter maps its native user data into this shape.
 */
export interface PlatformUser {
  /** Unique identifier - FID for Farcaster, telegramId for Telegram, wallet address for web */
  id: string;
  /** Username on the platform (e.g. @vitalik on Farcaster, @user on Telegram) */
  username: string;
  /** Display name if available */
  displayName?: string;
  /** Profile picture URL */
  avatar?: string;
  /** Which platform this user came from */
  platform: Platform;
  /** Farcaster FID (only set for Farcaster users) */
  fid?: number;
  /** Telegram user ID (only set for Telegram users) */
  telegramId?: number;
  /** Connected wallet address (available on all platforms once resolved) */
  walletAddress?: string;
}

/**
 * Unified platform context that each adapter must implement.
 * Consumed by the PlatformProvider and usePlatform() hook.
 */
export interface PlatformContext {
  /** Which platform is active */
  platform: Platform;
  /** Retrieve the current user (may involve async SDK calls) */
  getUser(): Promise<PlatformUser | null>;
  /** Whether the platform SDK has finished initializing */
  isReady: boolean;
}

/**
 * Extended context exposed by the usePlatform() hook.
 * Includes resolved user state and loading indicators.
 */
export interface PlatformState {
  /** Which platform is active */
  platform: Platform;
  /** Whether the platform SDK is still initializing */
  loading: boolean;
  /** The resolved platform user, or null if not yet loaded / not authenticated */
  user: PlatformUser | null;
  /** Whether the platform SDK has finished initializing */
  isReady: boolean;
  /** Any error that occurred during initialization */
  error: Error | null;
}
