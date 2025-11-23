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
    const miniAppUrl = `${APP_URL}/nft/${tokenId}`;

    // ✅ Use art OG endpoint for cover art display
    const ogImageUrl = `${APP_URL}/api/og/art?tokenId=${tokenId}`;

    console.log('🎨 Frame request for art NFT token:', tokenId);
    console.log('🎨 Frame URL length:', ogImageUrl.length, 'bytes (limit: 256)');
    console.log('🎨 Frame URL:', ogImageUrl);

    const frameData = {
      version: '1',
      imageUrl: ogImageUrl,
      button: {
        title: '🎨 View Gallery',
        action: {
          type: 'launch_frame',
          name: 'EmpowerTours Art',
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
          <meta property="og:title" content="Art NFT #${tokenId}">
          <meta property="og:description" content="EmpowerTours - Collect & License Art NFTs on Monad">
          <meta property="og:type" content="website">
          <!-- Official Farcaster Mini App Meta Tag -->
          <meta name="fc:miniapp" content='${JSON.stringify(frameData)}' />
          <title>Art NFT #${tokenId} - EmpowerTours</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 0;"></body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error: any) {
    console.error('❌ Art frame error:', error);
    return new NextResponse('Error generating frame', { status: 500 });
  }
}
