import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { createPublicClient, http, parseAbi, type Address, type PublicClient } from 'viem';
import { activeChain } from '@/app/chains';
import { getAllCountryCodes } from '@/lib/passport/countries';
import { findAllPassports, getPassportDetails } from '@/lib/passport-lookup';
import { getOwnedLicenses } from '@/lib/user-holdings';
import { getResolvedCatalogue } from '@/lib/catalogue-resolved';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

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

/**
 * Resolve an artist name registered on ProfileRegistry to its owning wallet.
 *
 * Not everyone using this app has a Farcaster account — registering a display
 * name onchain is exactly how a wallet-only artist becomes findable. Resolving
 * names through Neynar alone meant those artists returned "User not found",
 * which defeats the point of the registry. Returns a Neynar-shaped user so the
 * rest of the route (privacy, onchain stats, userType) needs no special case.
 */
async function lookupRegisteredName(name: string) {
  const registry = process.env.NEXT_PUBLIC_PROFILE_REGISTRY as
    | `0x${string}`
    | undefined;
  if (!registry) return null;
  try {
    const client = createPublicClient({ chain: activeChain, transport: http() });
    const owner = (await client.readContract({
      address: registry,
      abi: parseAbi(['function ownerOfName(string displayName) view returns (address)']),
      functionName: 'ownerOfName',
      args: [name],
    })) as string;
    if (!owner || owner === '0x0000000000000000000000000000000000000000') return null;
    // Read the name back so the profile carries its registered casing rather
    // than whatever the searcher typed.
    const canonical = (await client.readContract({
      address: registry,
      abi: parseAbi(['function displayNameOf(address owner) view returns (string)']),
      functionName: 'displayNameOf',
      args: [owner as `0x${string}`],
    })) as string;
    return {
      fid: null,
      username: null,
      display_name: canonical || name,
      pfp_url: null,
      follower_count: 0,
      following_count: 0,
      verifications: [owner],
      verified_addresses: { eth_addresses: [owner] },
      custody_address: owner,
      registeredOnchain: true,
    };
  } catch (error) {
    console.error('[PublicProfile] ProfileRegistry lookup failed:', error);
    return null;
  }
}

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
        // Only return a hit. A 200 with no user must fall through to the
        // search and then the registry, not short-circuit as "not found".
        if (data.user) return data.user;
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
        const hit = exactMatch || users[0];
        if (hit) return hit;
      }

      // Neynar knows nothing about wallet-only artists. Their registered name is
      // onchain, so ask the registry before giving up.
      const registered = await lookupRegisteredName(username.trim());
      if (registered) {
        console.log('[PublicProfile] Found via ProfileRegistry:', registered.display_name);
        return registered;
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

/**
 * A wallet's onchain footprint, read from the contracts.
 *
 * Keeps the indexer's key names — CreatedNFT, PurchasedNFT, PassportNFT, MusicLicense — so the
 * profile assembly below is unchanged. What each one means has not changed, only where it comes
 * from.
 *
 * This calls the libraries directly rather than /api/user-stats: both live in the same process,
 * and a route fetching itself buys a serialisation round trip and a second failure mode for
 * nothing.
 *
 * `PurchasedNFT` was masters OWNED but not CREATED by this wallet — transferred masters. Masters
 * are minted to their artist and none has ever been transferred, so this is empty today and is
 * returned as such rather than guessed at. It becomes real work if masters ever change hands.
 */
async function getBlockchainStats(walletAddress: string): Promise<any> {
  const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined;
  const passportAddress = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address | undefined;
  if (!registry) {
    console.error('[PublicProfile] NEXT_PUBLIC_NFT_CONTRACT is not set');
    return null;
  }

  const address = walletAddress.toLowerCase();

  try {
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    }) as PublicClient;

    const [catalogue, licenses, passportRefs] = await Promise.all([
      getResolvedCatalogue({ client, limit: 1000 }).catch(() => null),
      getOwnedLicenses(client, address, registry).catch(() => []),
      passportAddress
        ? findAllPassports(client, {
            passportAddress,
            countryCodes: getAllCountryCodes(),
            address: address as Address,
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const passports =
      passportAddress && passportRefs.length > 0
        ? await getPassportDetails(client, passportAddress, passportRefs).catch(
            () => passportRefs,
          )
        : passportRefs;

    const created = (catalogue?.tracks ?? []).filter(
      (t) => t.artist.toLowerCase() === address,
    );

    return {
      CreatedNFT: created,
      PurchasedNFT: [],
      PassportNFT: passports,
      MusicLicense: licenses,
    };
  } catch (error) {
    console.error('[PublicProfile] Blockchain stats read failed:', error);
    return null;
  }
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
      // "Verified" means Farcaster verified an address. A registry name is not
      // that claim, and the synthetic user carries the owner in `verifications`
      // only so the wallet resolves — it must not be read as a Farcaster badge.
      isVerified: fcUser.registeredOnchain
        ? false
        : (fcUser.verifications?.length || 0) > 0,
      privacySettings: privacy,
    };

    // Add stats if allowed
    if (privacy.showAchievements) {
      profile.stats = {
        createdMusic: createdMusic.length,
        createdArt: createdArt.length,
        passports: passports.length,
      };

      if (privacy.showPurchasedNFTs) {
        profile.stats.purchasedMusic = purchasedNFTs.filter((n: any) => !n.isArt).length + licenses.length;
        profile.stats.purchasedArt = purchasedNFTs.filter((n: any) => n.isArt).length;
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
