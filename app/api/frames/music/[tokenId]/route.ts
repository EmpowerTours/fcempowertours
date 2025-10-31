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
    
    // ✅ SIMPLIFIED: Only pass tokenId to OG endpoint
    // OG endpoint will query Envio to fetch metadata + cover art
    const ogImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}`;

    console.log('🎬 Frame request for music token:', tokenId);
    console.log('🎬 Frame URL length:', ogImageUrl.length, 'bytes (limit: 256)');
    console.log('🎬 Frame URL:', ogImageUrl);

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

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="og:title" content="Music NFT #${tokenId}">
          <meta property="og:description" content="EmpowerTours - Mint & License Music NFTs on Monad">
          <meta property="og:type" content="website">
          <!-- Official Farcaster Mini App Meta Tag -->
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
