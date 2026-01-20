import { NextRequest, NextResponse } from 'next/server';

/**
 * Oracle Check-In Experience Route
 *
 * Verifies GPS location and stamps the user's passport for an experience.
 * - Validates user is within proximity radius of the location
 * - Adds stamp to the appropriate country passport
 * - GPS verification is recorded on-chain
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userAddress, itineraryId, latitude, longitude, passportTokenId } = body;

    // Validate required fields
    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'User wallet address is required' },
        { status: 400 }
      );
    }

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      );
    }

    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, error: 'GPS coordinates are required' },
        { status: 400 }
      );
    }

    console.log('[CheckInExperience] Check-in request:', {
      userAddress,
      itineraryId,
      coords: { lat: latitude, lon: longitude },
    });

    // Build the base URL for execute-delegated
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Call execute-delegated with checkin_itinerary action
    const executeRes = await fetch(`${baseUrl}/api/execute-delegated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress,
        action: 'checkin_itinerary',
        params: {
          itineraryId: itineraryId.toString(),
          userLatitude: latitude,
          userLongitude: longitude,
          passportTokenId: passportTokenId?.toString(),
        },
      }),
    });

    const executeData = await executeRes.json();

    if (!executeData.success) {
      console.error('[CheckInExperience] Execute failed:', executeData.error);

      // Check if it's a "no passport" error
      if (executeData.countryRequired) {
        return NextResponse.json({
          success: false,
          error: executeData.error,
          needsPassport: true,
          countryRequired: executeData.countryRequired,
          countryCode: executeData.countryCode,
          hint: executeData.hint,
        }, { status: 400 });
      }

      return NextResponse.json(
        { success: false, error: executeData.error || 'Check-in failed' },
        { status: 500 }
      );
    }

    console.log('[CheckInExperience] Success:', {
      txHash: executeData.txHash,
      passportTokenId: executeData.passportTokenId,
    });

    return NextResponse.json({
      success: true,
      txHash: executeData.txHash,
      passportTokenId: executeData.passportTokenId,
      itineraryId,
      gpsVerified: executeData.gpsVerified,
      message: 'Check-in complete! Your passport has been stamped.',
    });

  } catch (error: any) {
    console.error('[CheckInExperience] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Check-in failed' },
      { status: 500 }
    );
  }
}
