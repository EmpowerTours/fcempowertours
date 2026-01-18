import { NextRequest, NextResponse } from 'next/server';
import { Address } from 'viem';
import {
  readSponsorship,
  checkIsCheckedIn,
  oracleCheckInGuest,
} from '@/lib/event-sponsorship';

/**
 * POST /api/sponsorship/checkin
 *
 * Oracle-verified check-in for sponsorship event.
 * Verifies GPS proximity before checking in guest.
 */

interface CheckInRequest {
  sponsorshipId: number;
  guestAddress: Address;
  latitude: number;
  longitude: number;
}

// Calculate distance between two GPS coordinates (in meters)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MAX_DISTANCE_METERS = 500; // Allow 500m radius for GPS variance

export async function POST(req: NextRequest) {
  try {
    const body: CheckInRequest = await req.json();
    const { sponsorshipId, guestAddress, latitude, longitude } = body;

    if (!sponsorshipId || !guestAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing sponsorshipId or guestAddress' },
        { status: 400 }
      );
    }

    // Get sponsorship details
    const sponsorship = await readSponsorship(sponsorshipId);
    if (!sponsorship) {
      return NextResponse.json(
        { success: false, error: 'Sponsorship not found' },
        { status: 404 }
      );
    }

    // Check status
    if (sponsorship.status !== 'Active' && sponsorship.status !== 'CheckingIn') {
      return NextResponse.json(
        { success: false, error: `Cannot check in: status is ${sponsorship.status}` },
        { status: 400 }
      );
    }

    // Check timing
    const now = Math.floor(Date.now() / 1000);
    if (now < sponsorship.checkInStart) {
      return NextResponse.json(
        { success: false, error: 'Check-in not yet open' },
        { status: 400 }
      );
    }
    if (now > sponsorship.checkInEnd) {
      return NextResponse.json(
        { success: false, error: 'Check-in has closed' },
        { status: 400 }
      );
    }

    // Check if already checked in
    const alreadyCheckedIn = await checkIsCheckedIn(sponsorshipId, guestAddress);
    if (alreadyCheckedIn) {
      return NextResponse.json(
        { success: false, error: 'Already checked in' },
        { status: 400 }
      );
    }

    // Verify GPS proximity (if event has GPS coordinates)
    if (sponsorship.latitude !== 0 && sponsorship.longitude !== 0) {
      if (!latitude || !longitude) {
        return NextResponse.json(
          { success: false, error: 'GPS coordinates required for this event' },
          { status: 400 }
        );
      }

      const distance = calculateDistance(
        latitude,
        longitude,
        sponsorship.latitude,
        sponsorship.longitude
      );

      console.log(`[SponsorshipCheckIn] Distance: ${distance}m (max: ${MAX_DISTANCE_METERS}m)`);

      if (distance > MAX_DISTANCE_METERS) {
        return NextResponse.json(
          {
            success: false,
            error: `Too far from event location (${Math.round(distance)}m away)`,
            distance: Math.round(distance),
          },
          { status: 400 }
        );
      }
    }

    // Oracle check-in
    console.log(`[SponsorshipCheckIn] Checking in ${guestAddress} for sponsorship ${sponsorshipId}`);
    const txHash = await oracleCheckInGuest(sponsorshipId, guestAddress);

    return NextResponse.json({
      success: true,
      txHash,
      message: 'Successfully checked in',
    });
  } catch (error: any) {
    console.error('[SponsorshipCheckIn] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
