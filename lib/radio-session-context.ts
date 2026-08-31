/**
 * The `context` string bound into a radio-session signature.
 *
 * Standalone and dependency-free for the same reason as lib/wallet-auth-headers.ts: the browser
 * needs this constant to build a signature, and importing it from lib/radio-session.ts would
 * pull Upstash Redis and node:crypto into the client bundle.
 *
 * Must match on both sides — the client passes it to walletAuthHeaders(), the server to
 * authorizeUserAddress() — or the signature recovers against a different message and
 * verification fails opaquely.
 */
export const RADIO_SESSION_CONTEXT = "radio-listen";
