/**
 * Safe Mode Feature Flag
 * Controls whether to use user-funded Safes or platform-funded Safe
 */

export const USE_USER_SAFES = process.env.NEXT_PUBLIC_USE_USER_SAFES === 'true';

export const isUserSafeMode = (): boolean => USE_USER_SAFES;

export const getSafeModeLabel = (): string =>
  USE_USER_SAFES ? 'user-funded' : 'platform-funded';

// Minimum MON required for user Safe operations
export const MIN_SAFE_BALANCE = 0.1; // 0.1 MON
export const RECOMMENDED_SAFE_BALANCE = 1.0; // 1 MON
