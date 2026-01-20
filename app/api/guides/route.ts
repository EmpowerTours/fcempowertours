import { NextRequest, NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get('fid');

  if (!fid) {
    return NextResponse.json({ success: false, error: 'FID required' }, { status: 400 });
  }

  try {
    // Query Envio for guide data
    const query = `
      query GetGuide($fid: numeric!) {
        TourGuideRegistry_GuideRegistered(where: { fid: { _eq: $fid } }) {
          fid
          guideAddress
          bio
          languages
          transport
          hourlyRateWMON
          location
          registeredAt
        }
        TourGuideRegistry_GuideUpdated(
          where: { fid: { _eq: $fid } }
          order_by: { blockNumber: desc }
          limit: 1
        ) {
          bio
          languages
          transport
          hourlyRateWMON
          location
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { fid: parseInt(fid) }
      })
    });

    const data = await response.json();

    const registered = data?.data?.TourGuideRegistry_GuideRegistered?.[0];
    const updated = data?.data?.TourGuideRegistry_GuideUpdated?.[0];

    if (!registered) {
      return NextResponse.json({
        success: true,
        guide: null,
        isGuide: false
      });
    }

    // Merge registered data with latest update
    const guide = {
      fid: registered.fid,
      guideAddress: registered.guideAddress,
      bio: updated?.bio || registered.bio,
      languages: updated?.languages || registered.languages,
      transport: updated?.transport || registered.transport,
      hourlyRateWMON: updated?.hourlyRateWMON || registered.hourlyRateWMON,
      location: updated?.location || registered.location,
      registeredAt: registered.registeredAt,
      isGuide: true
    };

    return NextResponse.json({
      success: true,
      guide,
      isGuide: true
    });

  } catch (error: any) {
    console.error('[API/guides] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      guide: null,
      isGuide: false
    }, { status: 500 });
  }
}
