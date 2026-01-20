import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { createPublicClient, http, Address, parseAbi } from 'viem';
import { activeChain } from '@/app/chains';

/**
 * Music NFT Resale Listing API
 *
 * POST /api/music/list-for-sale
 * - List a license NFT for resale
 * - Stores listing in Redis
 * - Validates ownership via contract
 *
 * GET /api/music/list-for-sale
 * - Get all active resale listings
 */

const NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address;
const LISTING_PREFIX = 'resale:listing:';
const LISTINGS_INDEX = 'resale:listings:all';
const LISTING_TTL = 60 * 60 * 24 * 30; // 30 days

interface ResaleListing {
  listingId: string;
  licenseId: number;
  masterTokenId: number;
  seller: string;
  sellerFid: number;
  price: string; // in WMON
  nftName: string;
  imageUrl?: string;
  isArt: boolean;
  listedAt: string;
  active: boolean;
}

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

const nftAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function licenses(uint256 licenseId) view returns (uint256 masterTokenId, uint256 licenseeFid, address licensee, uint256 expiry, bool active, bool isCollectorEdition)',
  'function masterTokens(uint256 tokenId) view returns (uint256 artistFid, address originalArtist, string tokenURI, string collectorTokenURI, uint256 price, uint256 collectorPrice, uint256 totalSold, uint256 activeLicenses, uint256 maxCollectorEditions, uint256 collectorsMinted, bool active, uint8 nftType, uint96 royaltyPercentage)',
]);

export async function POST(req: NextRequest) {
  try {
    const { licenseId, price, sellerAddress, sellerFid, nftName, imageUrl, isArt } = await req.json();

    if (!licenseId || !price || !sellerAddress) {
      return NextResponse.json({
        success: false,
        error: 'licenseId, price, and sellerAddress required'
      }, { status: 400 });
    }

    // Validate minimum price (35 WMON)
    if (parseFloat(price) < 35) {
      return NextResponse.json({
        success: false,
        error: 'Minimum resale price is 35 WMON'
      }, { status: 400 });
    }

    // Verify ownership
    if (!NFT_ADDRESS) {
      return NextResponse.json({
        success: false,
        error: 'NFT contract not configured'
      }, { status: 500 });
    }

    const owner = await publicClient.readContract({
      address: NFT_ADDRESS,
      abi: nftAbi,
      functionName: 'ownerOf',
      args: [BigInt(licenseId)],
    });

    if ((owner as string).toLowerCase() !== sellerAddress.toLowerCase()) {
      return NextResponse.json({
        success: false,
        error: 'You do not own this license'
      }, { status: 403 });
    }

    // Get license details
    const license = await publicClient.readContract({
      address: NFT_ADDRESS,
      abi: nftAbi,
      functionName: 'licenses',
      args: [BigInt(licenseId)],
    }) as [bigint, bigint, string, bigint, boolean, boolean];

    if (!license[4]) {
      return NextResponse.json({
        success: false,
        error: 'License is not active'
      }, { status: 400 });
    }

    const masterTokenId = Number(license[0]);

    // Create listing
    const listingId = `${sellerAddress.toLowerCase()}-${licenseId}-${Date.now()}`;
    const listing: ResaleListing = {
      listingId,
      licenseId: parseInt(licenseId),
      masterTokenId,
      seller: sellerAddress,
      sellerFid: sellerFid || 0,
      price: price.toString(),
      nftName: nftName || `License #${licenseId}`,
      imageUrl,
      isArt: isArt || false,
      listedAt: new Date().toISOString(),
      active: true,
    };

    // Store listing
    await redis.set(`${LISTING_PREFIX}${listingId}`, listing, { ex: LISTING_TTL });

    // Add to listings index
    const existingListings = await redis.get<string[]>(LISTINGS_INDEX) || [];
    if (!existingListings.includes(listingId)) {
      existingListings.push(listingId);
      await redis.set(LISTINGS_INDEX, existingListings);
    }

    console.log('[Resale] Listed license', licenseId, 'for', price, 'WMON by', sellerAddress);

    return NextResponse.json({
      success: true,
      listing,
      message: `Listed for ${price} WMON. You'll receive ${(parseFloat(price) * 0.5).toFixed(2)} WMON after 50% royalty.`
    });

  } catch (error: any) {
    console.error('[Resale] List error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to list for sale'
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seller = searchParams.get('seller');

    // Get all listing IDs
    const listingIds = await redis.get<string[]>(LISTINGS_INDEX) || [];

    if (listingIds.length === 0) {
      return NextResponse.json({
        success: true,
        listings: [],
        message: 'No active listings'
      });
    }

    // Fetch all listings
    const listings: ResaleListing[] = [];
    for (const id of listingIds) {
      const listing = await redis.get<ResaleListing>(`${LISTING_PREFIX}${id}`);
      if (listing && listing.active) {
        // Filter by seller if specified
        if (!seller || listing.seller.toLowerCase() === seller.toLowerCase()) {
          listings.push(listing);
        }
      }
    }

    // Sort by most recent first
    listings.sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime());

    return NextResponse.json({
      success: true,
      listings,
      count: listings.length
    });

  } catch (error: any) {
    console.error('[Resale] Get listings error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get listings'
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get('listingId');
    const sellerAddress = searchParams.get('seller');

    if (!listingId || !sellerAddress) {
      return NextResponse.json({
        success: false,
        error: 'listingId and seller required'
      }, { status: 400 });
    }

    // Get listing
    const listing = await redis.get<ResaleListing>(`${LISTING_PREFIX}${listingId}`);

    if (!listing) {
      return NextResponse.json({
        success: false,
        error: 'Listing not found'
      }, { status: 404 });
    }

    // Verify ownership
    if (listing.seller.toLowerCase() !== sellerAddress.toLowerCase()) {
      return NextResponse.json({
        success: false,
        error: 'Not your listing'
      }, { status: 403 });
    }

    // Mark as inactive
    listing.active = false;
    await redis.set(`${LISTING_PREFIX}${listingId}`, listing);

    console.log('[Resale] Delisted license', listing.licenseId, 'by', sellerAddress);

    return NextResponse.json({
      success: true,
      message: 'Listing removed'
    });

  } catch (error: any) {
    console.error('[Resale] Delete error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to remove listing'
    }, { status: 500 });
  }
}
