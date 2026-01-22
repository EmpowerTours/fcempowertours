import { verifyMessage, recoverMessageAddress, Address, Hex, hashMessage } from 'viem';
import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

/**
 * 🔐 SECURITY: Centralized Authentication & Authorization Utility
 *
 * This module provides backend-verified authentication to prevent
 * frontend manipulation attacks.
 *
 * Features:
 * - EIP-191 message signature verification
 * - Timestamp-based replay protection
 * - Nonce management for critical operations
 * - Farcaster FID verification via Neynar
 * - Rate limit integration
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Signature expiry time (5 minutes) */
export const SIGNATURE_EXPIRY_MS = 5 * 60 * 1000;

/** Maximum clock skew allowed (1 minute) */
export const MAX_CLOCK_SKEW_MS = 60 * 1000;

/** Nonce expiry (10 minutes) */
export const NONCE_EXPIRY_SECONDS = 600;

/** FID verification cache TTL (1 hour) */
export const FID_CACHE_TTL_SECONDS = 3600;

// ============================================================================
// TYPES
// ============================================================================

export interface AuthResult {
  valid: boolean;
  error?: string;
  address?: string;
  fid?: number;
}

export interface SignaturePayload {
  address: string;
  signature: string;
  timestamp: number;
  message?: string;
  nonce?: string;
}

export interface FarcasterAuthPayload extends SignaturePayload {
  fid: number;
}

// ============================================================================
// MESSAGE BUILDERS
// ============================================================================

/**
 * Build a standard signed message for delegation creation
 */
export function buildDelegationMessage(
  address: string,
  timestamp: number,
  nonce: string,
  durationHours: number
): string {
  return `EmpowerTours Delegation Request

Address: ${address.toLowerCase()}
Action: Create gasless delegation
Duration: ${durationHours} hours
Timestamp: ${timestamp}
Nonce: ${nonce}

Sign this message to authorize gasless transactions on your behalf.`;
}

/**
 * Build a standard signed message for minting
 */
export function buildMintMessage(
  address: string,
  timestamp: number,
  nonce: string,
  type: 'music' | 'passport' | 'itinerary'
): string {
  return `EmpowerTours ${type.charAt(0).toUpperCase() + type.slice(1)} Mint Request

Address: ${address.toLowerCase()}
Action: Mint ${type} NFT
Timestamp: ${timestamp}
Nonce: ${nonce}

Sign this message to authorize minting.`;
}

/**
 * Build a standard signed message for burning
 */
export function buildBurnMessage(
  address: string,
  timestamp: number,
  nonce: string,
  tokenId: string | number
): string {
  return `EmpowerTours Burn Request

Address: ${address.toLowerCase()}
Action: Burn NFT
Token ID: ${tokenId}
Timestamp: ${timestamp}
Nonce: ${nonce}

Sign this message to authorize burning your NFT.`;
}

/**
 * Build a generic action message
 */
export function buildActionMessage(
  address: string,
  timestamp: number,
  nonce: string,
  action: string,
  details?: string
): string {
  return `EmpowerTours Action Request

Address: ${address.toLowerCase()}
Action: ${action}
${details ? `Details: ${details}\n` : ''}Timestamp: ${timestamp}
Nonce: ${nonce}

Sign this message to authorize this action.`;
}

// ============================================================================
// NONCE MANAGEMENT
// ============================================================================

/**
 * Generate a unique nonce for an operation
 * Stored in Redis to prevent replay attacks
 * SECURITY: Uses crypto.randomBytes for unpredictable nonces
 */
export async function generateNonce(
  address: string,
  operation: string
): Promise<string> {
  const randomPart = randomBytes(16).toString('hex');
  const nonce = `${Date.now()}-${randomPart}`;
  const key = `nonce:${address.toLowerCase()}:${operation}:${nonce}`;

  // Store nonce with expiry
  await redis.setex(key, NONCE_EXPIRY_SECONDS, 'pending');

  console.log(`[Auth] Generated nonce for ${address}: ${nonce}`);
  return nonce;
}

/**
 * Verify and consume a nonce (one-time use)
 */
export async function verifyAndConsumeNonce(
  address: string,
  operation: string,
  nonce: string
): Promise<boolean> {
  const key = `nonce:${address.toLowerCase()}:${operation}:${nonce}`;

  const status = await redis.get(key);

  if (!status) {
    console.log(`[Auth] Nonce not found or expired: ${nonce}`);
    return false;
  }

  if (status === 'used') {
    console.log(`[Auth] Nonce already used: ${nonce}`);
    return false;
  }

  // Mark as used (but keep for a bit to prevent race conditions)
  await redis.setex(key, 60, 'used');

  console.log(`[Auth] Nonce consumed: ${nonce}`);
  return true;
}

// ============================================================================
// TIMESTAMP VALIDATION
// ============================================================================

/**
 * Validate timestamp is within acceptable window
 */
export function validateTimestamp(timestamp: number): AuthResult {
  const now = Date.now();

  // Check for expiry
  if (now - timestamp > SIGNATURE_EXPIRY_MS) {
    return {
      valid: false,
      error: `Signature expired. Request must be signed within ${SIGNATURE_EXPIRY_MS / 1000 / 60} minutes.`
    };
  }

  // Check for future timestamp (clock skew protection)
  if (timestamp > now + MAX_CLOCK_SKEW_MS) {
    return {
      valid: false,
      error: 'Invalid timestamp (future date detected).'
    };
  }

  return { valid: true };
}

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify an EIP-191 personal_sign signature
 * Returns the recovered address if valid
 */
export async function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<AuthResult> {
  try {
    const isValid = await verifyMessage({
      address: expectedAddress as Address,
      message,
      signature: signature as Hex,
    });

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid signature. Please sign with the correct wallet.'
      };
    }

    return {
      valid: true,
      address: expectedAddress.toLowerCase()
    };
  } catch (error: any) {
    console.error('[Auth] Signature verification error:', error);
    return {
      valid: false,
      error: 'Signature verification failed.'
    };
  }
}

/**
 * Recover address from signature (more flexible than verify)
 */
export async function recoverAddressFromSignature(
  message: string,
  signature: string
): Promise<AuthResult> {
  try {
    const recoveredAddress = await recoverMessageAddress({
      message,
      signature: signature as Hex,
    });

    return {
      valid: true,
      address: recoveredAddress.toLowerCase()
    };
  } catch (error: any) {
    console.error('[Auth] Address recovery error:', error);
    return {
      valid: false,
      error: 'Failed to recover address from signature.'
    };
  }
}

// ============================================================================
// FULL AUTHENTICATION FLOW
// ============================================================================

/**
 * Complete authentication for a signed request
 * Validates timestamp, nonce, and signature
 */
export async function authenticateRequest(
  payload: SignaturePayload,
  expectedMessage: string,
  operation: string,
  requireNonce: boolean = true
): Promise<AuthResult> {
  const { address, signature, timestamp, nonce } = payload;

  // 1. Validate inputs
  if (!address || !signature || !timestamp) {
    return {
      valid: false,
      error: 'Missing required authentication fields: address, signature, timestamp'
    };
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return {
      valid: false,
      error: 'Invalid Ethereum address format'
    };
  }

  // 2. Validate timestamp
  const timestampResult = validateTimestamp(timestamp);
  if (!timestampResult.valid) {
    return timestampResult;
  }

  // 3. Validate nonce (if required)
  if (requireNonce) {
    if (!nonce) {
      return {
        valid: false,
        error: 'Missing nonce. Request a nonce first via GET endpoint.'
      };
    }

    const nonceValid = await verifyAndConsumeNonce(address, operation, nonce);
    if (!nonceValid) {
      return {
        valid: false,
        error: 'Invalid or expired nonce. Request a new one.'
      };
    }
  }

  // 4. Verify signature
  const signatureResult = await verifySignature(expectedMessage, signature, address);
  if (!signatureResult.valid) {
    return signatureResult;
  }

  console.log(`[Auth] ✅ Authenticated: ${address} for ${operation}`);

  return {
    valid: true,
    address: address.toLowerCase()
  };
}

// ============================================================================
// FARCASTER VERIFICATION
// ============================================================================

/**
 * Verify that a wallet address is linked to a Farcaster FID
 * Uses Neynar API with caching
 */
export async function verifyFarcasterFID(
  fid: number,
  expectedAddress: string
): Promise<AuthResult> {
  const cacheKey = `fid-verify:${fid}:${expectedAddress.toLowerCase()}`;

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached === 'valid') {
    return { valid: true, fid, address: expectedAddress.toLowerCase() };
  }
  if (cached === 'invalid') {
    return { valid: false, error: 'FID not linked to this address (cached)' };
  }

  try {
    const neynarApiKey = process.env.NEYNAR_API_KEY;
    if (!neynarApiKey) {
      console.error('[Auth] NEYNAR_API_KEY not configured');
      // Fail closed - require proper configuration
      return {
        valid: false,
        error: 'Server configuration error: Farcaster verification unavailable'
      };
    }

    // Fetch user data from Neynar
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': neynarApiKey,
        },
      }
    );

    if (!response.ok) {
      console.error(`[Auth] Neynar API error: ${response.status}`);
      return {
        valid: false,
        error: 'Failed to verify Farcaster identity'
      };
    }

    const data = await response.json();
    const user = data.users?.[0];

    if (!user) {
      await redis.setex(cacheKey, FID_CACHE_TTL_SECONDS, 'invalid');
      return {
        valid: false,
        error: `FID ${fid} not found`
      };
    }

    // Check if address is in verified addresses or custody address
    const verifiedAddresses = user.verified_addresses?.eth_addresses || [];
    const custodyAddress = user.custody_address;
    const allAddresses = [...verifiedAddresses, custodyAddress]
      .filter(Boolean)
      .map((a: string) => a.toLowerCase());

    const addressMatch = allAddresses.includes(expectedAddress.toLowerCase());

    if (!addressMatch) {
      await redis.setex(cacheKey, FID_CACHE_TTL_SECONDS, 'invalid');
      console.log(`[Auth] FID ${fid} addresses:`, allAddresses);
      console.log(`[Auth] Expected: ${expectedAddress.toLowerCase()}`);
      return {
        valid: false,
        error: `Address ${expectedAddress} is not linked to FID ${fid}`
      };
    }

    // Cache valid result
    await redis.setex(cacheKey, FID_CACHE_TTL_SECONDS, 'valid');

    console.log(`[Auth] ✅ FID ${fid} verified for ${expectedAddress}`);
    return {
      valid: true,
      fid,
      address: expectedAddress.toLowerCase()
    };

  } catch (error: any) {
    console.error('[Auth] Farcaster verification error:', error);
    return {
      valid: false,
      error: 'Farcaster verification failed'
    };
  }
}

/**
 * Full Farcaster authentication with signature
 * Verifies both FID ownership and signature
 */
export async function authenticateFarcasterRequest(
  payload: FarcasterAuthPayload,
  expectedMessage: string,
  operation: string,
  requireNonce: boolean = true
): Promise<AuthResult> {
  const { fid, address, signature, timestamp, nonce } = payload;

  // 1. Validate FID
  if (!fid || fid <= 0) {
    return {
      valid: false,
      error: 'Invalid Farcaster ID (FID)'
    };
  }

  // 2. Verify FID is linked to address
  const fidResult = await verifyFarcasterFID(fid, address);
  if (!fidResult.valid) {
    return fidResult;
  }

  // 3. Standard authentication flow
  const authResult = await authenticateRequest(
    { address, signature, timestamp, nonce },
    expectedMessage,
    operation,
    requireNonce
  );

  if (!authResult.valid) {
    return authResult;
  }

  return {
    valid: true,
    address: address.toLowerCase(),
    fid
  };
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

/** Valid ISO 3166-1 alpha-2 country codes */
export const VALID_COUNTRY_CODES = new Set([
  'AF', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ',
  'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BA', 'BW', 'BR', 'BN',
  'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CN', 'CO', 'KM', 'CG',
  'CD', 'CR', 'CI', 'HR', 'CU', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ',
  'ER', 'EE', 'ET', 'FJ', 'FI', 'FR', 'GA', 'GM', 'GE', 'DE', 'GH', 'GR', 'GD', 'GT', 'GN',
  'GW', 'GY', 'HT', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IL', 'IT', 'JM',
  'JP', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY',
  'LI', 'LT', 'LU', 'MO', 'MK', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MR', 'MU', 'MX',
  'FM', 'MD', 'MC', 'MN', 'ME', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NZ', 'NI', 'NE',
  'NG', 'NO', 'OM', 'PK', 'PW', 'PA', 'PG', 'PY', 'PE', 'PH', 'PL', 'PT', 'PR', 'QA', 'RO',
  'RU', 'RW', 'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK',
  'SI', 'SB', 'SO', 'ZA', 'SS', 'ES', 'LK', 'SD', 'SR', 'SZ', 'SE', 'CH', 'SY', 'TW', 'TJ',
  'TZ', 'TH', 'TL', 'TG', 'TO', 'TT', 'TN', 'TR', 'TM', 'TV', 'UG', 'UA', 'AE', 'GB', 'US',
  'UY', 'UZ', 'VU', 'VE', 'VN', 'YE', 'ZM', 'ZW'
]);

/**
 * Validate country code
 */
export function validateCountryCode(code: string): AuthResult {
  if (!code || typeof code !== 'string') {
    return {
      valid: false,
      error: 'Country code is required'
    };
  }

  const normalized = code.toUpperCase().trim();

  if (!VALID_COUNTRY_CODES.has(normalized)) {
    return {
      valid: false,
      error: `Invalid country code: ${code}`
    };
  }

  return { valid: true };
}

/**
 * Sanitize text input to prevent injection attacks
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .slice(0, maxLength)
    .replace(/[<>\"'`]/g, '') // Remove potential XSS chars
    .replace(/\\/g, '') // Remove backslashes
    .trim();
}

/**
 * Sanitize for GraphQL queries (prevent injection)
 */
export function sanitizeGraphQLInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/[{}()\[\]\\\"'`;$]/g, '') // Remove GraphQL special chars
    .replace(/%/g, '\\%') // Escape LIKE wildcards
    .replace(/_/g, '\\_')
    .trim()
    .slice(0, 200);
}

// ============================================================================
// ERROR RESPONSE HELPERS
// ============================================================================

/**
 * Sanitize error for client response
 * Removes sensitive internal details
 */
export function sanitizeErrorForResponse(error: any): string {
  // List of safe error messages that can be shown to users
  const safeMessages = [
    'Invalid signature',
    'Signature expired',
    'Invalid timestamp',
    'Missing required',
    'Rate limit exceeded',
    'Invalid address',
    'Not found',
    'Unauthorized',
    'Invalid nonce',
    'FID not linked',
  ];

  const message = error?.message || error?.toString() || 'An error occurred';

  // Check if message contains safe patterns
  for (const safe of safeMessages) {
    if (message.toLowerCase().includes(safe.toLowerCase())) {
      return message;
    }
  }

  // Generic error for internal errors
  return 'Operation failed. Please try again.';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateNonce,
  verifyAndConsumeNonce,
  validateTimestamp,
  verifySignature,
  recoverAddressFromSignature,
  authenticateRequest,
  verifyFarcasterFID,
  authenticateFarcasterRequest,
  validateCountryCode,
  sanitizeInput,
  sanitizeGraphQLInput,
  sanitizeErrorForResponse,
  buildDelegationMessage,
  buildMintMessage,
  buildBurnMessage,
  buildActionMessage,
  SIGNATURE_EXPIRY_MS,
  MAX_CLOCK_SKEW_MS,
  NONCE_EXPIRY_SECONDS,
  VALID_COUNTRY_CODES,
};
