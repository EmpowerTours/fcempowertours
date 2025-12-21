import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

interface Params {
  tokenId: string;
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

async function getPassportOwner(tokenId: string): Promise<string | null> {
  try {
    const query = `
      query GetPassport($tokenId: String!) {
        PassportNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
          owner
          countryCode
          countryName
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { tokenId }
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error('❌ Envio query failed:', response.status);
      return null;
    }

    const data = await response.json();
    const passport = data.data?.PassportNFT?.[0];

    if (passport?.owner) {
      console.log('✅ Found passport owner:', passport.owner);
      return passport.owner;
    }

    return null;
  } catch (err: any) {
    console.error('❌ Error fetching passport owner:', err.message);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { tokenId } = await params;

    // 🔥 CRITICAL: Get the owner's address to link to their profile
    const ownerAddress = await getPassportOwner(tokenId);

    // Link to the owner's profile page if we have their address
    const miniAppUrl = ownerAddress
      ? `${APP_URL}/profile?address=${ownerAddress}`
      : `${APP_URL}/passport/${tokenId}`;

    const ogImageUrl = `${APP_URL}/api/og/passport?tokenId=${tokenId}`;
    const frameUrl = `${APP_URL}/api/frames/passport/${tokenId}`;
    console.log('🎬 Frame request for passport token:', tokenId, '| Owner:', ownerAddress);
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="og:title" content="Travel Passport #${tokenId}">
          <meta property="og:description" content="Check out this travel passport on EmpowerTours">
          <meta property="og:image" content="${ogImageUrl}">
          <meta property="og:url" content="${frameUrl}">
          <meta property="og:type" content="website">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${ogImageUrl}">
          <meta property="fc:frame:image:aspect_ratio" content="1.91:1">
          <meta property="fc:frame:button:1" content="👤 View Profile">
          <meta property="fc:frame:button:1:action" content="launch_frame">
          <meta property="fc:frame:button:1:target" content="${miniAppUrl}">
          <meta property="fc:frame:button:2" content="🗺️ Collect More">
          <meta property="fc:frame:button:2:action" content="launch_frame">
          <meta property="fc:frame:button:2:target" content="${APP_URL}/passport">
          <title>Travel Passport #${tokenId} - EmpowerTours</title>
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
