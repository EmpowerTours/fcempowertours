/**
 * The EPK reads that used to be GraphQL.
 *
 * ## What the indexer was asked, and what the contracts answer
 *
 * Two queries, both replaceable, and one of them was answering the wrong question.
 *
 * **The EPK itself.** `EPKRegistry_EPKCreated` plus a `desc`-ordered `EPKRegistry_EPKUpdated`,
 * joined client-side to work out the current CID. `artistEPKs(address)` is a public mapping
 * returning the whole struct — cid, fid, createdAt, updatedAt — in one read, and it carries
 * `active`, which the event pair could not see at all: a deactivated EPK still has an `EPKCreated`
 * event, so the indexer served pages for artists who had taken theirs down. That is a correctness
 * fix, not a migration artifact.
 *
 * **Streaming stats.** Masters, plays, payouts and licences. Masters come from the catalogue,
 * licences from the registry, plays from `artistLifetimePlays`, revenue from the subscription's
 * monthly payouts.
 *
 * ## What genuinely does not survive, and is reported rather than faked
 *
 * `uniqueListeners`. The indexer counted distinct `listener` addresses across every
 * `PlayOracle_PlayRecorded` row. No contract keeps that: `PlayOracleV3` stores
 * `lastPlayTime[user][song]` — a timestamp, not a roster — and `MusicSubscriptionV6` keys plays by
 * user and day without an enumerable set. The play ledger holds a recent window, so a count from
 * it is a floor over the last hundred plays, not a lifetime figure.
 *
 * It returns `null`, and the callers render "—". Returning `0` would say nobody has ever listened,
 * which is a different and false claim.
 *
 * Per-song play counts have the same shape: `artistLifetimePlays` is authoritative for the artist
 * TOTAL, but no contract breaks it down per master, so the split comes from the ledger window and
 * is marked as a floor when that window is full.
 */

import { parseAbi, type Address, type PublicClient } from "viem";
import type { ArtistStreamingStats, SongStats } from "./types";

const EPK_ABI = parseAbi([
  "function artistEPKs(address) view returns (string ipfsCid, uint256 artistFid, uint256 createdAt, uint256 updatedAt, bool active)",
]);

const SUBSCRIPTION_ABI = parseAbi([
  "function artistLifetimePlays(address) view returns (uint256)",
  "function getCurrentMonthStats() view returns (uint256 monthId, uint256 totalRevenue, uint256 totalPlays, bool finalized)",
  "function artistMonthlyPayouts(uint256 monthId, address artist) view returns (uint256)",
]);

export interface OnChainEPK {
  ipfsCid: string;
  artistFid: number;
  createdAt: number;
  updatedAt: number;
  active: boolean;
}

/**
 * One artist's EPK record.
 *
 * @returns `null` when no EPK exists OR when it has been deactivated — a deactivated EPK must not
 *   render, which is the bug the event-based version had.
 */
export async function readEPKFromChain(
  client: PublicClient,
  registry: Address,
  artist: string,
): Promise<OnChainEPK | null> {
  try {
    // A public mapping getter returns MULTIPLE NAMED VALUES, which viem decodes as a positional
    // tuple — not as an object, which is how a named struct return decodes. Both shapes exist in
    // this codebase and reading one as the other yields `undefined` everywhere, not an error.
    const r = (await client.readContract({
      address: registry,
      abi: EPK_ABI,
      functionName: "artistEPKs",
      args: [artist as Address],
    })) as readonly [string, bigint, bigint, bigint, boolean];

    const [ipfsCid, artistFid, createdAt, updatedAt, active] = r;
    if (!ipfsCid || !active) return null;

    return {
      ipfsCid,
      artistFid: Number(artistFid),
      createdAt: Number(createdAt),
      updatedAt: Number(updatedAt),
      active,
    };
  } catch (error) {
    console.error("[EPK] artistEPKs read failed:", error);
    return null;
  }
}

/** How many months back to sum payouts. Older months are finalized and unchanging. */
const PAYOUT_MONTHS = 12;

export interface StreamingStatsResult extends ArtistStreamingStats {
  /**
   * Distinct listeners is not contract state and is not reported as a number — see the note at
   * the top. `null` means unknown, never zero.
   */
  uniqueListeners: number | null;
  /** True when the per-song play split came from a full ledger window, so each is a floor. */
  perSongPlaysAreFloor: boolean;
  /** What could not be answered, for a caller that would rather say so than show a zero. */
  unavailable: string[];
}

/**
 * One artist's streaming figures.
 *
 * `tracks` is passed in rather than fetched so this shares the caller's resolved catalogue —
 * cover art and titles come from the same metadata cache as every other surface, instead of a
 * second copy.
 */
export async function readArtistStreamingStats(
  client: PublicClient,
  artist: string,
  opts: {
    tracks: {
      tokenId: string;
      name: string;
      artist: string;
      imageUrl: string;
      audioUrl?: string;
    }[];
    subscription?: Address;
    licenceCountsByToken?: Map<string, number>;
    /** Per-master play counts from the ledger window, and whether that window was full. */
    ledgerPlays?: { byToken: Map<string, number>; saturated: boolean };
  },
): Promise<StreamingStatsResult> {
  const unavailable: string[] = [];
  const mine = opts.tracks.filter(
    (t) => t.artist.toLowerCase() === artist.toLowerCase(),
  );

  let totalPlays = 0;
  let totalRevenueWei = 0n;

  if (!opts.subscription) {
    unavailable.push("plays and revenue (subscription address unset)");
  } else {
    try {
      totalPlays = Number(
        (await client.readContract({
          address: opts.subscription,
          abi: SUBSCRIPTION_ABI,
          functionName: "artistLifetimePlays",
          args: [artist as Address],
        })) as bigint,
      );
    } catch (error) {
      console.error("[EPK] artistLifetimePlays failed:", error);
      unavailable.push("plays");
    }

    try {
      const current = (await client.readContract({
        address: opts.subscription,
        abi: SUBSCRIPTION_ABI,
        functionName: "getCurrentMonthStats",
      })) as readonly [bigint, bigint, bigint, boolean];
      const currentMonth = Number(current[0]);

      // `artistMonthlyPayouts` is what was actually PAID, unlike the pro-rata figure
      // artist-earnings derives for a month still open. An EPK should show money received.
      const payouts = await client.multicall({
        contracts: Array.from({ length: PAYOUT_MONTHS }, (_, i) => ({
          address: opts.subscription as Address,
          abi: SUBSCRIPTION_ABI,
          functionName: "artistMonthlyPayouts" as const,
          args: [
            BigInt(Math.max(0, currentMonth - i)),
            artist as Address,
          ] as const,
        })),
        allowFailure: true,
      });
      for (const p of payouts) {
        if (p.status === "success") totalRevenueWei += p.result as bigint;
      }
    } catch (error) {
      console.error("[EPK] payout read failed:", error);
      unavailable.push("revenue");
    }
  }

  const ledger = opts.ledgerPlays;
  if (!ledger) unavailable.push("per-song play split");

  const topSongs: SongStats[] = mine
    .map((t) => ({
      tokenId: Number(t.tokenId),
      title: t.name,
      artist: t.artist,
      coverImage: t.imageUrl,
      audioUrl: t.audioUrl ?? "",
      plays: ledger?.byToken.get(t.tokenId) ?? 0,
      sales: opts.licenceCountsByToken?.get(t.tokenId) ?? 0,
    }))
    .sort((a, b) => b.plays - a.plays);

  const totalSales = topSongs.reduce((sum, s) => sum + s.sales, 0);

  // Not derivable from any contract. See the note at the top of this file.
  unavailable.push("uniqueListeners");

  return {
    totalPlays,
    uniqueListeners: null,
    totalSales,
    totalRevenue: (Number(totalRevenueWei) / 1e18).toFixed(2),
    topSongs,
    perSongPlaysAreFloor: ledger?.saturated ?? false,
    unavailable,
  };
}

/**
 * `readArtistStreamingStats` with its inputs gathered.
 *
 * All four EPK routes want the same three things — the artist's masters, how many licences each
 * has sold, and the recent play split — and each had its own GraphQL document for it. This is
 * that, once. The heavy imports are dynamic for the reason `catalogue-resolved` documents: they
 * pull in `@/app/chains`, and the `@/` alias does not resolve under `--experimental-strip-types`,
 * so keeping them out of the module scope is what lets the logic above be tested directly.
 */
export async function getArtistStreamingStats(
  artist: string,
  client?: PublicClient,
): Promise<StreamingStatsResult> {
  const { createPublicClient, http } = await import("viem");
  const { activeChain } = await import("@/app/chains");
  const { getResolvedCatalogue } = await import("@/lib/catalogue-resolved");
  const { getRecentLicenses } = await import("@/lib/user-holdings");

  const read =
    client ??
    (createPublicClient({
      chain: activeChain,
      transport: http(),
    }) as PublicClient);

  const [catalogue, licences, ledger] = await Promise.all([
    getResolvedCatalogue({ client: read, limit: 1000 }).catch(() => null),
    getRecentLicenses(read, undefined, 512).catch(() => null),
    readLedgerPlays().catch(() => null),
  ]);

  const licenceCountsByToken = new Map<string, number>();
  for (const l of licences ?? []) {
    const id = l.masterTokenId;
    licenceCountsByToken.set(id, (licenceCountsByToken.get(id) ?? 0) + 1);
  }

  const stats = await readArtistStreamingStats(read, artist, {
    tracks: catalogue?.tracks ?? [],
    subscription: process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as
      | Address
      | undefined,
    licenceCountsByToken: licences ? licenceCountsByToken : undefined,
    ledgerPlays: ledger ?? undefined,
  });

  if (!catalogue) stats.unavailable.push("catalogue");
  if (!licences) stats.unavailable.push("sales");
  return stats;
}

/** Per-master play counts from the trimmed ledger, and whether that window was full. */
async function readLedgerPlays(): Promise<{
  byToken: Map<string, number>;
  saturated: boolean;
}> {
  const { Redis } = await import("@upstash/redis");
  const { PLAY_HISTORY_KEY, PLAY_HISTORY_CAP, toPlayWindow } = await import(
    "@/lib/play-ledger"
  );

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const raw = await redis.lrange(PLAY_HISTORY_KEY, 0, PLAY_HISTORY_CAP - 1);
  const window = toPlayWindow(raw, (entry) => {
    try {
      return typeof entry === "string" ? JSON.parse(entry) : entry;
    } catch {
      return null;
    }
  });

  const byToken = new Map<string, number>();
  for (const play of window.plays as { tokenId?: string | number }[]) {
    if (play?.tokenId === undefined) continue;
    const id = String(play.tokenId);
    byToken.set(id, (byToken.get(id) ?? 0) + 1);
  }
  return { byToken, saturated: window.saturated };
}
