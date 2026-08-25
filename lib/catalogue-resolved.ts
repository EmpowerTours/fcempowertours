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
 * them pre-joined, which is the single real convenience it provided. Leaving Envio means doing
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
  artistNameSource: "farcaster" | "profile" | "address";
  artistNeedsAddressShown: boolean;
  /** Metadata name, or a `Track #N` / `Art #N` placeholder when unresolved. */
  name: string;
  imageUrl: string;
  /** Full track. `external_url` is preferred over `animation_url`, which is a 3s preview. */
  audioUrl?: string;
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

    const meta: TrackMetadata = {
      name: typeof doc.name === "string" ? doc.name : undefined,
      imageUrl: doc.image ? resolveIPFS(doc.image) : undefined,
      audioUrl: rawAudio ? resolveIPFS(rawAudio) : undefined,
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

/**
 * The catalogue, joined to its metadata.
 *
 * Resolution runs in parallel and a failure degrades one track to its placeholder name rather
 * than failing the request — a dead gateway should cost you a cover image, not the page.
 */
export async function getResolvedCatalogue(opts?: {
  limit?: number;
  client?: PublicClient;
  fetchFromEnvio?: () => Promise<CatalogueRow[]>;
}): Promise<{
  tracks: ResolvedTrack[];
  source: "envio" | "chain";
  reason: string;
}> {
  // Imported at call time, not at module scope, for the same reason `envio-health.ts` takes the
  // chain head as a callback: `catalogue-source` pulls in `@/app/chains`, and the `@/` alias does
  // not resolve under `node --experimental-strip-types`. Keeping the metadata helpers free of it
  // is what lets `tools/verify-catalogue-resolved.ts` exercise them directly.
  const { getCatalogue } = await import("@/lib/catalogue-source");
  const { rows, source, reason } = await getCatalogue(opts);

  // Names resolved for the whole page at once: one Neynar request, then a registry read only for
  // the artists Farcaster did not answer for. Done here rather than per call site because the
  // per-route copies were the reason the same failed lookup repeated through the logs.
  const { resolveArtistNames, profileLookup } = await import("@/lib/artist-name");
  const { createPublicClient, http } = await import("viem");
  const { activeChain } = await import("@/app/chains");

  const client =
    opts?.client ??
    createPublicClient({ chain: activeChain, transport: http() });
  const names = await resolveArtistNames(
    rows.map((r) => r.artist),
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
        priceWMON: row.price ? (Number(row.price) / 1e18).toFixed(2) : "0",
      };
    }),
  );

  return { tracks, source, reason };
}

/** One track by id, or null. Reads the whole catalogue — it is five rows and cached. */
export async function getResolvedTrack(
  tokenId: string | number,
  opts?: { client?: PublicClient },
): Promise<ResolvedTrack | null> {
  const { tracks } = await getResolvedCatalogue(opts);
  const wanted = String(tokenId);
  return tracks.find((t) => String(t.tokenId) === wanted) ?? null;
}
