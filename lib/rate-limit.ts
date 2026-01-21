import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

/**
 * Shared rate limiting utility using Upstash Redis
 * SECURITY: Implements IP + identifier based rate limiting
 */

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export interface RateLimitConfig {
  /** Unique identifier for this rate limit (e.g., 'upload', 'delegation') */
  prefix: string;
  /** Time window in seconds */
  windowSeconds: number;
  /** Maximum requests per window */
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
}

/**
 * Get client IP from request headers
 */
export function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

/**
 * Check rate limit for a given identifier
 * Uses both IP and optional user identifier for better protection
 */
export async function checkRateLimit(
  config: RateLimitConfig,
  ip: string,
  userIdentifier?: string
): Promise<RateLimitResult> {
  // Create composite key: IP only, or IP + user for authenticated requests
  const identifier = userIdentifier
    ? `${ip}:${userIdentifier.toLowerCase()}`
    : ip;

  const key = `ratelimit:${config.prefix}:${identifier}`;

  try {
    const current = await redis.incr(key);

    // Set expiry on first request
    if (current === 1) {
      await redis.expire(key, config.windowSeconds);
    }

    // Get TTL for reset time
    const ttl = await redis.ttl(key);

    return {
      allowed: current <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - current),
      resetIn: ttl > 0 ? ttl : config.windowSeconds,
    };
  } catch (error) {
    console.error('[RateLimit] Redis error:', error);
    // SECURITY: Fail closed for sensitive operations
    // List of prefixes that should fail closed
    const sensitiveOperations = ['delegation', 'admin', 'upload', 'mint', 'burn', 'transfer'];
    const shouldFailClosed = sensitiveOperations.some(op => config.prefix.includes(op));

    if (shouldFailClosed) {
      console.warn('[RateLimit] Failing closed for sensitive operation:', config.prefix);
      return {
        allowed: false,
        remaining: 0,
        resetIn: config.windowSeconds,
      };
    }

    // Fail open for non-sensitive operations (better UX)
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetIn: config.windowSeconds,
    };
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimiters = {
  /** General API: 60 requests per minute */
  general: {
    prefix: 'general',
    windowSeconds: 60,
    maxRequests: 60,
  },

  /** Upload operations: 10 per hour */
  upload: {
    prefix: 'upload',
    windowSeconds: 3600,
    maxRequests: 10,
  },

  /** IPFS uploads: 20 per hour */
  ipfsUpload: {
    prefix: 'ipfs',
    windowSeconds: 3600,
    maxRequests: 20,
  },

  /** AI/LLM operations: 30 per minute */
  ai: {
    prefix: 'ai',
    windowSeconds: 60,
    maxRequests: 30,
  },

  /** Farcaster API calls: 100 per minute */
  farcaster: {
    prefix: 'farcaster',
    windowSeconds: 60,
    maxRequests: 100,
  },

  /** Delegation creation: 10 per hour */
  delegation: {
    prefix: 'delegation',
    windowSeconds: 3600,
    maxRequests: 10,
  },

  /** Admin operations: 5 per minute */
  admin: {
    prefix: 'admin',
    windowSeconds: 60,
    maxRequests: 5,
  },

  /** Minting operations: 20 per hour */
  mint: {
    prefix: 'mint',
    windowSeconds: 3600,
    maxRequests: 20,
  },

  /** Burning operations: 10 per hour */
  burn: {
    prefix: 'burn',
    windowSeconds: 3600,
    maxRequests: 10,
  },

  /** Transfer operations: 30 per hour */
  transfer: {
    prefix: 'transfer',
    windowSeconds: 3600,
    maxRequests: 30,
  },

  /** Webhook operations: 200 per minute */
  webhook: {
    prefix: 'webhook',
    windowSeconds: 60,
    maxRequests: 200,
  },

  /** Privacy/profile updates: 10 per hour */
  privacy: {
    prefix: 'privacy',
    windowSeconds: 3600,
    maxRequests: 10,
  },

  /** Execute delegated: 50 per hour */
  execute: {
    prefix: 'execute',
    windowSeconds: 3600,
    maxRequests: 50,
  },
} as const;
