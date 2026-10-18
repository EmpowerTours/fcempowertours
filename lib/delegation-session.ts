import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Binds a proven delegation to the browser that created it.
 *
 * A delegation is stored under the user's address alone. Without a secret, any
 * HTTP caller who knows that address could invoke fund-moving actions for the
 * full 24h / 100-tx window. The session secret is issued once at creation,
 * returned only to that creator, and required on later spend calls.
 *
 * Redis stores only the SHA-256 hash. A dump of Redis cannot be replayed as a
 * header. Absent hash (delegations created before this field) fails closed.
 */
export { DELEGATION_SESSION_HEADER } from "@/lib/delegation-session-header";

export function mintDelegationSessionSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashDelegationSessionSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function delegationSessionMatches(
  presented: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (!presented || !storedHash) return false;
  if (!/^[a-f0-9]{64}$/i.test(presented)) return false;
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const a = Buffer.from(hashDelegationSessionSecret(presented), "utf8");
  const b = Buffer.from(storedHash.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
