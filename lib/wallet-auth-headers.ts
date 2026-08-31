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

/**
 * Header carrying a short-lived internal proof that a fronting route already
 * verified address ownership. Deliberately NOT part of WALLET_AUTH_HEADERS:
 * verifyWalletAuth treats the presence of any of those four as "the caller
 * attempted a wallet signature", and this is not one.
 */
export const OWNERSHIP_ATTESTATION_HEADER = "x-ownership-attestation";
