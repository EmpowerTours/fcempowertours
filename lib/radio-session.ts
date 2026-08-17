import { randomBytes } from "crypto";
import { Redis } from "@upstash/redis";

/**
 * 🔐 RADIO LISTEN SESSIONS
 *
 * The radio heartbeat used to take its listener address straight out of the
 * request body, so anyone could POST any address and be credited as a listener.
 * That matters because two things key off the heartbeat:
 *
 *   - listener points, which the ListenerRewardPool splits 20% of subscription
 *     revenue by, and
 *   - membership of the active-listeners ZSET, which is the list the scheduler
 *     walks when it writes plays on-chain — and those plays decide how the 70%
 *     artist pool is split.
 *
 * So an unauthenticated heartbeat is a direct claim on other people's money.
 *
 * A signature per heartbeat is not an option: heartbeats fire every 30s and
 * walletAuthHeaders() costs a wallet prompt every time. Hence a session — prove
 * ownership once through the existing authorizeUserAddress() (Quick Auth for
 * mini app users, a wallet signature for everyone else), then carry a bearer
 * token for the hour.
 *
 * The token is opaque and random; the address lives server-side in Redis and is
 * never taken from the caller again.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** Header the client carries the session token in. */
export const RADIO_SESSION_HEADER = "x-radio-session";

/**
 * The `context` string bound into the signed message. Must match on both sides
 * — the client passes it to walletAuthHeaders(), the server to
 * authorizeUserAddress() — or the signature recovers against a different
 * message and verification fails opaquely.
 */
export const RADIO_SESSION_CONTEXT = "radio-listen";

/**
 * One hour. Long enough that a listener signs at most once per sitting, short
 * enough that a leaked token stops being useful the same afternoon.
 */
export const RADIO_SESSION_TTL_SECONDS = 3600;

function sessionKey(token: string): string {
  return `live-radio:session:${token}`;
}

/**
 * Mint a session for an address whose ownership has ALREADY been proven.
 *
 * This function does not authenticate — the caller must have established
 * ownership first. It is deliberately not exported alongside any verification
 * helper so that a call site cannot mistake it for one.
 */
export async function createRadioSession(address: string): Promise<{
  token: string;
  expiresIn: number;
}> {
  const token = randomBytes(32).toString("hex");

  await redis.setex(
    sessionKey(token),
    RADIO_SESSION_TTL_SECONDS,
    address.toLowerCase(),
  );

  return { token, expiresIn: RADIO_SESSION_TTL_SECONDS };
}

/**
 * Resolve a session token to the address it was minted for.
 *
 * Returns null for a missing, malformed or expired token. Callers must treat
 * null as "unauthenticated" and must NOT fall back to an address supplied by
 * the request — that fallback is the exact hole this module closes.
 */
export async function resolveRadioSession(
  token: string | null | undefined,
): Promise<string | null> {
  if (!token || typeof token !== "string") return null;

  // Bound what reaches Redis as a key component.
  if (!/^[a-f0-9]{64}$/.test(token)) return null;

  const address = await redis.get<string>(sessionKey(token));
  if (!address || typeof address !== "string") return null;

  return address.toLowerCase();
}
