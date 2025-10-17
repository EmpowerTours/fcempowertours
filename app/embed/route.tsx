import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function GET(req: NextRequest) {
  // Generate the HTML with all required Farcaster frame tags
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EmpowerTours - Digital Passport & Travel NFTs</title>
  
  <!-- Farcaster Frame Tags (REQUIRED) -->
  <meta property="fc:frame" content="vNext" />
  <meta property="fc:frame:image" content="${APP_URL}/images/feed.png" />
  <meta property="fc:frame:image:aspect_ratio" content="1:1" />
  <meta property="fc:frame:button:1" content="Launch EmpowerTours" />
  <meta property="fc:frame:button:1:action" content="launch_frame" />
  <meta property="fc:frame:button:1:target" content="${APP_URL}" />
  
  <!-- Farcaster Mini App Tags -->
  <meta property="fc:frame:embed:url" content="${APP_URL}" />
  <meta property="fc:frame:domain" content="${APP_URL.replace('https://', '').replace('http://', '')}" />
  
  <!-- Open Graph Tags -->
  <meta property="og:title" content="EmpowerTours - DigitalPassport" />
  <meta property="og:description" content="Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster." />
  <meta property="og:image" content="${APP_URL}/images/og-image.png" />
  <meta property="og:url" content="${APP_URL}" />
  <meta property="og:type" content="website" />
  
  <!-- Additional Frame Configuration -->
  <meta name="fc:frame:manifest" content="${APP_URL}/.well-known/farcaster.json" />
  
  <!-- Cache Headers for Farcaster -->
  <meta http-equiv="Cache-Control" content="max-age=0, must-revalidate" />
</head>
<body>
  <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
    <div style="text-align: center; color: white; font-family: system-ui, -apple-system, sans-serif;">
      <h1 style="font-size: 3rem; margin-bottom: 1rem;">🌍 EmpowerTours</h1>
      <p style="font-size: 1.5rem; margin-bottom: 2rem;">Travel Passports & Music NFTs on Monad</p>
      <a href="${APP_URL}" style="display: inline-block; padding: 1rem 2rem; background: white; color: #764ba2; text-decoration: none; border-radius: 8px; font-weight: bold;">
        Launch App
      </a>
    </div>
  </div>
</body>
</html>
  `.trim();

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'max-age=0, must-revalidate',
    },
  });
}
