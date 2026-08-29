import type { EPKMetadata } from "./types";

/**
 * Convert an artist name to a URL-safe slug
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validate EPK metadata structure
 */
export function validateEPK(epk: Partial<EPKMetadata>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!epk.artist?.name) errors.push("Artist name is required");
  if (!epk.artist?.bio) errors.push("Artist bio is required");
  if (!epk.artist?.genre || epk.artist.genre.length === 0)
    errors.push("At least one genre is required");
  if (!epk.artist?.location) errors.push("Location is required");

  if (epk.press) {
    for (const article of epk.press) {
      if (!article.outlet) errors.push("Press article outlet is required");
      if (!article.title) errors.push("Press article title is required");
      if (!article.url) errors.push("Press article URL is required");
    }
  }

  return { valid: errors.length === 0, errors };
}

/*
 * `fetchArtistStreamingStats` and `fetchEPKFromChain` used to live here, as two GraphQL documents
 * against the indexer. Both moved to `lib/epk/chain.ts` and read the contracts instead —
 * `artistEPKs(address)` returns the current CID in one read rather than joining an EPKCreated
 * event to the latest EPKUpdated, and it exposes `active`, which the event pair could not see.
 */

/**
 * Fetch EPK metadata JSON from IPFS
 */
export async function fetchEPKFromIPFS(
  ipfsCid: string,
): Promise<EPKMetadata | null> {
  const gateways = [
    `https://${process.env.PINATA_GATEWAY || "harlequin-used-hare-224.mypinata.cloud"}/ipfs/${ipfsCid}`,
    `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
    `https://ipfs.io/ipfs/${ipfsCid}`,
  ];

  for (const url of gateways) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      continue;
    }
  }

  console.error("[EPK] Failed to fetch from IPFS:", ipfsCid);
  return null;
}

/**
 * Get Rumble embed URL from a Rumble video page URL
 */
export function getRumbleEmbedUrl(_url: string): string | null {
  // Rumble embed IDs differ from page URL slugs, so we can't derive
  // the embed URL from the page URL. Return null to fall back to link.
  return null;
}
