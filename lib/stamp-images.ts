/**
 * Stamp Image Store
 *
 * Maps passport+itinerary combinations to AI-generated stamp IPFS hashes.
 * Uses Redis (Upstash) for persistent storage.
 *
 * Storage strategy:
 * - Individual keys: "stamp-image:{passportId}_{itineraryId}" -> ipfsHash
 * - Index key: "stamp-index:{passportId}" -> comma-separated itineraryIds
 */

import { redis } from '@/lib/redis';

const STAMP_PREFIX = 'stamp-image:';
const INDEX_PREFIX = 'stamp-index:';

/**
 * Store an AI-generated stamp image IPFS hash for a passport+itinerary pair.
 */
export async function storeStampImage(
  passportTokenId: bigint,
  itineraryId: bigint,
  ipfsHash: string
): Promise<void> {
  const key = `${STAMP_PREFIX}${passportTokenId}_${itineraryId}`;
  const indexKey = `${INDEX_PREFIX}${passportTokenId}`;

  try {
    // Store the image hash
    await redis.set(key, ipfsHash);

    // Update the index (append itineraryId if not already present)
    const existingIndex = await redis.get(indexKey) as string | null;
    const itinIdStr = itineraryId.toString();
    const ids = existingIndex ? existingIndex.split(',') : [];
    if (!ids.includes(itinIdStr)) {
      ids.push(itinIdStr);
      await redis.set(indexKey, ids.join(','));
    }

    console.log('[StampImages] Stored:', key, '->', ipfsHash);
  } catch (error) {
    console.error('[StampImages] Failed to store stamp image:', error);
  }
}

/**
 * Get all stamp images for a passport token.
 * Returns a map of "{passportTokenId}_{itineraryId}" -> IPFS hash.
 */
export async function getStampImages(
  passportTokenId: bigint
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const indexKey = `${INDEX_PREFIX}${passportTokenId}`;

  try {
    // Get the index of itinerary IDs for this passport
    const indexValue = await redis.get(indexKey) as string | null;
    if (!indexValue) return result;

    const itineraryIds = indexValue.split(',').filter(Boolean);
    if (itineraryIds.length === 0) return result;

    // Fetch all stamp images in parallel
    const keys = itineraryIds.map(id => `${STAMP_PREFIX}${passportTokenId}_${id}`);
    const values = await Promise.all(keys.map(k => redis.get(k)));

    itineraryIds.forEach((itinId, i) => {
      const val = values[i];
      if (val) {
        result[`${passportTokenId}_${itinId}`] = val as string;
      }
    });

    console.log(`[StampImages] Found ${Object.keys(result).length} stamp images for passport #${passportTokenId}`);
  } catch (error) {
    console.error('[StampImages] Failed to get stamp images:', error);
  }

  return result;
}
