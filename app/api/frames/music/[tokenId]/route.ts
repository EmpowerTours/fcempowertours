import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

interface Params {
  tokenId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { tokenId } = await params;
    const miniAppUrl = `${APP_URL}/music/${tokenId}`;
    const buyMiniAppUrl = `${APP_URL}/music/${tokenId}?action=buy`;
    const ogImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}`;
    const splashImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}`;

    console.log('🎬 Frame request for music token:', tokenId);
    console.log('   Mini App URL:', miniAppUrl);

    // ✅ OFFICIAL FARCASTER MINI APPS SCHEMA
    const frameData = {
      version: '1',  // Must be "1" not "next"
      imageUrl: ogImageUrl,  // 3:2 aspect ratio (1200x630)
      button: {
        title: '🎵 Listen Now',  // Max 32 characters
        action: {
          type: 'launch_frame',  // Official type for launching mini apps
          name: 'EmpowerTours Music',
          url: miniAppUrl,
          splashImageUrl: splashImageUrl,
          splashBackgroundColor: '#0f172a'
        }
      }
    };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="og:title" content="Music NFT #${tokenId}">
          <meta property="og:description" content="Check out this exclusive music NFT on EmpowerTours - Mint & License Music NFTs on Monad">
          <meta property="og:image" content="${ogImageUrl}">
          <meta property="og:url" content="${miniAppUrl}">
          <meta property="og:type" content="website">
          
          <!-- Official Farcaster Mini App Meta Tag (NOT fc:frame) -->
          <meta name="fc:miniapp" content='${JSON.stringify(frameData)}' />

          <title>Music NFT #${tokenId} - EmpowerTours</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 0;"></body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error: any) {
    console.error('❌ Frame error:', error);
    return new NextResponse('Error generating frame', { status: 500 });
  }
}
