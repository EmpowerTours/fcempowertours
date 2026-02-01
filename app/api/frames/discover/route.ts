import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function GET(request: NextRequest) {
  try {
    const discoverDeepLink = `${APP_URL}/discover`;
    // Dynamic OG image for the cast preview (1200x630)
    const ogImageUrl = `${APP_URL}/api/og/discover`;

    const frameData = {
      version: 'next',
      imageUrl: ogImageUrl,
      button: {
        title: '🎵 Discover Music',
        action: {
          type: 'launch_frame',
          name: 'EmpowerTours',
          url: discoverDeepLink,
          splashImageUrl: `${APP_URL}/images/splash.png`,
          splashBackgroundColor: '#0f172a',
        },
      },
    };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="og:title" content="Discover Music on EmpowerTours">
          <meta property="og:description" content="Stream and collect music NFTs on Monad">
          <meta property="og:image" content="${ogImageUrl}">
          <meta property="og:type" content="website">
          <meta property="og:url" content="${APP_URL}/api/frames/discover">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="Discover Music on EmpowerTours">
          <meta name="twitter:image" content="${ogImageUrl}">
          <meta name="fc:frame" content='${JSON.stringify(frameData)}'>
          <meta name="of:version" content="vNext">
          <meta name="of:accepts:farcaster" content="vNext">
          <meta name="of:image" content="${ogImageUrl}">
          <title>Discover Music - EmpowerTours</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: white; text-align: center;">
          <h1>Discover Music on EmpowerTours</h1>
          <p><a href="${discoverDeepLink}" style="color: #00d4ff;">Open in Mini App</a></p>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('[frames/discover] Error:', error);
    return new NextResponse('Error generating frame', { status: 500 });
  }
}
