/**
 * Header names for wallet-signature auth.
 *
 * Deliberately a standalone module with ZERO imports. Both the server verifier
 * (lib/wallet-auth.ts) and the browser helper (lib/wallet-auth-client.ts) need
 * these names, and if the client imported them from the server module it would
 * pull Upstash Redis, node:crypto and every server env read into the browser
 * bundle. Keep this file dependency-free.
 */
export const WALLET_AUTH_HEADERS = {
  address: "x-wallet-address",
  signature: "x-wallet-signature",
  timestamp: "x-wallet-timestamp",
  nonce: "x-wallet-nonce",
} as const;
