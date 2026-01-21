import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';
import {
  generateNonce,
  authenticateRequest,
  verifyFarcasterFID,
  sanitizeErrorForResponse,
  SIGNATURE_EXPIRY_MS,
} from '@/lib/auth';

/**
 * 🔐 USER PRIVACY SETTINGS API (SECURED)
 *
 * SECURITY CHANGES:
 * - POST requires signature to prove ownership of FID
 * - Verifies FID is linked to the signing address
 * - Rate limited
 * - Removed PII from responses
 *
 * GET /api/user/privacy?fid=12345 - Get user's privacy settings (public read)
 * GET /api/user/privacy?fid=12345&nonce=true - Get nonce for signing
 * POST /api/user/privacy - Update privacy settings (requires signature)
 */

const PRIVACY_KEY_PREFIX = 'privacy:';
const WALLET_KEY_PREFIX = 'privacy:wallet:';

interface PrivacySettings {
  fid: number;
  walletAddress?: string;
  isPublicProfile: boolean;
  showCreatedNFTs: boolean;
  showPurchasedNFTs: boolean;
  showPassports: boolean;
  showBalances: boolean;
  showAchievements: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: Omit<PrivacySettings, 'fid' | 'walletAddress' | 'createdAt' | 'updatedAt'> = {
  isPublicProfile: true,
  showCreatedNFTs: true,
  showPurchasedNFTs: false,
  showPassports: true,
  showBalances: false,
  showAchievements: true,
};

function getPrivacyKey(fid: number | string): string {
  return `${PRIVACY_KEY_PREFIX}${fid}`;
}

function getWalletKey(address: string): string {
  return `${WALLET_KEY_PREFIX}${address.toLowerCase()}`;
}

/**
 * Build message for privacy settings update
 */
function buildPrivacyMessage(fid: number, address: string, timestamp: number, nonce: string): string {
  return `EmpowerTours Privacy Settings Update

FID: ${fid}
Address: ${address.toLowerCase()}
Action: Update privacy settings
Timestamp: ${timestamp}
Nonce: ${nonce}

Sign this message to update your privacy settings.`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid');
    const walletAddress = searchParams.get('address');
    const requestNonce = searchParams.get('nonce') === 'true';

    if (!fid && !walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'fid or address required'
      }, { status: 400 });
    }

    // Rate limit
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(RateLimiters.privacy, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`
      }, { status: 429 });
    }

    // If requesting nonce for update
    if (requestNonce && fid && walletAddress) {
      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid Ethereum address format'
        }, { status: 400 });
      }

      const nonce = await generateNonce(walletAddress, `privacy-${fid}`);
      const timestamp = Date.now();

      return NextResponse.json({
        success: true,
        nonce,
        timestamp,
        messageToSign: buildPrivacyMessage(parseInt(fid), walletAddress, timestamp, nonce),
        expiresIn: SIGNATURE_EXPIRY_MS / 1000,
        instructions: 'Sign the messageToSign with your wallet, then POST with signature.',
      });
    }

    // Read settings (public operation)
    let settings: PrivacySettings | null = null;
    let resolvedFid = fid;

    if (fid) {
      settings = await redis.get<PrivacySettings>(getPrivacyKey(fid));
    }

    if (!settings && walletAddress) {
      resolvedFid = await redis.get<string>(getWalletKey(walletAddress));
      if (resolvedFid) {
        settings = await redis.get<PrivacySettings>(getPrivacyKey(resolvedFid));
      }
    }

    if (!settings) {
      return NextResponse.json({
        success: true,
        settings: {
          ...DEFAULT_SETTINGS,
          fid: fid ? parseInt(fid) : null,
          isDefault: true,
        }
      });
    }

    // SECURITY: Don't expose wallet address in response
    return NextResponse.json({
      success: true,
      settings: {
        fid: settings.fid,
        isPublicProfile: settings.isPublicProfile,
        showCreatedNFTs: settings.showCreatedNFTs,
        showPurchasedNFTs: settings.showPurchasedNFTs,
        showPassports: settings.showPassports,
        showBalances: settings.showBalances,
        showAchievements: settings.showAchievements,
        updatedAt: settings.updatedAt,
      }
    });

  } catch (error: any) {
    console.error('[Privacy] GET error:', error);
    return NextResponse.json({
      success: false,
      error: sanitizeErrorForResponse(error)
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(RateLimiters.privacy, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`
      }, { status: 429 });
    }

    const body = await req.json();
    const { fid, walletAddress, signature, timestamp, nonce, ...settingsUpdate } = body;

    if (!fid) {
      return NextResponse.json({
        success: false,
        error: 'fid required'
      }, { status: 400 });
    }

    // SECURITY: Require signature for updates
    if (!walletAddress || !signature || !timestamp || !nonce) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required. Use GET ?nonce=true first to get signing data.'
      }, { status: 400 });
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid Ethereum address format'
      }, { status: 400 });
    }

    console.log(`[Privacy] Update request for FID ${fid} from ${walletAddress}`);

    // SECURITY: Verify FID is linked to the wallet address
    const fidVerification = await verifyFarcasterFID(parseInt(fid), walletAddress);
    if (!fidVerification.valid) {
      console.error(`[Privacy] FID verification failed: ${fidVerification.error}`);
      return NextResponse.json({
        success: false,
        error: fidVerification.error
      }, { status: 403 });
    }

    // SECURITY: Verify signature
    const expectedMessage = buildPrivacyMessage(parseInt(fid), walletAddress, timestamp, nonce);

    const authResult = await authenticateRequest(
      { address: walletAddress, signature, timestamp, nonce },
      expectedMessage,
      `privacy-${fid}`,
      true
    );

    if (!authResult.valid) {
      console.error(`[Privacy] Auth failed: ${authResult.error}`);
      return NextResponse.json({
        success: false,
        error: authResult.error
      }, { status: 403 });
    }

    console.log(`[Privacy] ✅ Verified signature for FID ${fid}`);

    // Get existing settings or create new
    const existing = await redis.get<PrivacySettings>(getPrivacyKey(fid));
    const now = new Date().toISOString();

    // Validate and sanitize settings update (only allow known fields)
    const allowedFields = ['isPublicProfile', 'showCreatedNFTs', 'showPurchasedNFTs', 'showPassports', 'showBalances', 'showAchievements'];
    const sanitizedUpdate: Record<string, boolean> = {};

    for (const field of allowedFields) {
      if (typeof settingsUpdate[field] === 'boolean') {
        sanitizedUpdate[field] = settingsUpdate[field];
      }
    }

    // Merge with updates
    const updated: PrivacySettings = {
      ...DEFAULT_SETTINGS,
      ...existing,
      ...sanitizedUpdate,
      fid: parseInt(fid),
      walletAddress: walletAddress.toLowerCase(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    // Store privacy settings
    await redis.set(getPrivacyKey(fid), updated);

    // Store wallet -> FID mapping
    await redis.set(getWalletKey(walletAddress), fid.toString());

    console.log(`[Privacy] ✅ Updated settings for FID ${fid}`);

    // Return without sensitive data
    return NextResponse.json({
      success: true,
      settings: {
        fid: updated.fid,
        isPublicProfile: updated.isPublicProfile,
        showCreatedNFTs: updated.showCreatedNFTs,
        showPurchasedNFTs: updated.showPurchasedNFTs,
        showPassports: updated.showPassports,
        showBalances: updated.showBalances,
        showAchievements: updated.showAchievements,
        updatedAt: updated.updatedAt,
      }
    });

  } catch (error: any) {
    console.error('[Privacy] POST error:', error);
    return NextResponse.json({
      success: false,
      error: sanitizeErrorForResponse(error)
    }, { status: 500 });
  }
}
