import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'tune_in';

    // The mini app destination — opens the oracle page with radio modal
    const radioDeepLink = `${APP_URL}/oracle?modal=radio`;

    // Dynamic OG image for the cast preview (1200x630)
    const ogImageUrl = `${APP_URL}/api/og`;

    const buttonTitle = action === 'skip_random'
      ? '🎲 Tune In - Live Radio'
      : action === 'voice_note'
      ? '🎤 Tune In - Live Radio'
      : '🎧 Tune In - Live Radio';

    // Mini app frame data — launches directly into the radio modal
    const frameData = {
      version: 'next',
      imageUrl: ogImageUrl,
      button: {
        title: buttonTitle,
        action: {
          type: 'launch_frame',
          name: 'EmpowerTours',
          url: radioDeepLink,
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

          <!-- Open Graph for cast preview -->
          <meta property="og:title" content="EmpowerTours Live Radio">
          <meta property="og:description" content="Tap to tune in to Live Radio on EmpowerTours">
          <meta property="og:image" content="${ogImageUrl}">
          <meta property="og:type" content="website">
          <meta property="og:url" content="${APP_URL}/api/frames/radio">

          <!-- Twitter card -->
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="EmpowerTours Live Radio">
          <meta name="twitter:image" content="${ogImageUrl}">

          <!-- Farcaster Frame with Mini App Launch -->
          <meta name="fc:frame" content='${JSON.stringify(frameData)}'>
          <meta name="of:version" content="vNext">
          <meta name="of:accepts:farcaster" content="vNext">
          <meta name="of:image" content="${ogImageUrl}">

          <title>EmpowerTours Live Radio</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: white; text-align: center;">
          <h1>EmpowerTours Live Radio</h1>
          <p>Tap the button to tune in!</p>
          <p><a href="${radioDeepLink}" style="color: #00d4ff;">Open in Mini App</a></p>
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
    console.error('[frames/radio] Error:', error);
    return new NextResponse('Error generating frame', { status: 500 });
  }
}
