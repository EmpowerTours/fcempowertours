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

  // Target URL when frame button is clicked - opens mini app to profile
  const targetUrl = `${APP_URL}/profile`;

  // Return HTML with Frame v2 meta tags
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

  <!-- Farcaster Frame v2 / Mini App -->
  <meta property="fc:frame" content="vNext">
  <meta property="fc:frame:image" content="${imageUrl}">
  <meta property="fc:frame:image:aspect_ratio" content="1.91:1">
  <meta property="fc:frame:button:1" content="View Passport">
  <meta property="fc:frame:button:1:action" content="launch_frame">
  <meta property="fc:frame:button:1:target" content="${targetUrl}">
</head>
<body>
  <h1>EmpowerTours Passport #${tokenId}</h1>
  <p>Open in Warpcast to view this passport in the EmpowerTours mini app.</p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
