/**
 * Listener reward point maths.
 *
 * The WMON listener pool splits pro-rata by "points". Points are the number of
 * songs listened SINCE the last distribution, plus a streak bonus.
 *
 * This lives in one place because two callers must agree exactly:
 *   - app/api/cron/distribute-listener-rewards  — writes points on-chain
 *   - app/api/listener-earnings                 — shows the user an estimate
 *
 * If those two ever drift, the app promises a payout the chain will not honour.
 */

export const LISTENER_STATS_KEY = "live-radio:listener-stats";
export const DISTRIBUTION_SNAPSHOT_KEY = "live-radio:distribution-snapshot";

/**
 * Fallback only — the launch value of `RESERVE_PERCENTAGE`.
 *
 * **This is no longer a constant on-chain.** MusicSubscriptionV6 makes the split governable
 * within hard bounds, so a hardcoded 20 here can silently disagree with what the contract will
 * actually pay. The file header's warning — "if those two ever drift, the app promises a payout
 * the chain will not honour" — stopped being hypothetical when that shipped.
 *
 * Callers should read `RESERVE_PERCENTAGE()` from the subscription contract and pass it in.
 * This value is what {expectedPoolFromRevenue} falls back to when they cannot.
 */
export const RESERVE_PERCENTAGE_FALLBACK = 20n;

/**
 * Only the two fields the point maths reads. No index signature — that would
 * stop the concrete ListenerStats interfaces in the callers from being
 * structurally assignable to this.
 */
export interface ListenerStatsShape {
  totalSongsListened: number;
  currentStreak: number;
}

/**
 * Points a listener has accrued since the last distribution.
 *
 * Mirrors the cron exactly: delta songs, plus 5 points per completed 7-day
 * streak. Returns 0 when the listener has nothing new (the cron skips those).
 */
export function computeListenerPoints(
  stats: ListenerStatsShape | null | undefined,
  previousTotal: number,
): number {
  if (!stats || typeof stats.totalSongsListened !== "number") return 0;

  let delta = stats.totalSongsListened - Number(previousTotal || 0);

  if (stats.currentStreak >= 7) {
    delta += Math.floor(stats.currentStreak / 7) * 5;
  }

  return delta > 0 ? delta : 0;
}

/**
 * Sum of points across every listener — the denominator of the pro-rata split.
 */
export function computeTotalPoints(
  allStats: Record<string, ListenerStatsShape> | null | undefined,
  snapshot: Record<string, number> | null | undefined,
): number {
  if (!allStats) return 0;

  let total = 0;
  for (const [address, stats] of Object.entries(allStats)) {
    total += computeListenerPoints(stats, Number(snapshot?.[address] || 0));
  }
  return total;
}

/**
 * What the listener pool is expected to hold once the month is finalized.
 *
 * The on-chain reserve is credited only inside finalizeMonthlyDistribution, so
 * getReserveBalance() reads 0 for the whole of an open month. Estimating from
 * live revenue is the only way to show a meaningful number before month end.
 */
export function expectedPoolFromRevenue(
  totalRevenueWei: bigint,
  reservePercentage: bigint = RESERVE_PERCENTAGE_FALLBACK,
): bigint {
  return (totalRevenueWei * reservePercentage) / 100n;
}

/**
 * A listener's expected share, in wei. Returns 0n when nobody has points yet
 * rather than dividing by zero.
 */
export function estimatePayoutWei(
  poolWei: bigint,
  myPoints: number,
  totalPoints: number,
): bigint {
  if (totalPoints <= 0 || myPoints <= 0) return 0n;
  return (poolWei * BigInt(myPoints)) / BigInt(totalPoints);
}
