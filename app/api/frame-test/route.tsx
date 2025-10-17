import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function GET(req: NextRequest) {
  // Return a page that validates all frame requirements
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  
  <!-- REQUIRED: Farcaster Frame Tags -->
  <meta property="fc:frame" content="vNext" />
  <meta property="fc:frame:image" content="${APP_URL}/images/feed.png" />
  <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
  
  <!-- Frame Actions -->
  <meta property="fc:frame:button:1" content="Open App" />
  <meta property="fc:frame:button:1:action" content="launch_frame" />
  <meta property="fc:frame:button:1:target" content="${APP_URL}" />
  
  <!-- Mini App Configuration -->
  <meta property="fc:frame:embed:url" content="${APP_URL}" />
  <meta property="fc:frame:domain" content="${APP_URL.replace('https://', '').replace('http://', '')}" />
  
  <!-- Open Graph -->
  <meta property="og:title" content="EmpowerTours" />
  <meta property="og:description" content="Travel Passports & Music NFTs" />
  <meta property="og:image" content="${APP_URL}/images/og-image.png" />
  <meta property="og:url" content="${APP_URL}" />
  <meta property="og:type" content="website" />
  
  <title>EmpowerTours Frame Test</title>
</head>
<body style="margin: 0; padding: 20px; font-family: system-ui;">
  <h1>✅ Frame Test Page</h1>
  <p>This page contains all required Farcaster frame meta tags.</p>
  
  <h2>Frame Configuration:</h2>
  <ul>
    <li>✅ fc:frame = vNext</li>
    <li>✅ fc:frame:image = ${APP_URL}/images/feed.png</li>
    <li>✅ fc:frame:button:1 = Open App</li>
    <li>✅ fc:frame:embed:url = ${APP_URL}</li>
  </ul>
  
  <h2>Test in Farcaster:</h2>
  <ol>
    <li>Copy this URL: <code>${APP_URL}/api/frame-test</code></li>
    <li>Paste in Farcaster Developer Portal Embed Tool</li>
    <li>Click "Refetch" to validate</li>
  </ol>
  
  <hr style="margin: 20px 0;">
  <p style="color: #666;">
    <strong>Debugging Info:</strong><br>
    Domain: ${APP_URL.replace('https://', '').replace('http://', '')}<br>
    Manifest: <a href="${APP_URL}/.well-known/farcaster.json">${APP_URL}/.well-known/farcaster.json</a>
  </p>
</body>
</html>
  `.trim();

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'max-age=0, must-revalidate',
      'X-Frame-Options': 'ALLOWALL',
    },
  });
}

export async function POST(req: NextRequest) {
  // Handle frame button actions
  try {
    const body = await req.json();
    console.log('Frame action received:', body);
    
    return NextResponse.json({
      type: 'frame',
      frameUrl: APP_URL,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
