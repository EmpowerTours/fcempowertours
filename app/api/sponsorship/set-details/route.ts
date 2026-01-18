import { NextRequest, NextResponse } from 'next/server';
import {
  readSponsorship,
  oracleSetEventDetails,
} from '@/lib/event-sponsorship';

/**
 * POST /api/sponsorship/set-details
 *
 * Oracle/Host sets event details (date, GPS coordinates).
 * Only works when sponsorship is Active.
 */

interface SetDetailsRequest {
  sponsorshipId: number;
  eventDate: number; // Unix timestamp
  latitude: number;
  longitude: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: SetDetailsRequest = await req.json();
    const { sponsorshipId, eventDate, latitude, longitude } = body;

    if (!sponsorshipId || !eventDate) {
      return NextResponse.json(
        { success: false, error: 'Missing sponsorshipId or eventDate' },
        { status: 400 }
      );
    }

    // Validate event date is in the future
    const now = Math.floor(Date.now() / 1000);
    if (eventDate <= now) {
      return NextResponse.json(
        { success: false, error: 'Event date must be in the future' },
        { status: 400 }
      );
    }

    // Get sponsorship
    const sponsorship = await readSponsorship(sponsorshipId);
    if (!sponsorship) {
      return NextResponse.json(
        { success: false, error: 'Sponsorship not found' },
        { status: 404 }
      );
    }

    // Check status
    if (sponsorship.status !== 'Active') {
      return NextResponse.json(
        { success: false, error: `Cannot update: status is ${sponsorship.status}` },
        { status: 400 }
      );
    }

    // Set details via Oracle
    console.log(`[SponsorshipSetDetails] Updating sponsorship ${sponsorshipId}:`, {
      eventDate: new Date(eventDate * 1000).toISOString(),
      latitude,
      longitude,
    });

    const txHash = await oracleSetEventDetails(
      sponsorshipId,
      eventDate,
      latitude || 0,
      longitude || 0
    );

    // Get updated sponsorship
    const updated = await readSponsorship(sponsorshipId);

    return NextResponse.json({
      success: true,
      txHash,
      sponsorship: updated,
    });
  } catch (error: any) {
    console.error('[SponsorshipSetDetails] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
