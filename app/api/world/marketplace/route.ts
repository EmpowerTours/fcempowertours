import { NextRequest, NextResponse } from 'next/server';
import { formatEther, parseEther } from 'viem';

const ENVIO_ENDPOINT = process.env.ENVIO_ENDPOINT || 'https://indexer.bigdevenergy.link/ce6c42b/v1/graphql';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fcempowertours-production-6551.up.railway.app';

// Music & Art NFT Contract on Monad
const NFT_CONTRACT = '0xB9B3acf33439360B55d12429301E946f34f3B73F';

// In-memory resale listings (could be moved to DB later)
const resaleListings: Map<string, {
  tokenId: string;
  seller: string;
  price: string; // in WMON
  listedAt: number;
  name: string;
  artist: string;
}> = new Map();

/**
 * GET /api/world/marketplace
 * List all available music for agents to buy
 */
export async function GET(req: NextRequest) {
  try {
    // Get all music NFTs from Envio
    const query = `
      query GetAllMusic {
        MusicNFT(where: { isBurned: { _eq: false } }, order_by: { tokenId: desc }, limit: 50) {
          tokenId
          name
          artist
          owner
          price
          ipfsHash
          isArt
          createdAt
        }
      }
    `;

    const envioRes = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const envioData = await envioRes.json();
    const allNFTs = envioData.data?.MusicNFT || [];

    // Separate into primary sales (from artist) and resale listings
    const primarySales = allNFTs.map((nft: any) => ({
      tokenId: nft.tokenId,
      name: nft.name,
      artist: nft.artist,
      owner: nft.owner,
      price: formatEther(BigInt(nft.price || '0')),
      priceWei: nft.price,
      isArt: nft.isArt,
      type: 'primary',
      ipfsHash: nft.ipfsHash,
    }));

    // Get resale listings
    const resales = Array.from(resaleListings.values()).map(listing => ({
      ...listing,
      type: 'resale',
    }));

    return NextResponse.json({
      success: true,
      marketplace: {
        primarySales,
        resaleListings: resales,
        totalAvailable: primarySales.length + resales.length,
      },
      howToBuy: {
        description: 'Agents can buy music NFTs to resell or use in the world',
        endpoint: 'POST /api/world/marketplace',
        actions: ['buy', 'list', 'unlist'],
        example: {
          buy: { action: 'buy', tokenId: '1', buyerAddress: '0x...' },
          list: { action: 'list', tokenId: '1', sellerAddress: '0x...', price: '50' },
        },
      },
    });
  } catch (error: any) {
    console.error('[Marketplace] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/world/marketplace
 * Actions: buy, list, unlist
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, tokenId, buyerAddress, sellerAddress, price } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Missing action (buy, list, unlist)' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'buy': {
        // Buy a music NFT (primary or resale)
        if (!tokenId || !buyerAddress) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId or buyerAddress' },
            { status: 400 }
          );
        }

        // Check if it's a resale listing first
        const resaleListing = resaleListings.get(tokenId);

        if (resaleListing) {
          // Handle resale purchase
          console.log(`[Marketplace] Resale purchase: ${buyerAddress} buying token ${tokenId} from ${resaleListing.seller}`);

          // Execute the transfer via delegated execution
          const execRes = await fetch(`${APP_URL}/api/execute-delegated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress: buyerAddress,
              action: 'buy_music',
              params: { tokenId },
            }),
          });

          const execData = await execRes.json();

          if (execData.success) {
            // Remove from resale listings
            resaleListings.delete(tokenId);

            return NextResponse.json({
              success: true,
              message: `Purchased "${resaleListing.name}" from resale market!`,
              type: 'resale',
              txHash: execData.txHash,
              seller: resaleListing.seller,
              price: resaleListing.price,
            });
          } else {
            return NextResponse.json({
              success: false,
              error: execData.error || 'Failed to execute purchase',
            }, { status: 400 });
          }
        } else {
          // Primary sale - buy from artist
          console.log(`[Marketplace] Primary purchase: ${buyerAddress} buying token ${tokenId}`);

          const execRes = await fetch(`${APP_URL}/api/execute-delegated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress: buyerAddress,
              action: 'buy_music',
              params: { tokenId },
            }),
          });

          const execData = await execRes.json();

          if (execData.success) {
            return NextResponse.json({
              success: true,
              message: `Purchased music NFT #${tokenId}!`,
              type: 'primary',
              txHash: execData.txHash,
            });
          } else {
            return NextResponse.json({
              success: false,
              error: execData.error || 'Failed to execute purchase',
            }, { status: 400 });
          }
        }
      }

      case 'list': {
        // List an owned NFT for resale
        if (!tokenId || !sellerAddress || !price) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId, sellerAddress, or price' },
            { status: 400 }
          );
        }

        // Verify ownership
        const ownerQuery = `
          query CheckOwner($tokenId: String!) {
            MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
              tokenId
              name
              artist
              owner
            }
          }
        `;

        const ownerRes = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: ownerQuery,
            variables: { tokenId },
          }),
        });

        const ownerData = await ownerRes.json();
        const nft = ownerData.data?.MusicNFT?.[0];

        if (!nft) {
          return NextResponse.json(
            { success: false, error: 'NFT not found' },
            { status: 404 }
          );
        }

        if (nft.owner.toLowerCase() !== sellerAddress.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: 'You do not own this NFT' },
            { status: 403 }
          );
        }

        // Add to resale listings
        resaleListings.set(tokenId, {
          tokenId,
          seller: sellerAddress,
          price,
          listedAt: Date.now(),
          name: nft.name,
          artist: nft.artist,
        });

        console.log(`[Marketplace] Listed token ${tokenId} for ${price} WMON by ${sellerAddress}`);

        return NextResponse.json({
          success: true,
          message: `Listed "${nft.name}" for ${price} WMON`,
          listing: resaleListings.get(tokenId),
        });
      }

      case 'unlist': {
        // Remove from resale
        if (!tokenId || !sellerAddress) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId or sellerAddress' },
            { status: 400 }
          );
        }

        const listing = resaleListings.get(tokenId);
        if (!listing) {
          return NextResponse.json(
            { success: false, error: 'Listing not found' },
            { status: 404 }
          );
        }

        if (listing.seller.toLowerCase() !== sellerAddress.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: 'You did not list this NFT' },
            { status: 403 }
          );
        }

        resaleListings.delete(tokenId);

        return NextResponse.json({
          success: true,
          message: `Unlisted token ${tokenId}`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[Marketplace] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
