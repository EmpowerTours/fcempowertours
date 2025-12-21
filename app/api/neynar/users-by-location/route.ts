import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const neynarClient = new NeynarAPIClient({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latitude = searchParams.get('latitude');
    const longitude = searchParams.get('longitude');
    const limit = searchParams.get('limit') || '50';

    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: 'Latitude and longitude required' },
        { status: 400 }
      );
    }

    console.log('[Neynar] Fetching users by location:', { latitude, longitude, limit });

    // Use Neynar SDK to fetch users by location
    const result = await neynarClient.fetchUsersByLocation({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      limit: parseInt(limit),
    });

    console.log('[Neynar] Found users:', result.users?.length || 0);

    return NextResponse.json({
      success: true,
      users: result.users || [],
      cursor: result.next?.cursor || null,
    });
  } catch (error: any) {
    console.error('[Neynar] Error fetching users by location:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch users',
        users: [], // Return empty array on error for graceful fallback
      },
      { status: 200 } // Return 200 to prevent breaking the UI
    );
  }
}
