import { NextRequest, NextResponse } from 'next/server';

/**
 * Oracle Create Itinerary Route
 *
 * Creates an experience/itinerary on the ItineraryNFT contract.
 * Called by CreateExperienceModal after photos and metadata are uploaded to IPFS.
 *
 * The creator earns 70% of all future purchases.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      creator,
      creatorFid,
      title,
      description,
      city,
      country,
      price,
      photoProofIPFS,
      locations,
    } = body;

    // Validate required fields
    if (!creator) {
      return NextResponse.json(
        { success: false, error: 'Creator wallet address is required' },
        { status: 400 }
      );
    }

    if (!title || !city || !country) {
      return NextResponse.json(
        { success: false, error: 'Title, city, and country are required' },
        { status: 400 }
      );
    }

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one location is required' },
        { status: 400 }
      );
    }

    console.log('[CreateItinerary] Creating experience:', {
      creator,
      creatorFid,
      title,
      city,
      country,
      price,
      locationsCount: locations.length,
    });

    // Build the base URL for execute-delegated
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Call execute-delegated with create_itinerary action
    const executeRes = await fetch(`${baseUrl}/api/execute-delegated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: creator,
        action: 'create_itinerary',
        params: {
          creatorFid: creatorFid || 0,
          title,
          description: description || '',
          city,
          country,
          price: price || '10',
          photoProofIPFS: photoProofIPFS || '',
          locations: locations.map((loc: any) => ({
            name: loc.name || 'Unknown',
            placeId: loc.placeId || '',
            uri: loc.googleMapsUri || '',
            latitude: loc.latitude || 0,
            longitude: loc.longitude || 0,
            description: loc.description || '',
          })),
        },
      }),
    });

    const executeData = await executeRes.json();

    if (!executeData.success) {
      console.error('[CreateItinerary] Execute failed:', executeData.error);
      return NextResponse.json(
        { success: false, error: executeData.error || 'Failed to create experience' },
        { status: 500 }
      );
    }

    console.log('[CreateItinerary] Success:', {
      txHash: executeData.txHash,
      title: executeData.title,
    });

    return NextResponse.json({
      success: true,
      txHash: executeData.txHash,
      itineraryId: executeData.itineraryId || '0', // Contract returns the token ID
      title: executeData.title,
      city: executeData.city,
      country: executeData.country,
      message: executeData.message || `Experience "${title}" created! You earn 70% of every purchase.`,
    });

  } catch (error: any) {
    console.error('[CreateItinerary] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create experience' },
      { status: 500 }
    );
  }
}
