/**
 * Whether the PLATFORM Safe pays the gas for an artist's mint.
 *
 * ## Why this exists
 *
 * The mint page promises "FREE Mint! We pay all gas fees". With `USE_USER_SAFES` on, that was
 * false: the mint ran as a UserOperation from the artist's OWN Safe, which a new artist has never
 * funded, so their first mint failed with "Insufficient balance in your Safe wallet" pointing at
 * an address they had never seen. Measured 2026-11-08: one music mint is ~655k gas, ~0.081 MON.
 *
 * v3 makes sponsoring safe: `SalesController.mintMasterFor` takes the ARTIST's EIP-712 signature
 * over every minted field ("Anyone may relay; the artist must have signed"), so the platform Safe
 * relaying it cannot change who the artist is, the uri, or the price.
 *
 * ## Why it is capped
 *
 * Wallets are free, so a per-wallet cap alone bounds nothing — a script can make a thousand
 * wallets. The GLOBAL daily cap is what bounds platform spend (50 x ~0.08 = ~4 MON/day at most).
 * The per-wallet cap only stops one artist from using the whole day's budget.
 *
 * ## Why it falls back instead of failing
 *
 * Every refusal below returns `sponsored: false` with a reason and the mint proceeds from the
 * artist's own Safe, exactly as before this file existed. Refusing never costs the platform
 * anything, so every uncertain case — Redis unreachable, balance unreadable — refuses.
 *
 * Gas only, never fees: a mint carrying a payment (the 5 WMON music-collector fee) is never
 * sponsored, or the platform Safe would pay its own treasury and the artist would pay nothing.
 */

export interface SponsorLimits {
  perWalletPerDay: number;
  globalPerDay: number;
  /**
   * Platform Safe MON below which nothing is sponsored. `sendSafeTransaction` refuses under
   * 3 MON (the Pimlico reserve) and calls 5 "recommended"; sponsoring down to 3 would starve
   * passports, radio and the other platform-paid paths of the same Safe.
   */
  minPlatformWei: bigint;
}

export const DEFAULT_SPONSOR_LIMITS: SponsorLimits = {
  perWalletPerDay: 5,
  globalPerDay: 50,
  minPlatformWei: 5_000_000_000_000_000_000n, // 5 MON
};

export type SponsorDecision =
  | { sponsored: true }
  | {
      sponsored: false;
      reason:
        | "legacy-contracts"
        | "carries-payment"
        | "platform-low"
        | "global-cap"
        | "wallet-cap"
        | "unavailable";
    };

/** Pure: everything the decision depends on is passed in. Counts are AFTER this mint. */
export function decideSponsorship(input: {
  isV3: boolean;
  requiredValue: bigint;
  platformBalanceWei: bigint | null;
  walletCountToday: number | null;
  globalCountToday: number | null;
  limits: SponsorLimits;
}): SponsorDecision {
  const { limits } = input;
  // Legacy `mintMaster(artist, ...)` lets the CALLER assert the artist. Never relay that.
  if (!input.isV3) return { sponsored: false, reason: "legacy-contracts" };
  if (input.requiredValue > 0n)
    return { sponsored: false, reason: "carries-payment" };
  if (
    input.platformBalanceWei === null ||
    input.walletCountToday === null ||
    input.globalCountToday === null
  )
    return { sponsored: false, reason: "unavailable" };
  if (input.platformBalanceWei < limits.minPlatformWei)
    return { sponsored: false, reason: "platform-low" };
  if (input.globalCountToday > limits.globalPerDay)
    return { sponsored: false, reason: "global-cap" };
  if (input.walletCountToday > limits.perWalletPerDay)
    return { sponsored: false, reason: "wallet-cap" };
  return { sponsored: true };
}

/** What the artist is told when their mint falls back to their own Safe. */
export function fallbackNotice(
  reason: Extract<SponsorDecision, { sponsored: false }>["reason"],
): string {
  switch (reason) {
    case "wallet-cap":
      return "You've used today's free mints.";
    case "global-cap":
    case "platform-low":
    case "unavailable":
      return "Free mints are paused right now.";
    case "carries-payment":
      return "This mint includes a fee, so it is paid from your Safe.";
    case "legacy-contracts":
      return "";
  }
}

function readLimits(): SponsorLimits {
  const int = (v: string | undefined, d: number) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  const minMon = Number.parseFloat(process.env.MINT_SPONSOR_MIN_MON ?? "");
  return {
    perWalletPerDay: int(
      process.env.MINT_SPONSOR_PER_WALLET_DAY,
      DEFAULT_SPONSOR_LIMITS.perWalletPerDay,
    ),
    globalPerDay: int(
      process.env.MINT_SPONSOR_GLOBAL_DAY,
      DEFAULT_SPONSOR_LIMITS.globalPerDay,
    ),
    minPlatformWei:
      Number.isFinite(minMon) && minMon >= 0
        ? BigInt(Math.round(minMon * 1e6)) * 1_000_000_000_000n
        : DEFAULT_SPONSOR_LIMITS.minPlatformWei,
  };
}

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Reserve one sponsored mint, or say why not. A reservation that is not followed by a mint must
 * be returned with `release`, or a failed mint would spend a slot of the day's budget.
 */
export async function reserveMintSponsorship(opts: {
  wallet: string;
  isV3: boolean;
  requiredValue: bigint;
  platformSafe: `0x${string}` | undefined;
  getBalance: (address: `0x${string}`) => Promise<bigint>;
}): Promise<{
  decision: SponsorDecision;
  release: () => Promise<void>;
}> {
  const noop = async () => {};
  const limits = readLimits();
  // Cheap refusals first, so they cost no Redis writes.
  const pre = decideSponsorship({
    isV3: opts.isV3,
    requiredValue: opts.requiredValue,
    platformBalanceWei: 0n,
    walletCountToday: 0,
    globalCountToday: 0,
    limits: { ...limits, minPlatformWei: 0n },
  });
  if (!pre.sponsored) return { decision: pre, release: noop };
  if (!opts.platformSafe)
    return {
      decision: { sponsored: false, reason: "unavailable" },
      release: noop,
    };

  const wallet = opts.wallet.toLowerCase();
  const day = dayKey();
  const walletKey = `mint-sponsor:wallet:${wallet}:${day}`;
  const globalKey = `mint-sponsor:global:${day}`;

  let platformBalanceWei: bigint | null = null;
  let walletCountToday: number | null = null;
  let globalCountToday: number | null = null;
  let incremented = false;
  try {
    platformBalanceWei = await opts.getBalance(opts.platformSafe);
  } catch (err) {
    console.warn("[MintSponsor] platform balance unreadable:", err);
  }
  const { redis } = await import("@/lib/redis");
  try {
    if (
      platformBalanceWei !== null &&
      platformBalanceWei >= limits.minPlatformWei
    ) {
      // INCR first, then judge: two concurrent mints can never both see the last free slot.
      [walletCountToday, globalCountToday] = await Promise.all([
        redis.incr(walletKey),
        redis.incr(globalKey),
      ]);
      incremented = true;
      await Promise.all([
        redis.expire(walletKey, 2 * 86_400),
        redis.expire(globalKey, 2 * 86_400),
      ]);
    }
  } catch (err) {
    console.warn("[MintSponsor] counters unavailable, not sponsoring:", err);
  }

  const decision =
    platformBalanceWei !== null && platformBalanceWei < limits.minPlatformWei
      ? ({ sponsored: false, reason: "platform-low" } as const)
      : decideSponsorship({
          isV3: opts.isV3,
          requiredValue: opts.requiredValue,
          platformBalanceWei,
          walletCountToday,
          globalCountToday,
          limits,
        });

  const release = async () => {
    if (!incremented) return;
    incremented = false;
    try {
      await Promise.all([redis.decr(walletKey), redis.decr(globalKey)]);
    } catch (err) {
      console.warn("[MintSponsor] could not return a reservation:", err);
    }
  };
  // A refused reservation never mints on the platform's account, so give its slot back now.
  if (!decision.sponsored) await release();
  return { decision, release };
}
