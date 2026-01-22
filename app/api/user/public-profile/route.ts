import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

/**
 * Public Profile API
 *
 * Fetches a user's public profile data respecting their privacy settings.
 * Used when searching for users in the Oracle.
 * Caches results in Redis for performance.
 *
 * GET /api/user/public-profile?username=alice
 * GET /api/user/public-profile?fid=12345
 * GET /api/user/public-profile?address=0x...
 */

const PROFILE_CACHE_PREFIX = 'profile:cache:';
const PROFILE_CACHE_TTL = 300; // 5 minutes cache

interface PrivacySettings {
  isPublicProfile: boolean;
  showCreatedNFTs: boolean;
  showPurchasedNFTs: boolean;
  showPassports: boolean;
  showBalances: boolean;
  showAchievements: boolean;
}

interface PublicProfile {
  fid: number;
  username: string;
  displayName?: string;
  pfpUrl?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  walletAddress?: string;
  userType: 'artist' | 'collector' | 'new';
  isVerified: boolean;
  stats?: {
    createdMusic?: number;
    createdArt?: number;
    purchasedMusic?: number;
    purchasedArt?: number;
    passports?: number;
    itineraries?: number;
    experiences?: number;
  };
  createdNFTs?: Array<{
    id: string;
    tokenId: number;
    name: string;
    imageUrl?: string;
    isArt: boolean;
    price?: string;
  }>;
  passports?: Array<{
    tokenId: number;
    countryCode?: string;
    mintedAt: string;
  }>;
  privacySettings: PrivacySettings;
}

const DEFAULT_PRIVACY: PrivacySettings = {
  isPublicProfile: true,
  showCreatedNFTs: true,
  showPurchasedNFTs: false,
  showPassports: true,
  showBalances: false,
  showAchievements: true,
};

async function getFarcasterUser(params: { username?: string; fid?: string; address?: string }) {
  const { username, fid, address } = params;

  try {
    if (username) {
      // Try exact username match first
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(username)}`,
        { headers: { 'api_key': NEYNAR_API_KEY } }
      );
      if (response.ok) {
        const data = await response.json();
        return data.user;
      }

      // Fallback to search
      const searchResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(username)}&limit=5`,
        { headers: { 'api_key': NEYNAR_API_KEY } }
      );
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const users = searchData.result?.users || [];
        const exactMatch = users.find((u: any) => u.username.toLowerCase() === username.toLowerCase());
        return exactMatch || users[0];
      }
    }

    if (fid) {
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
        { headers: { 'api_key': NEYNAR_API_KEY } }
      );
      if (response.ok) {
        const data = await response.json();
        return data.users?.[0];
      }
    }

    if (address) {
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
        { headers: { 'api_key': NEYNAR_API_KEY } }
      );
      if (response.ok) {
        const data = await response.json();
        return data[address.toLowerCase()]?.[0];
      }
    }

    return null;
  } catch (error) {
    console.error('[PublicProfile] Farcaster lookup failed:', error);
    return null;
  }
}

async function getPrivacySettings(fid: number): Promise<PrivacySettings> {
  try {
    const settings = await redis.get<any>(`privacy:${fid}`);
    if (settings) {
      return {
        isPublicProfile: settings.isPublicProfile ?? DEFAULT_PRIVACY.isPublicProfile,
        showCreatedNFTs: settings.showCreatedNFTs ?? DEFAULT_PRIVACY.showCreatedNFTs,
        showPurchasedNFTs: settings.showPurchasedNFTs ?? DEFAULT_PRIVACY.showPurchasedNFTs,
        showPassports: settings.showPassports ?? DEFAULT_PRIVACY.showPassports,
        showBalances: settings.showBalances ?? DEFAULT_PRIVACY.showBalances,
        showAchievements: settings.showAchievements ?? DEFAULT_PRIVACY.showAchievements,
      };
    }
  } catch (error) {
    console.error('[PublicProfile] Privacy settings fetch failed:', error);
  }
  return DEFAULT_PRIVACY;
}

async function getBlockchainStats(walletAddress: string): Promise<any> {
  try {
    const query = `
      query GetUserStats($addresses: [String!]!) {
        PassportNFT(where: {owner: {_in: $addresses}}) {
          id
          tokenId
          countryCode
          mintedAt
        }
        CreatedNFT: MusicNFT(where: {artist: {_in: $addresses}, isBurned: {_eq: false}}, limit: 50) {
          id
          tokenId
          name
          imageUrl
          price
          isArt
        }
        PurchasedNFT: MusicNFT(where: {owner: {_in: $addresses}, artist: {_nin: $addresses}, isBurned: {_eq: false}}, limit: 50) {
          id
          tokenId
          name
          imageUrl
          isArt
        }
        MusicLicense(where: {licensee: {_in: $addresses}}) {
          id
        }
        ItineraryPurchase(where: {buyer: {_in: $addresses}}) {
          id
        }
        Experience(where: {creator: {_in: $addresses}}) {
          id
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { addresses: [walletAddress.toLowerCase()] }
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.data;
    }
  } catch (error) {
    console.error('[PublicProfile] Blockchain stats fetch failed:', error);
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const fid = searchParams.get('fid');
    const address = searchParams.get('address');
    const noCache = searchParams.get('noCache') === 'true';

    if (!username && !fid && !address) {
      return NextResponse.json({
        success: false,
        error: 'username, fid, or address required'
      }, { status: 400 });
    }

    // Check cache first (unless noCache)
    const cacheKey = `${PROFILE_CACHE_PREFIX}${username || fid || address}`;
    if (!noCache) {
      const cached = await redis.get<PublicProfile>(cacheKey);
      if (cached) {
        console.log('[PublicProfile] Cache hit for:', username || fid || address);
        return NextResponse.json({ success: true, profile: cached, cached: true });
      }
    }

    console.log('[PublicProfile] Looking up user:', { username, fid, address });

    // 1. Get Farcaster user data
    const fcUser = await getFarcasterUser({
      username: username || undefined,
      fid: fid || undefined,
      address: address || undefined
    });

    if (!fcUser) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('[PublicProfile] Found Farcaster user:', fcUser.username, 'FID:', fcUser.fid);

    // 2. Get privacy settings
    const privacy = await getPrivacySettings(fcUser.fid);

    // 3. Check if profile is public
    if (!privacy.isPublicProfile) {
      return NextResponse.json({
        success: true,
        profile: {
          fid: fcUser.fid,
          username: fcUser.username,
          displayName: fcUser.display_name,
          pfpUrl: fcUser.pfp_url,
          userType: 'new' as const,
          isVerified: false,
          privacySettings: {
            isPublicProfile: false,
            showCreatedNFTs: false,
            showPurchasedNFTs: false,
            showPassports: false,
            showBalances: false,
            showAchievements: false,
          },
          message: 'This user has set their profile to private'
        }
      });
    }

    // 4. Get wallet address
    const walletAddress = fcUser.verified_addresses?.eth_addresses?.[0] ||
                         fcUser.verifications?.[0] ||
                         fcUser.custody_address;

    // 5. Get blockchain data if wallet available
    let blockchainData = null;
    if (walletAddress) {
      blockchainData = await getBlockchainStats(walletAddress);
    }

    // 6. Determine user type
    const createdMusic = blockchainData?.CreatedNFT?.filter((n: any) => !n.isArt) || [];
    const createdArt = blockchainData?.CreatedNFT?.filter((n: any) => n.isArt) || [];
    const purchasedNFTs = blockchainData?.PurchasedNFT || [];
    const passports = blockchainData?.PassportNFT || [];
    const licenses = blockchainData?.MusicLicense || [];
    const itineraries = blockchainData?.ItineraryPurchase || [];
    const experiences = blockchainData?.Experience || [];

    const isArtist = createdMusic.length > 0 || createdArt.length > 0;
    const isCollector = purchasedNFTs.length > 0 || licenses.length > 0 || passports.length > 0;
    const userType: 'artist' | 'collector' | 'new' = isArtist ? 'artist' : (isCollector ? 'collector' : 'new');

    // 7. Build public profile based on privacy settings
    const profile: PublicProfile = {
      fid: fcUser.fid,
      username: fcUser.username,
      displayName: fcUser.display_name,
      pfpUrl: fcUser.pfp_url,
      bio: fcUser.profile?.bio?.text,
      followerCount: fcUser.follower_count,
      followingCount: fcUser.following_count,
      walletAddress,
      userType,
      isVerified: (fcUser.verifications?.length || 0) > 0,
      privacySettings: privacy,
    };

    // Add stats if allowed
    if (privacy.showAchievements) {
      profile.stats = {
        createdMusic: createdMusic.length,
        createdArt: createdArt.length,
        passports: passports.length,
        experiences: experiences.length,
      };

      if (privacy.showPurchasedNFTs) {
        profile.stats.purchasedMusic = purchasedNFTs.filter((n: any) => !n.isArt).length + licenses.length;
        profile.stats.purchasedArt = purchasedNFTs.filter((n: any) => n.isArt).length;
        profile.stats.itineraries = itineraries.length;
      }
    }

    // Add created NFTs if allowed (artists always show this)
    if (privacy.showCreatedNFTs && blockchainData?.CreatedNFT) {
      profile.createdNFTs = blockchainData.CreatedNFT.slice(0, 12).map((nft: any) => ({
        id: nft.id,
        tokenId: nft.tokenId,
        name: nft.name,
        imageUrl: nft.imageUrl,
        isArt: nft.isArt,
        price: nft.price ? (Number(nft.price) / 1e18).toFixed(2) : undefined,
      }));
    }

    // Add passports if allowed
    if (privacy.showPassports && passports.length > 0) {
      profile.passports = passports.slice(0, 12).map((p: any) => ({
        tokenId: p.tokenId,
        countryCode: p.countryCode,
        mintedAt: p.mintedAt,
      }));
    }

    // Cache the result
    await redis.set(cacheKey, profile, { ex: PROFILE_CACHE_TTL });

    console.log('[PublicProfile] Returning profile for', fcUser.username, '- Type:', userType);

    return NextResponse.json({
      success: true,
      profile
    });

  } catch (error: any) {
    console.error('[PublicProfile] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch profile'
    }, { status: 500 });
  }
}
