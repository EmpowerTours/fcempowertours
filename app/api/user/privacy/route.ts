import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/**
 * User Privacy Settings API
 *
 * Production-ready implementation using Upstash Redis
 * Settings are keyed by Farcaster FID for consistency
 *
 * GET /api/user/privacy?fid=12345 - Get user's privacy settings
 * POST /api/user/privacy - Update privacy settings
 *
 * Redis key format: privacy:{fid}
 * Also stores wallet->fid mapping: privacy:wallet:{address}
 */

const PRIVACY_KEY_PREFIX = 'privacy:';
const WALLET_KEY_PREFIX = 'privacy:wallet:';

interface PrivacySettings {
  fid: number;
  walletAddress?: string;
  isPublicProfile: boolean;        // Master toggle - can others see your profile?
  showCreatedNFTs: boolean;        // Show music/art you created (always public for artists)
  showPurchasedNFTs: boolean;      // Show NFTs you purchased
  showPassports: boolean;          // Show passport collection
  showBalances: boolean;           // Show token balances
  showAchievements: boolean;       // Show achievement stats
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: Omit<PrivacySettings, 'fid' | 'walletAddress' | 'createdAt' | 'updatedAt'> = {
  isPublicProfile: true,           // Default: profiles are public
  showCreatedNFTs: true,           // Artists want visibility
  showPurchasedNFTs: false,        // Default: hide purchases (privacy)
  showPassports: true,             // Passports are fun to share
  showBalances: false,             // Default: hide balances (privacy)
  showAchievements: true,          // Achievements are shareable
};

function getPrivacyKey(fid: number | string): string {
  return `${PRIVACY_KEY_PREFIX}${fid}`;
}

function getWalletKey(address: string): string {
  return `${WALLET_KEY_PREFIX}${address.toLowerCase()}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid');
    const walletAddress = searchParams.get('address');

    if (!fid && !walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'fid or address required'
      }, { status: 400 });
    }

    let settings: PrivacySettings | null = null;
    let resolvedFid = fid;

    // Try to find by FID first
    if (fid) {
      settings = await redis.get<PrivacySettings>(getPrivacyKey(fid));
    }

    // If not found by FID, try wallet address lookup
    if (!settings && walletAddress) {
      // Get FID from wallet mapping
      resolvedFid = await redis.get<string>(getWalletKey(walletAddress));
      if (resolvedFid) {
        settings = await redis.get<PrivacySettings>(getPrivacyKey(resolvedFid));
      }
    }

    if (!settings) {
      // Return default settings for users who haven't configured
      console.log('[Privacy] Returning defaults for FID:', fid || 'unknown');
      return NextResponse.json({
        success: true,
        settings: {
          ...DEFAULT_SETTINGS,
          fid: fid ? parseInt(fid) : null,
          walletAddress,
          isDefault: true,  // Flag that these are defaults
        }
      });
    }

    return NextResponse.json({
      success: true,
      settings
    });

  } catch (error: any) {
    console.error('[Privacy] GET error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get privacy settings'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, walletAddress, ...settingsUpdate } = body;

    if (!fid) {
      return NextResponse.json({
        success: false,
        error: 'fid required'
      }, { status: 400 });
    }

    // Get existing settings or create new
    const existing = await redis.get<PrivacySettings>(getPrivacyKey(fid));
    const now = new Date().toISOString();

    // Merge with updates
    const updated: PrivacySettings = {
      ...DEFAULT_SETTINGS,
      ...existing,
      ...settingsUpdate,
      fid: parseInt(fid),
      walletAddress: walletAddress || existing?.walletAddress,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    // Store privacy settings
    await redis.set(getPrivacyKey(fid), updated);

    // Store wallet -> FID mapping for quick lookups
    if (walletAddress) {
      await redis.set(getWalletKey(walletAddress), fid.toString());
    }

    console.log('[Privacy] Updated settings for FID', fid, ':', {
      isPublicProfile: updated.isPublicProfile,
      showCreatedNFTs: updated.showCreatedNFTs,
      showPurchasedNFTs: updated.showPurchasedNFTs,
      showPassports: updated.showPassports,
    });

    return NextResponse.json({
      success: true,
      settings: updated
    });

  } catch (error: any) {
    console.error('[Privacy] POST error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update privacy settings'
    }, { status: 500 });
  }
}
