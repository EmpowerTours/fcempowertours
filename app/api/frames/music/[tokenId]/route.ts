import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'harlequin-used-hare-224.mypinata.cloud';

interface Params {
  tokenId: string;
}

interface NFTData {
  name: string;
  imageUrl: string;
  previewUrl: string;
  artist: string;
  price: string;
}

async function getNFTData(tokenId: string): Promise<NFTData | null> {
  try {
    const query = `
      query GetMusicNFT {
        MusicNFT(where: { tokenId: { _eq: "${tokenId}" } }, limit: 1) {
          tokenId
          name
          imageUrl
          previewAudioUrl
          artist
          price
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      cache: 'no-store'
    });

    if (response.ok) {
      const data = await response.json();
      const nft = data.data?.MusicNFT?.[0];
      if (nft) {
        // Convert IPFS URLs to HTTP
        const imageUrl = nft.imageUrl?.startsWith('ipfs://')
          ? `https://${PINATA_GATEWAY}/ipfs/${nft.imageUrl.replace('ipfs://', '')}`
          : nft.imageUrl || '';

        const previewUrl = nft.previewAudioUrl?.startsWith('ipfs://')
          ? `https://${PINATA_GATEWAY}/ipfs/${nft.previewAudioUrl.replace('ipfs://', '')}`
          : nft.previewAudioUrl || '';

        // Convert price from wei
        let priceDisplay = '0';
        if (nft.price) {
          try {
            const priceNum = Number(BigInt(nft.price)) / 1e18;
            priceDisplay = priceNum.toString();
          } catch (e) {
            priceDisplay = String(nft.price);
          }
        }

        return {
          name: nft.name || 'Untitled',
          imageUrl,
          previewUrl,
          artist: nft.artist || 'Unknown Artist',
          price: priceDisplay
        };
      }
    }
  } catch (error) {
    console.error('❌ Failed to fetch NFT data:', error);
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { tokenId } = await params;
    const { searchParams } = new URL(request.url);

    // Check for direct parameters (used when casting immediately after mint)
    const directImage = searchParams.get('imageUrl');
    const directTitle = searchParams.get('title');
    const directPreview = searchParams.get('previewUrl');
    const directPrice = searchParams.get('price');

    console.log('🎬 Frame request for music token:', tokenId);

    // Get NFT data (from params or indexer)
    let nftData: NFTData | null = null;

    if (directImage && directTitle) {
      nftData = {
        name: directTitle,
        imageUrl: directImage,
        previewUrl: directPreview || '',
        artist: 'Artist',
        price: directPrice || '0'
      };
    } else {
      nftData = await getNFTData(tokenId);
    }

    const miniAppUrl = `${APP_URL}/nft/${tokenId}`;
    const ogImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}${directImage ? `&imageUrl=${encodeURIComponent(directImage)}` : ''}${directTitle ? `&title=${encodeURIComponent(directTitle)}` : ''}`;

    // Mini app frame data with audio preview
    const frameData = {
      version: '1',
      imageUrl: ogImageUrl,
      button: {
        title: '🎵 Listen & Buy',
        action: {
          type: 'launch_frame',
          name: 'EmpowerTours Music',
          url: miniAppUrl,
          splashImageUrl: ogImageUrl,
          splashBackgroundColor: '#0f172a'
        }
      }
    };

    // Build HTML with proper OG tags for the cover art
    // The og:image will show the cover art in the cast
    // Audio URL included for players that support it
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">

          <!-- Open Graph for cast preview -->
          <meta property="og:title" content="${nftData?.name || `Music NFT #${tokenId}`}">
          <meta property="og:description" content="${nftData?.price ? `${nftData.price} WMON - ` : ''}Tap to preview & license on EmpowerTours">
          <meta property="og:image" content="${ogImageUrl}">
          <meta property="og:type" content="music.song">
          <meta property="og:url" content="${APP_URL}/api/frames/music/${tokenId}">

          ${nftData?.previewUrl ? `
          <!-- Audio preview for supported clients -->
          <meta property="og:audio" content="${nftData.previewUrl}">
          <meta property="og:audio:type" content="audio/mpeg">
          ` : ''}

          <!-- Twitter card -->
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${nftData?.name || `Music NFT #${tokenId}`}">
          <meta name="twitter:image" content="${ogImageUrl}">

          <!-- Farcaster Mini App -->
          <meta name="fc:frame" content="vNext">
          <meta name="fc:frame:image" content="${ogImageUrl}">
          <meta name="fc:frame:button:1" content="🎧 Preview & Buy">
          <meta name="fc:frame:button:1:action" content="link">
          <meta name="fc:frame:button:1:target" content="${miniAppUrl}">
          <meta name="fc:miniapp" content='${JSON.stringify(frameData)}'>

          <title>${nftData?.name || `Music NFT #${tokenId}`} - EmpowerTours</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: white; text-align: center;">
          <h1>${nftData?.name || `Music NFT #${tokenId}`}</h1>
          <p>Price: ${nftData?.price || '0'} WMON</p>
          ${nftData?.previewUrl ? `
            <audio controls style="margin: 20px 0;">
              <source src="${nftData.previewUrl}" type="audio/mpeg">
              Your browser does not support the audio element.
            </audio>
          ` : ''}
          <p><a href="${miniAppUrl}" style="color: #00d4ff;">Open in EmpowerTours</a></p>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error: any) {
    console.error('❌ Frame error:', error);
    return new NextResponse('Error generating frame', { status: 500 });
  }
}
