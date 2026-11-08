/**
 * The catalogue with its metadata resolved — name, artwork, audio.
 *
 * ## Why this is a separate layer
 *
 * `catalogue-source.ts` answers "what is on-chain": token ids, artists, prices, and a `tokenURI`.
 * It deliberately stops there, because that is all the contracts know.
 *
 * Everything a listener actually sees — the track name, the cover, the audio file — lives in a
 * JSON document behind that `tokenURI`. The indexer used to resolve those documents and serve
 * them pre-joined, which is the single real convenience it provided. Leaving the indexer means doing
 * that join here instead, once, rather than in each of the fourteen call sites that need it.
 *
 * ## The cache is safe to keep forever
 *
 * A `tokenURI` is an IPFS CID, and a CID is a hash of its content. The document behind a given
 * URI cannot change — a different document is a different CID. So an entry never needs
 * invalidating, and the only reason to bound the map is memory.
 *
 * This is the property that makes dropping the indexer cheap: five masters resolve once per
 * process and never again, so the steady-state cost of a catalogue read is the chain call alone.
 *
 * Failures are cached too, briefly. A gateway that 504s for one track should not have every
 * subsequent request pay the same timeout, but it should recover without a restart.
 */

// Type-only: erased at compile time, so it does not pull `@/lib/artist-name` into the module
// graph that `tools/verify-catalogue-resolved.ts` loads under --experimental-strip-types.
import type { ArtistNameSource } from "@/lib/artist-name";
import type { PublicClient } from "viem";
import type { CatalogueRow } from "@/lib/catalogue-source";

const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY
  ? `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/`
  : "https://gateway.pinata.cloud/ipfs/";

/** Resolve an `ipfs://` URI to a gateway URL. Passes through anything already http(s). */
export function resolveIPFS(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("ipfs://")) return url.replace("ipfs://", PINATA_GATEWAY);
  return url;
}

export interface TrackMetadata {
  name?: string;
  imageUrl?: string;
  audioUrl?: string;
  /** The 3s preview from `animation_url`. Safe to play to anyone. */
  previewUrl?: string;
  /**
   * The metadata document as fetched.
   *
   * Exposed so consumers needing fields this interface does not name — genre, attributes — can
   * read them without a second network fetch, and so they share this cache rather than building
   * a parallel one. Untrusted: anyone who can mint sets it.
   */
  raw?: Record<string, unknown>;
}

export interface ResolvedTrack extends CatalogueRow {
  /** What to call the artist. See `lib/artist-name.ts` for the resolution order. */
  artistName: string;
  /** Where that name came from. `profile` names must be rendered with the address visible. */
  artistNameSource: ArtistNameSource;
  artistNeedsAddressShown: boolean;
  /** Metadata name, or a `Track #N` / `Art #N` placeholder when unresolved. */
  name: string;
  imageUrl: string;
  /**
   * FULL track, from `external_url`. Licensed playback and the radio only —
   * serving this on a public surface gives the whole song away.
   */
  audioUrl?: string;
  /** 3s preview from `animation_url`. What public surfaces should play. */
  previewUrl?: string;
  /** Price in WMON, fixed to 2dp. The raw wei string stays on `price`. */
  priceWMON: string;
}

/** tokenURI → metadata. CIDs are immutable, so a hit never goes stale. */
const metadataCache = new Map<string, TrackMetadata>();
/** tokenURI → when a fetch failed, so a broken gateway is not retried on every request. */
const failureCache = new Map<string, number>();
const FAILURE_TTL_MS = 60_000;

export function _resetCatalogueMetadataCache(): void {
  metadataCache.clear();
  failureCache.clear();
}

/** Fetch and normalise one metadata document. Never throws. */
export async function fetchTrackMetadata(
  tokenURI: string,
): Promise<TrackMetadata> {
  const cached = metadataCache.get(tokenURI);
  if (cached) return cached;

  const failedAt = failureCache.get(tokenURI);
  if (failedAt !== undefined && Date.now() - failedAt < FAILURE_TTL_MS) {
    return {};
  }

  try {
    const url = resolveIPFS(tokenURI);
    if (!url) return {};
    const res = await fetch(url);
    if (!res.ok) {
      failureCache.set(tokenURI, Date.now());
      return {};
    }
    const doc = await res.json();

    // `external_url` is the full track; `animation_url` is a 3-second preview. Preferring the
    // preview would silently serve clips as if they were songs.
    const rawAudio =
      doc.external_url || doc.audio_url || doc.audio || doc.animation_url;
    // Kept separate rather than collapsed into one field. Public surfaces play
    // the preview; the radio and any licensed playback need the full track. One
    // field meant every caller got the full song, so a cast embed streamed the
    // whole record to anyone with the link and no licence.
    const rawPreview = doc.animation_url;

    const meta: TrackMetadata = {
      name: typeof doc.name === "string" ? doc.name : undefined,
      imageUrl: doc.image ? resolveIPFS(doc.image) : undefined,
      audioUrl: rawAudio ? resolveIPFS(rawAudio) : undefined,
      previewUrl: rawPreview ? resolveIPFS(rawPreview) : undefined,
      raw: doc && typeof doc === "object" ? doc : undefined,
    };
    metadataCache.set(tokenURI, meta);
    failureCache.delete(tokenURI);
    return meta;
  } catch {
    failureCache.set(tokenURI, Date.now());
    return {};
  }
}

export interface ResolvedCatalogue {
  tracks: ResolvedTrack[];
  source: "chain";
  reason: string;
}

// ------------------------------------------------------------------ whole-catalogue cache
//
// ## Why the chain read is cached at all
//
// Measured on mainnet 2026-11-07: one catalogue read is 33–36 RPC calls, and `rpc.monad.xyz`
// starts answering 429 at ~150 calls in a burst / ~28 calls/s sustained. It counts CALLS, not
// HTTP requests — ten 30-call batches in one second got five 200s and five 429s — so batching
// makes a read faster but buys no capacity. Uncached, the whole app could serve about one
// catalogue view per second before reads started failing, and every other route shares the
// same budget.
//
// A 15s TTL with single-flight turns that into one read per 15s per process, however many
// people are looking. 15s is the staleness a new mint or a price change can show on a browse
// surface; anything that MOVES MONEY passes `fresh: true` and never sees this cache.
//
// ## Two failure rules, both silent if wrong
//
// 1. **An empty result is never cached.** `readCatalogueFromChain` reports a failed RPC read as
//    `[]`, not as a throw. Caching that would blank the catalogue for the whole TTL.
// 2. **A failed read serves the last good copy, but only up to MAX_STALE.** Past that the
//    failure is passed through, so a long outage shows as an outage rather than a frozen
//    catalogue nobody notices.

export const CATALOGUE_TTL_MS = 15_000;
export const CATALOGUE_MAX_STALE_MS = 5 * 60_000;

interface CacheEntry<T> {
  value?: T;
  at: number;
  inflight?: Promise<T>;
}

/** Exported for `tools/verify-catalogue-resolved.ts`; the app uses the instance below. */
export function makeCatalogueCache<
  T extends { tracks: readonly unknown[] },
>(opts: { ttlMs: number; maxStaleMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, CacheEntry<T>>();
  // Bumped by `invalidate()`. A read that STARTED before an invalidation may finish after it,
  // carrying the pre-change state; it still answers the callers that were waiting on it, but it
  // must not be stored, or the price change it raced would be undone for a whole TTL.
  let generation = 0;

  // A copy of the array, so a caller that sorts or filters in place cannot reorder the copy
  // every other request is about to be served.
  const copy = (v: T): T => ({ ...v, tracks: [...v.tracks] });

  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      let entry = entries.get(key);
      if (!entry) {
        entry = { at: -Infinity };
        entries.set(key, entry);
      }
      const e = entry;
      const usableStale = () =>
        e.value !== undefined && now() - e.at < opts.maxStaleMs;

      if (e.value !== undefined && now() - e.at < opts.ttlMs)
        return copy(e.value);
      if (e.inflight) return copy(await e.inflight);

      const startedIn = generation;
      const read: Promise<T> = (async () => {
        try {
          const v = await load();
          if (v.tracks.length === 0) {
            if (usableStale()) {
              console.warn(
                "[catalogue-cache] empty read, serving last good copy",
              );
              return e.value as T;
            }
            return v; // returned, not stored: the next request reads again
          }
          if (startedIn === generation) {
            e.value = v;
            e.at = now();
          }
          return v;
        } catch (err) {
          if (usableStale()) {
            console.warn(
              "[catalogue-cache] read failed, serving last good copy:",
              err,
            );
            return e.value as T;
          }
          throw err;
        }
      })();
      e.inflight = read;
      // Cleanup is attached HERE, not as a `finally` inside the async body: a `load` that throws
      // synchronously runs that body's catch/finally before `read` is assigned, so a finally
      // reading `read` would hit the TDZ and replace the real error with a ReferenceError.
      // Only our own slot is cleared: after an invalidation a newer read may already hold it.
      read
        .finally(() => {
          if (e.inflight === read) e.inflight = undefined;
        })
        .catch(() => {
          // The rejection is delivered to the callers awaiting `read`; this branch only exists
          // so the cleanup chain is not reported as an unhandled rejection.
        });
      return copy(await read);
    },
    /**
     * Expire every entry now, after a confirmed on-chain change. The last good copy is KEPT for
     * the stale-on-error fallback; it is just no longer fresh, so the next request reads again.
     */
    invalidate(): void {
      generation++;
      for (const e of entries.values()) {
        e.at = Math.min(e.at, now() - opts.ttlMs);
        e.inflight = undefined;
      }
    },
    reset(): void {
      generation++;
      entries.clear();
    },
  };
}

const catalogueCache = makeCatalogueCache<ResolvedCatalogue>({
  ttlMs: CATALOGUE_TTL_MS,
  maxStaleMs: CATALOGUE_MAX_STALE_MS,
});

export function _resetCatalogueCache(): void {
  catalogueCache.reset();
}

/**
 * Call after a CONFIRMED transaction that changes what the catalogue shows — a mint, a price or
 * pause change, a burn — so the next read reflects it instead of waiting out the TTL.
 *
 * In-process only. With `numReplicas = 1` (railway.toml) that is the whole app; with more
 * replicas each would keep its own copy until its TTL ran out.
 */
export function invalidateCatalogue(): void {
  catalogueCache.invalidate();
}

/**
 * The catalogue, joined to its metadata, at most `CATALOGUE_TTL_MS` old.
 *
 * Pass `fresh: true` from anything that moves money or decides a guard (a price, the artist a
 * self-purchase check compares against). The cache key is `limit` only: a passed `client` is a
 * transport choice and reads the same contracts.
 */
export async function getResolvedCatalogue(opts?: {
  limit?: number;
  client?: PublicClient;
  fresh?: boolean;
}): Promise<ResolvedCatalogue> {
  if (opts?.fresh) return readResolvedCatalogue(opts);
  return catalogueCache.get(String(opts?.limit ?? "default"), () =>
    readResolvedCatalogue(opts),
  );
}

/**
 * The catalogue, joined to its metadata, read now.
 *
 * Resolution runs in parallel and a failure degrades one track to its placeholder name rather
 * than failing the request — a dead gateway should cost you a cover image, not the page.
 */
async function readResolvedCatalogue(opts?: {
  limit?: number;
  client?: PublicClient;
}): Promise<ResolvedCatalogue> {
  // Imported at call time, not at module scope: `catalogue-source` pulls in `@/app/chains`, and
  // the `@/` alias does not resolve under `node --experimental-strip-types`. Keeping the metadata
  // helpers free of it is what lets `tools/verify-catalogue-resolved.ts` exercise them directly.
  const { getCatalogue } = await import("@/lib/catalogue-source");
  const { rows, source, reason } = await getCatalogue(opts);

  // Names resolved for the whole page at once: one Neynar request, then a registry read only for
  // the artists Farcaster did not answer for. Done here rather than per call site because the
  // per-route copies were the reason the same failed lookup repeated through the logs.
  const { resolveArtistNames, profileLookup } = await import(
    "@/lib/artist-name"
  );
  const { createPublicClient, http } = await import("viem");
  const { activeChain } = await import("@/app/chains");

  const client =
    opts?.client ??
    createPublicClient({
      chain: activeChain,
      transport: http(undefined, { batch: { wait: 10 } }),
    });
  const names = await resolveArtistNames(
    // Address AND the fid the contract recorded. Passing bare addresses is what left every
    // master showing `0x8df6…8ec1`: the deployer key has no Farcaster account, so the by-address
    // lookup had nothing to find and the answer sitting in `getMaster` went unused.
    rows.map((r) => ({ address: r.artist, fid: r.artistFid })),
    profileLookup(
      client as Parameters<typeof profileLookup>[0],
      process.env.NEXT_PUBLIC_PROFILE_REGISTRY as `0x${string}` | undefined,
    ),
  );

  const tracks = await Promise.all(
    rows.map(async (row): Promise<ResolvedTrack> => {
      const meta = await fetchTrackMetadata(row.tokenURI);
      const artistName = names.get(row.artist?.toLowerCase() ?? "");
      return {
        ...row,
        artistName: artistName?.display ?? row.artist ?? "",
        artistNameSource: artistName?.source ?? "address",
        artistNeedsAddressShown: artistName?.needsAddressShown ?? false,
        name:
          meta.name ??
          (row.isArt ? `Art #${row.tokenId}` : `Track #${row.tokenId}`),
        imageUrl: meta.imageUrl ?? "",
        audioUrl: meta.audioUrl,
        previewUrl: meta.previewUrl,
        priceWMON: row.price ? (Number(row.price) / 1e18).toFixed(2) : "0",
      };
    }),
  );

  return { tracks, source, reason };
}

/**
 * One track by id, or null. Reads the whole catalogue — it is a handful of rows and cached.
 * `fresh: true` bypasses the cache; use it wherever the answer gates or prices a purchase.
 */
export async function getResolvedTrack(
  tokenId: string | number,
  opts?: { client?: PublicClient; fresh?: boolean },
): Promise<ResolvedTrack | null> {
  const { tracks } = await getResolvedCatalogue(opts);
  const wanted = String(tokenId);
  return tracks.find((t) => String(t.tokenId) === wanted) ?? null;
}
