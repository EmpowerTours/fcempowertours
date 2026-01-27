import { NextRequest, NextResponse } from 'next/server';

const ENVIO_GRAPHQL_URL = process.env.ENVIO_GRAPHQL_URL || 'https://indexer.hyperindex.xyz/0fbe719/v1/graphql';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const holder = searchParams.get('holder');

    if (!holder) {
      return NextResponse.json({ success: false, error: 'Holder address required' }, { status: 400 });
    }

    // Fetch user's access badges (purchased locations)
    const query = `
      query GetUserClimbPurchases {
        ClimbAccessBadge(where: { holder: { _eq: "${holder.toLowerCase()}" } }, order_by: { purchasedAt: desc }) {
          id
          tokenId
          locationId
          holder
          holderFid
          purchasedAt
          txHash
          location {
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
            createdAt
          }
        }
        ClimbProof(where: { climber: { _eq: "${holder.toLowerCase()}" } }, order_by: { climbedAt: desc }) {
          id
          tokenId
          locationId
          climber
          photoIPFS
          entryText
          reward
          climbedAt
          txHash
          location {
            name
            difficulty
          }
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
      console.error('[MyClimbPurchases] Envio request failed:', response.status);
      return NextResponse.json({ success: false, error: 'Failed to fetch purchases' }, { status: 500 });
    }

    const data = await response.json();

    if (data.errors) {
      console.error('[MyClimbPurchases] GraphQL errors:', data.errors);
      return NextResponse.json({ success: false, error: 'GraphQL query failed' }, { status: 500 });
    }

    const accessBadges = (data.data?.ClimbAccessBadge || []).map((badge: any) => ({
      id: badge.id,
      tokenId: badge.tokenId,
      locationId: badge.locationId,
      purchasedAt: badge.purchasedAt,
      txHash: badge.txHash,
      location: badge.location ? {
        id: badge.location.id,
        locationId: badge.location.locationId,
        name: badge.location.name,
        difficulty: badge.location.difficulty || 'Unknown',
        latitude: badge.location.latitude ? Number(badge.location.latitude) / 1e6 : 0,
        longitude: badge.location.longitude ? Number(badge.location.longitude) / 1e6 : 0,
        photoProofIPFS: badge.location.photoProofIPFS,
        description: badge.location.description || '',
        priceWmon: badge.location.priceWmon ? (Number(badge.location.priceWmon) / 1e18).toFixed(2) : '0',
        creator: badge.location.creator,
        createdAt: badge.location.createdAt,
      } : null,
    }));

    const climbProofs = (data.data?.ClimbProof || []).map((proof: any) => ({
      id: proof.id,
      tokenId: proof.tokenId,
      locationId: proof.locationId,
      photoIPFS: proof.photoIPFS,
      entryText: proof.entryText,
      reward: proof.reward ? (Number(proof.reward) / 1e18).toFixed(2) : '0',
      climbedAt: proof.climbedAt,
      txHash: proof.txHash,
      locationName: proof.location?.name || 'Unknown',
      locationDifficulty: proof.location?.difficulty || 'Unknown',
    }));

    return NextResponse.json({
      success: true,
      accessBadges,
      climbProofs,
      totalPurchases: accessBadges.length,
      totalClimbs: climbProofs.length,
    });
  } catch (error) {
    console.error('[MyClimbPurchases] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
