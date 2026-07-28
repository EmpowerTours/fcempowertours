"use client";

import { sdk } from "@farcaster/miniapp-sdk";

/**
 * 🔐 FARCASTER QUICK AUTH (client side)
 *
 * Obtains the session JWT that proves to our backend that the caller really
 * controls the FID it claims. Pair with lib/quick-auth.ts on the server.
 *
 * The SDK caches the token in memory and refreshes it when expired, so
 * calling getQuickAuthToken() per request is cheap.
 */

/**
 * Returns a Quick Auth JWT, or null when unavailable — outside a Farcaster
 * client, if the host never responds, or if the user declines to sign in.
 * Never throws and never hangs, so callers can attach auth opportunistically
 * without breaking plain-browser usage.
 */
/**
 * Outside a Farcaster host there is nothing to answer the SDK's postMessage,
 * so the promise can hang indefinitely. Every caller sits behind a user
 * action, so failing fast beats blocking the UI.
 */
const TOKEN_TIMEOUT_MS = 3000;

export async function getQuickAuthToken(): Promise<string | null> {
  try {
    const result = await Promise.race([
      sdk.quickAuth.getToken(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS),
      ),
    ]);

    if (!result) {
      console.warn(
        "[QuickAuth] Token request timed out — continuing without auth",
      );
      return null;
    }
    return result.token || null;
  } catch (err: any) {
    console.warn("[QuickAuth] Could not get token:", err?.message);
    return null;
  }
}

/**
 * Authorization header for a fetch call, or {} when no token is available.
 *
 * Usage:
 *   headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getQuickAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
