/**
 * Credit for bringing a listener who was not already here.
 *
 * ## Why this act and not another
 *
 * Listening is paid in WMON, out of the subscription reserve the listener's own payment
 * funded. Referring a *subscriber* is paid in WMON too — `SubscriptionReferrals` reads
 * `TREASURY_PERCENTAGE()` for exactly that reason. Both of those have revenue attached, so
 * both have something to be paid out of.
 *
 * Sharing a track that somebody then plays has no revenue attached at the moment it happens.
 * It is the one contribution in the music app that scales with the platform rather than with
 * the catalogue: discovery stamps are bounded by how many artists exist, but a share can bring
 * a listener who was never here before, which is the constraint that actually binds.
 *
 * ## Why this cannot be farmed by trying harder
 *
 * That was the flaw in the accruals removed on 2026-09-08 — more listening meant more tokens.
 * Here the credit is per *brought listener*, not per play:
 *
 *   - one credit per (sharer, listener) pair, ever, claimed atomically with SET NX
 *   - a sharer never credits themselves
 *   - `record-play` has already required an ACTIVE SUBSCRIPTION of the listener before this
 *     runs, so manufacturing a credit costs a real subscription — 15 WMON at the daily tier
 *   - a daily ceiling per sharer, so a bulk attack is visible before it is large
 *
 * ## What this does NOT do
 *
 * It does not pay. No TOURS pool is funded — `ToursRewardManagerV2` holds 1,000,000 but
 * `authorizedDistributors(MusicSubscriptionV6)` is false on chain. Writing a balance nobody
 * can draw is the mistake `claim_rewards` made: it reported "Successfully claimed X TOURS"
 * while transferring nothing, and zeroed the balance on the way out.
 *
 * So this records ATTRIBUTION — who brought whom, and when. That record is worth having on
 * its own, and it is what a funded contract would settle from later. It is deliberately not
 * called a balance and is not exposed as one.
 */

import type { Redis } from "@upstash/redis";

/** A share, recorded when the cast goes out. Expires; a months-old cast is not a live funnel. */
const shareKey = (castHash: string) => `share:${castHash.toLowerCase()}`;

/** One credit per sharer per listener, ever. No TTL — "ever" is the point. */
const creditKey = (sharer: string, listener: string) =>
  `share:credit:${sharer.toLowerCase()}:${listener.toLowerCase()}`;

/** Per-sharer daily ceiling, so a bulk attack shows up small and early. */
const dailyKey = (sharer: string, day: number) =>
  `share:daily:${sharer.toLowerCase()}:${day}`;

/** The attribution ledger a funded contract would settle from. */
export const SHARE_LEDGER_KEY = "share:ledger";

const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_CREDITS_PER_SHARER_PER_DAY = 25;

export interface ShareRecord {
  sharer: string;
  tokenId: string;
  at: number;
}

export interface ShareCreditResult {
  credited: boolean;
  /** This sharer already brought this listener. */
  alreadyCredited: boolean;
  sharer?: string;
  reason?: string;
}

/**
 * Record that `sharer` cast `tokenId`, addressable by the cast's hash.
 *
 * Never throws: a cast that posted is a success even if we fail to remember it.
 */
export async function recordShare(
  redis: Redis,
  castHash: string,
  sharer: string,
  tokenId: string | number,
): Promise<void> {
  if (!castHash || !sharer) return;
  try {
    const record: ShareRecord = {
      sharer: sharer.toLowerCase(),
      tokenId: String(tokenId),
      at: Date.now(),
    };
    await redis.setex(shareKey(castHash), SHARE_TTL_SECONDS, record);
  } catch (err) {
    console.warn(
      "[share-credit] could not record share:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Credit the sharer behind `castHash` for bringing `listener`.
 *
 * Never throws. This decorates a play that has already succeeded; failing to attribute it
 * must not fail the play — the same rule the discovery stamp follows.
 */
export async function creditShareOnPlay(
  redis: Redis,
  castHash: string | undefined | null,
  listener: string,
): Promise<ShareCreditResult> {
  if (!castHash || !listener) {
    return { credited: false, alreadyCredited: false, reason: "no share" };
  }

  try {
    const share = await redis.get<ShareRecord>(shareKey(castHash));
    if (!share?.sharer) {
      return {
        credited: false,
        alreadyCredited: false,
        reason: "unknown or expired share",
      };
    }

    // Nobody brings themselves.
    if (share.sharer.toLowerCase() === listener.toLowerCase()) {
      return { credited: false, alreadyCredited: false, reason: "self" };
    }

    // Atomic claim. SET NX returns null when the key existed, which makes "has this
    // sharer already brought this listener" and "claim the right to credit" one step,
    // so two concurrent plays cannot both be credited.
    const claimed = await redis.set(
      creditKey(share.sharer, listener),
      Date.now(),
      { nx: true },
    );
    if (claimed === null) {
      return {
        credited: false,
        alreadyCredited: true,
        sharer: share.sharer,
      };
    }

    // Daily ceiling. Checked AFTER the pair claim so a blocked credit still burns the
    // pair — a sharer cannot retry the same listener tomorrow to get around the cap.
    const day = Math.floor(Date.now() / 86_400_000);
    const used = await redis.incr(dailyKey(share.sharer, day));
    if (used === 1) await redis.expire(dailyKey(share.sharer, day), 172_800);
    if (used > MAX_CREDITS_PER_SHARER_PER_DAY) {
      console.warn(
        `[share-credit] daily ceiling hit by ${share.sharer} (${used})`,
      );
      return {
        credited: false,
        alreadyCredited: false,
        sharer: share.sharer,
        reason: "daily ceiling",
      };
    }

    // The attribution record. Not a balance, and deliberately not named like one.
    await redis.hincrby(SHARE_LEDGER_KEY, share.sharer, 1);

    console.log(
      `[share-credit] ${share.sharer} brought ${listener} via ${castHash}`,
    );
    return { credited: true, alreadyCredited: false, sharer: share.sharer };
  } catch (err) {
    console.warn(
      "[share-credit] credit failed:",
      err instanceof Error ? err.message : err,
    );
    return { credited: false, alreadyCredited: false, reason: "error" };
  }
}
