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
    const { searchParams } = new URL(request.url);

    // Check for direct parameters (used when casting immediately after mint)
    const directImage = searchParams.get('imageUrl');
    const directTitle = searchParams.get('title');
    const directPrice = searchParams.get('price');

    console.log('🎨 Frame request for art NFT token:', tokenId);

    // ✅ Add ?type=art so the NFT page shows "Loading art..." instead of "Loading music..."
    const miniAppUrl = `${APP_URL}/nft/${tokenId}?type=art`;

    // Build OG URL with direct params if available
    let ogImageUrl = `${APP_URL}/api/og/art?tokenId=${tokenId}`;
    if (directImage) {
      ogImageUrl += `&imageUrl=${encodeURIComponent(directImage)}`;
    }
    if (directTitle) {
      ogImageUrl += `&title=${encodeURIComponent(directTitle)}`;
    }

    const artTitle = directTitle || `Art NFT #${tokenId}`;
    const artPrice = directPrice || '0';

    // Mini app frame data - launches directly to NFT view page
    const frameData = {
      version: 'next',
      imageUrl: ogImageUrl,
      button: {
        title: '🎨 View & Buy',
        action: {
          type: 'launch_frame',
          name: 'EmpowerTours',
          url: miniAppUrl,
          splashImageUrl: `${APP_URL}/splash.png`,
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

          <!-- Open Graph for cast preview -->
          <meta property="og:title" content="${artTitle}">
          <meta property="og:description" content="${artPrice} WMON - Collect & license on EmpowerTours">
          <meta property="og:image" content="${ogImageUrl}">
          <meta property="og:type" content="website">
          <meta property="og:url" content="${APP_URL}/api/frames/art/${tokenId}">

          <!-- Twitter card -->
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${artTitle}">
          <meta name="twitter:image" content="${ogImageUrl}">

          <!-- Farcaster Frame with Mini App Launch (same as music frame) -->
          <meta name="fc:frame" content='${JSON.stringify(frameData)}'>
          <meta name="of:version" content="vNext">
          <meta name="of:accepts:farcaster" content="vNext">
          <meta name="of:image" content="${ogImageUrl}">

          <title>${artTitle} - EmpowerTours</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: white; text-align: center;">
          <h1>${artTitle}</h1>
          <p>Price: ${artPrice} WMON</p>
          <p><a href="${miniAppUrl}" style="color: #00d4ff;">Open in EmpowerTours</a></p>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error: any) {
    console.error('❌ Art frame error:', error);
    return new NextResponse('Error generating frame', { status: 500 });
  }
}
