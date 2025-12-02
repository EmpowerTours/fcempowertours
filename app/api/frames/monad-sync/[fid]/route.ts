import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

interface Params {
  fid: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { fid } = await params;
    const miniAppUrl = `${APP_URL}/monad-sync`;

    // Fetch user's monad data
    let ogImageUrl = `${APP_URL}/api/og/monad-sync?fid=${fid}`;
    let clarityScore = '??';
    let tier = 'Unknown';

    try {
      const monadResponse = await fetch(`${APP_URL}/api/monad-sync/get-user-monad?fid=${fid}`);
      if (monadResponse.ok) {
        const monadData = await monadResponse.json();
        if (monadData.monad) {
          clarityScore = monadData.monad.clarityScore.toFixed(1);
          tier = monadData.monad.tier;
          ogImageUrl = `${APP_URL}/api/og/monad-sync?fid=${fid}&clarity=${clarityScore}&tier=${encodeURIComponent(tier)}`;
        }
      }
    } catch (err) {
      console.warn('Could not fetch monad data for frame:', err);
    }

    console.log('🎬 Monad Sync Frame request for FID:', fid);
    console.log('   Clarity:', clarityScore, '| Tier:', tier);

    const frameData = {
      version: '1',
      imageUrl: ogImageUrl,
      button: {
        title: '👁️ Sync With My Monad',
        action: {
          type: 'launch_frame',
          name: 'Monad Sync',
          url: miniAppUrl,
          splashImageUrl: ogImageUrl,
          splashBackgroundColor: '#1a0033'
        }
      }
    };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="og:title" content="${tier} - ${clarityScore}% Clarity">
          <meta property="og:description" content="Discover your eternal monad signature on Farcaster × Monad Blockchain">
          <meta property="og:type" content="website">
          <meta property="og:image" content="${ogImageUrl}">
          <!-- Official Farcaster Mini App Meta Tag -->
          <meta name="fc:miniapp" content='${JSON.stringify(frameData)}' />
          <title>Monad Sync - ${tier} ${clarityScore}%</title>
        </head>
        <body style="background: #1a0033; margin: 0; padding: 0;"></body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error: any) {
    console.error('❌ Monad Sync Frame error:', error);
    return new NextResponse('Error generating frame', { status: 500 });
  }
}
