import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
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
    const directArtist = searchParams.get('artist');
    const autoplay = searchParams.get('autoplay') === 'true';

    console.log('🎬 Frame request for music token:', tokenId, { directArtist, autoplay });

    // Get NFT data (from params or indexer)
    let nftData: NFTData | null = null;

    if (directImage && directTitle) {
      nftData = {
        name: directTitle,
        imageUrl: directImage,
        previewUrl: directPreview || '',
        artist: directArtist || 'Artist',
        price: directPrice || '0'
      };
    } else {
      nftData = await getNFTData(tokenId);
    }

    // Artist profile is the destination within the mini app (with autoplay for music)
    const artistAddress = directArtist || nftData?.artist || '';
    const artistProfileUrl = artistAddress
      ? `${APP_URL}/artist/${artistAddress}?tokenId=${tokenId}${autoplay ? '&autoplay=true' : ''}`
      : `${APP_URL}/oracle`;
    const ogImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}${directImage ? `&imageUrl=${encodeURIComponent(directImage)}` : ''}${directTitle ? `&title=${encodeURIComponent(directTitle)}` : ''}${directPrice ? `&price=${encodeURIComponent(directPrice)}` : ''}`;

    // Mini app frame data - launches directly to artist profile
    const frameData = {
      version: 'next',
      imageUrl: ogImageUrl,
      button: {
        title: '🎵 Listen & Buy',
        action: {
          type: 'launch_frame',
          name: 'EmpowerTours',
          url: artistProfileUrl,
          splashImageUrl: `${APP_URL}/splash.png`,
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

          <!-- Farcaster Frame with Mini App Launch -->
          <meta name="fc:frame" content='${JSON.stringify(frameData)}'>
          <meta name="of:version" content="vNext">
          <meta name="of:accepts:farcaster" content="vNext">
          <meta name="of:image" content="${ogImageUrl}">

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
          <p><a href="${artistProfileUrl}" style="color: #00d4ff;">View Artist Profile</a></p>
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
