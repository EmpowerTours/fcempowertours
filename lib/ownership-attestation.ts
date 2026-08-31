import { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { randomBytes } from "crypto";

import { OWNERSHIP_ATTESTATION_HEADER } from "./wallet-auth-headers";

/**
 * 🔐 INTERNAL OWNERSHIP ATTESTATION
 *
 * Lets a route that has ALREADY proven a caller owns an address say so to an
 * internal route it fans out to.
 *
 * Why this exists: /api/bot-command verifies the caller, then calls
 * /api/execute-delegated over HTTP — sometimes three times for one command
 * (mint → wrap → retry). It cannot simply forward the caller's wallet-auth
 * headers, for two independent reasons:
 *
 *   1. The signed message is bound to the route's `context` string, and the two
 *      routes use different ones ("bot-command" vs "execute-delegated:mint_music").
 *   2. The nonce behind that signature is single-use, so the first downstream
 *      call would burn it and the retry would fail.
 *
 * A Quick Auth JWT survives forwarding because it is a bearer token with a TTL
 * rather than a per-action signature; this gives the wallet path the same shape.
 *
 * Scope of the credential: one address, ~2 minutes, server-to-server only —
 * bot-command puts it in `internalHeaders`, which is used exclusively for calls
 * to APP_URL. It grants nothing the caller could not already do by calling
 * bot-command again with the same signature. It is issued ONLY after a
 * signature has been verified, and it fails closed if Redis is unreachable.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** Long enough for a mint → wrap → retry chain, short enough to be uninteresting to steal. */
const ATTESTATION_TTL_SECONDS = 120;

const key = (id: string) => `ownership-attestation:${id}`;

/**
 * Mint an attestation that `address` has been verified. Returns the header to
 * attach, or {} if it could not be stored — the caller then behaves exactly as
 * it did before, i.e. the downstream route rejects the fund-moving action.
 */
export async function issueOwnershipAttestation(
  address: string,
): Promise<Record<string, string>> {
  try {
    const id = randomBytes(32).toString("hex");
    await redis.setex(key(id), ATTESTATION_TTL_SECONDS, address.toLowerCase());
    return { [OWNERSHIP_ATTESTATION_HEADER]: id };
  } catch (err: any) {
    console.warn(
      "[OwnershipAttestation] Could not issue:",
      err?.message ?? err,
    );
    return {};
  }
}

/**
 * True only when the request carries a live attestation for `userAddress`.
 *
 * Not consumed on read: one command legitimately produces several internal
 * calls, and the TTL — not a use count — is what bounds the credential.
 */
export async function verifyOwnershipAttestation(
  req: NextRequest,
  userAddress: string,
): Promise<boolean> {
  const id = req.headers.get(OWNERSHIP_ATTESTATION_HEADER);
  if (!id) return false;

  try {
    const stored = await redis.get(key(id));
    if (typeof stored !== "string") return false;
    return stored === userAddress.toLowerCase();
  } catch (err: any) {
    console.warn(
      "[OwnershipAttestation] Could not verify:",
      err?.message ?? err,
    );
    return false;
  }
}

/** Pass an attestation on through another internal hop. */
export function forwardOwnershipAttestation(
  req: NextRequest,
): Record<string, string> {
  const id = req.headers.get(OWNERSHIP_ATTESTATION_HEADER);
  return id ? { [OWNERSHIP_ATTESTATION_HEADER]: id } : {};
}
