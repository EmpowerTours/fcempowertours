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
    
    console.log('🎬 Frame request for music token:', tokenId);
    console.log('   Mini App URL:', miniAppUrl);
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="og:title" content="Music NFT #${tokenId}">
          <meta property="og:description" content="Check out this exclusive music NFT on EmpowerTours">
          <meta property="og:image" content="${ogImageUrl}">
          <meta property="og:url" content="${miniAppUrl}">
          <meta property="og:type" content="website">
          
          <!-- Farcaster Frame with launch_miniapp buttons -->
          <meta name="fc:frame" content='{"version":"next","imageUrl":"${ogImageUrl}","buttons":[{"title":"🎵 Listen Now","action":{"type":"launch_miniapp","name":"EmpowerTours Music","url":"${miniAppUrl}","splashImageUrl":"${ogImageUrl}","splashBackgroundColor":"#0f172a"}},{"title":"💎 Buy License","action":{"type":"launch_miniapp","name":"EmpowerTours Music","url":"${buyMiniAppUrl}","splashImageUrl":"${ogImageUrl}","splashBackgroundColor":"#0f172a"}}]}' />
          
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
