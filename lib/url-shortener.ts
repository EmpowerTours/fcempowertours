import { redis } from './redis';
import { customAlphabet } from 'nanoid';

// Generate short IDs using URL-safe characters (no ambiguous chars)
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

/**
 * Creates a short URL by storing the full URL in Redis
 * @param fullUrl - The full URL to shorten
 * @param ttlSeconds - Time to live in seconds (default: 30 days)
 * @returns The short ID (not the full URL)
 */
export async function createShortUrl(fullUrl: string, ttlSeconds: number = 30 * 24 * 60 * 60): Promise<string | null> {
  try {
    const shortId = nanoid();
    const key = `shorturl:${shortId}`;

    // Store in Redis with TTL
    await redis.set(key, fullUrl, { ex: ttlSeconds });

    console.log(`✅ Short URL created: ${shortId} → ${fullUrl.substring(0, 100)}...`);
    return shortId;
  } catch (error) {
    console.error('❌ Failed to create short URL:', error);
    return null;
  }
}

/**
 * Retrieves the full URL from a short ID
 * @param shortId - The short ID
 * @returns The full URL or null if not found
 */
export async function getFullUrl(shortId: string): Promise<string | null> {
  try {
    const key = `shorturl:${shortId}`;
    const fullUrl = await redis.get<string>(key);
    return fullUrl;
  } catch (error) {
    console.error('❌ Failed to retrieve short URL:', error);
    return null;
  }
}
