import { NextRequest, NextResponse } from 'next/server';

const ENVIO_GRAPHQL_URL = process.env.ENVIO_GRAPHQL_URL || 'https://indexer.hyperindex.xyz/0fbe719/v1/graphql';

interface ClimbLocation {
  id: string;
  locationId: string;
  name: string;
  difficulty: string;
  latitude: string;
  longitude: string;
  photoProofIPFS: string;
  description: string;
  priceWmon: string;
  creator: string;
  createdAt: string;
  isActive: boolean;
  totalPurchases: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const creator = searchParams.get('creator');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build GraphQL query
    let whereClause = 'where: { isActive: { _eq: true }, isDisabled: { _eq: false } }';
    if (creator) {
      whereClause = `where: { isActive: { _eq: true }, isDisabled: { _eq: false }, creator: { _eq: "${creator.toLowerCase()}" } }`;
    }

    const query = `
      query GetClimbLocations {
        ClimbLocation(${whereClause}, order_by: { createdAt: desc }, limit: ${limit}) {
          id
          locationId
          name
          difficulty
          latitude
          longitude
          photoProofIPFS
          description
          priceWmon
          creator
          creatorFid
          creatorTelegramId
          isActive
          totalPurchases
          totalClimbs
          createdAt
        }
      }
    `;

    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[ClimbingLocations] Envio request failed:', response.status);
      return NextResponse.json({ success: false, error: 'Failed to fetch locations' }, { status: 500 });
    }

    const data = await response.json();

    if (data.errors) {
      console.error('[ClimbingLocations] GraphQL errors:', data.errors);
      return NextResponse.json({ success: false, error: 'GraphQL query failed' }, { status: 500 });
    }

    const locations = (data.data?.ClimbLocation || []).map((loc: any) => ({
      id: loc.id,
      locationId: loc.locationId,
      name: loc.name,
      difficulty: loc.difficulty || 'Unknown',
      latitude: loc.latitude ? Number(loc.latitude) / 1e6 : 0,
      longitude: loc.longitude ? Number(loc.longitude) / 1e6 : 0,
      photoProofIPFS: loc.photoProofIPFS,
      description: loc.description || '',
      priceWmon: loc.priceWmon ? (Number(loc.priceWmon) / 1e18).toFixed(2) : '0',
      creator: loc.creator,
      creatorFid: loc.creatorFid,
      creatorTelegramId: loc.creatorTelegramId,
      createdAt: loc.createdAt,
      totalPurchases: loc.totalPurchases || 0,
      totalClimbs: loc.totalClimbs || 0,
    }));

    return NextResponse.json({
      success: true,
      locations,
      count: locations.length,
    });
  } catch (error) {
    console.error('[ClimbingLocations] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
