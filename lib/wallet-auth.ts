import { NextRequest } from "next/server";

import {
  buildActionMessage,
  generateNonce,
  validateTimestamp,
  verifyAndConsumeNonce,
  verifySignature,
} from "./auth";

/**
 * 🔐 WALLET AUTH (server-side verification)
 *
 * Proves a caller controls `userAddress` using a wallet signature instead of a
 * Farcaster Quick Auth token. This exists so people who do not use Farcaster can
 * still perform fund-moving actions, which gate on proven address ownership.
 *
 * It deliberately adds NO new cryptography. Nonce issuance/consumption, timestamp
 * windows and signature checking are the primitives already used by
 * create-delegation, mint-music and burn-music (lib/auth.ts) — this module only
 * makes them reachable from authorizeUserAddress().
 *
 * Credentials travel as HEADERS, not body fields, because callers of
 * authorizeUserAddress have usually already consumed the request body with
 * `await req.json()` and a body can only be read once.
 *
 * The signed message binds the signature to a specific action (the `context`
 * string, e.g. "execute-delegated:send_mon"), so a signature captured for one
 * operation cannot be replayed against another.
 */

export { WALLET_AUTH_HEADERS } from "./wallet-auth-headers";
import { WALLET_AUTH_HEADERS } from "./wallet-auth-headers";

export type WalletAuthResult =
  | { ok: true; address: string }
  | {
      ok: false;
      reason: string;
      /** False when no wallet credentials were sent at all, as opposed to sent-and-bad. */
      attempted: boolean;
    };

/** The operation key a nonce is issued and consumed under. */
export function walletNonceOperation(context: string): string {
  return `wallet-auth:${context}`;
}

/**
 * Issue a nonce for a wallet-auth signature. The client signs
 * buildActionMessage(address, timestamp, nonce, context) and returns it in the
 * headers above.
 */
export async function issueWalletNonce(
  address: string,
  context: string,
): Promise<string> {
  return generateNonce(address, walletNonceOperation(context));
}

/**
 * Verify wallet-auth headers prove the caller controls `userAddress`.
 *
 * Returns ok:false with attempted:false when no credentials were supplied, so
 * the caller can fall back to its previous behaviour unchanged rather than
 * treating a Farcaster-only request as a failed wallet request.
 */
export async function verifyWalletAuth(
  req: NextRequest,
  userAddress: string,
  context: string,
): Promise<WalletAuthResult> {
  const address = req.headers.get(WALLET_AUTH_HEADERS.address);
  const signature = req.headers.get(WALLET_AUTH_HEADERS.signature);
  const timestampRaw = req.headers.get(WALLET_AUTH_HEADERS.timestamp);
  const nonce = req.headers.get(WALLET_AUTH_HEADERS.nonce);

  if (!address && !signature && !timestampRaw && !nonce) {
    return { ok: false, reason: "No wallet credentials", attempted: false };
  }

  if (!address || !signature || !timestampRaw || !nonce) {
    return {
      ok: false,
      reason: "Incomplete wallet credentials",
      attempted: true,
    };
  }

  // The signature may only ever authorize the address the request acts on.
  const target = userAddress.toLowerCase();
  if (address.toLowerCase() !== target) {
    return {
      ok: false,
      reason: "Signing address does not match the address being acted on",
      attempted: true,
    };
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { ok: false, reason: "Invalid address format", attempted: true };
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "Invalid timestamp", attempted: true };
  }

  const timeCheck = validateTimestamp(timestamp);
  if (!timeCheck.valid) {
    return {
      ok: false,
      reason: timeCheck.error || "Timestamp outside accepted window",
      attempted: true,
    };
  }

  // One-time use. Consumed BEFORE the signature check would also be safe, but
  // doing it after means a malformed signature does not burn a valid nonce.
  const message = buildActionMessage(target, timestamp, nonce, context);
  const sigCheck = await verifySignature(message, signature, target);
  if (!sigCheck.valid) {
    return {
      ok: false,
      reason: sigCheck.error || "Invalid signature",
      attempted: true,
    };
  }

  const nonceOk = await verifyAndConsumeNonce(
    target,
    walletNonceOperation(context),
    nonce,
  );
  if (!nonceOk) {
    return {
      ok: false,
      reason: "Nonce invalid, expired or already used",
      attempted: true,
    };
  }

  return { ok: true, address: target };
}
