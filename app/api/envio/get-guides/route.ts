import { NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

interface GuideObject {
  fid: string;
  username: string;
  displayName: string;
  pfpUrl: string;
  bio: string;
  location: string;
  languages: string;
  transport: string;
  registeredAt: string;
  lastUpdated: string;
  active: boolean;
  suspended: boolean;
  averageRating: string;
  ratingCount: number;
  totalBookings: number;
  completedBookings: number;
}

export async function GET() {
  try {
    // Query for active tour guides from Envio indexer
    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetTourGuides {
            TourGuide(
              where: {
                active: {_eq: true},
                suspended: {_eq: false}
              },
              order_by: {registeredAt: desc},
              limit: 50
            ) {
              guideFid
              guideAddress
              username
              displayName
              pfpUrl
              bio
              location
              languages
              transport
              active
              suspended
              averageRating
              ratingCount
              totalBookings
              completedBookings
              registeredAt
              lastUpdated
            }
          }
        `
      }),
    });

    if (!response.ok) {
      throw new Error(`Envio query failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const guides = data.data?.TourGuide || [];

    console.log(`✅ Fetched ${guides.length} active tour guides from Envio`);

    // Transform to expected format
    const processedGuides: GuideObject[] = guides.map((guide: any) => ({
      fid: guide.guideFid,
      username: guide.username || 'unknown',
      displayName: guide.displayName || guide.username || 'Unknown Guide',
      pfpUrl: guide.pfpUrl || '',
      bio: guide.bio || '',
      location: guide.location || '',
      languages: guide.languages || '',
      transport: guide.transport || '',
      registeredAt: guide.registeredAt || '0',
      lastUpdated: guide.lastUpdated || '0',
      active: guide.active,
      suspended: guide.suspended,
      averageRating: guide.averageRating || '0',
      ratingCount: guide.ratingCount || 0,
      totalBookings: guide.totalBookings || 0,
      completedBookings: guide.completedBookings || 0,
    }));

    return NextResponse.json({
      success: true,
      guides: processedGuides,
      count: processedGuides.length,
    });

  } catch (error: any) {
    console.error('❌ Error fetching guides from Envio:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch guides',
        guides: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
