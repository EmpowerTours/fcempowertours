import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

/**
 * Frame endpoint for passport NFTs
 * When embedded in a Farcaster cast, clicking opens the mini app
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId } = await params;

  // Dynamic passport image with stamps from indexer
  const imageUrl = `${APP_URL}/api/passport/image/${tokenId}`;

  // Target URL when frame button is clicked - opens mini app to passport page
  const targetUrl = `${APP_URL}/passport?tokenId=${tokenId}`;

  // Frame v2/vNext JSON format for mini app launch (same as music frame)
  const frameData = {
    version: 'next',
    imageUrl: imageUrl,
    button: {
      title: '🎫 View Passport',
      action: {
        type: 'launch_frame',
        name: 'EmpowerTours',
        url: targetUrl,
        splashImageUrl: `${APP_URL}/images/splash.png`,
        splashBackgroundColor: '#353B48'
      }
    }
  };

  // Return HTML with Frame v2 meta tags (JSON format)
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EmpowerTours Passport #${tokenId}</title>

  <!-- Open Graph -->
  <meta property="og:title" content="EmpowerTours Passport #${tokenId}">
  <meta property="og:description" content="View this Digital Passport on EmpowerTours">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${APP_URL}/api/frames/passport/${tokenId}">

  <!-- Twitter card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="EmpowerTours Passport #${tokenId}">
  <meta name="twitter:image" content="${imageUrl}">

  <!-- Farcaster Frame v2/vNext with Mini App Launch (JSON format) -->
  <meta name="fc:frame" content='${JSON.stringify(frameData)}'>
  <meta name="of:version" content="vNext">
  <meta name="of:accepts:farcaster" content="vNext">
  <meta name="of:image" content="${imageUrl}">
</head>
<body style="background: #353B48; margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: white; text-align: center;">
  <h1>EmpowerTours Passport #${tokenId}</h1>
  <p>Open in Warpcast to view this passport in the EmpowerTours mini app.</p>
  <p><a href="${targetUrl}" style="color: #00d4ff;">View Passport</a></p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
