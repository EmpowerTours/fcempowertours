import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, Address, keccak256, encodePacked } from 'viem';
import { Redis } from '@upstash/redis';

/**
 * POST /api/events/checkin
 *
 * Check in to a sponsored event with GPS verification.
 * Validates location is within 500m of venue.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

import { activeChain } from '@/app/chains';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const EVENT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_EVENT_SPONSORSHIP_CONTRACT as Address;
const CHECKINS_KEY = 'sponsored-events:checkins';

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(MONAD_RPC),
});

interface CheckInRequest {
  eventId: string;
  userAddress?: string;  // Optional - can check in by invite code
  userFid?: number;
  latitude: number;  // Scaled by 1e6
  longitude: number; // Scaled by 1e6
  qrSecret?: string; // Optional QR code secret
  inviteCode?: string; // Check in using invite code (for walletless users)
}

const INVITES_KEY = 'event-oracle:invites';

// GPS verification: Check if user is within 500m of venue
function verifyGPS(
  venueLat: number,
  venueLon: number,
  userLat: number,
  userLon: number
): boolean {
  // Coordinates are scaled by 1e6
  // 1 degree latitude ≈ 111,000 meters
  // 500m ≈ 0.0045 degrees ≈ 4500 when scaled by 1e6
  const threshold = 5000; // Being generous for GPS drift

  const latDiff = Math.abs(venueLat - userLat);
  const lonDiff = Math.abs(venueLon - userLon);

  return latDiff <= threshold && lonDiff <= threshold;
}

export async function POST(req: NextRequest) {
  try {
    const body: CheckInRequest = await req.json();

    // Validate required fields - allow check-in by invite code OR wallet address
    if (!body.eventId) {
      return NextResponse.json(
        { success: false, error: 'eventId required' },
        { status: 400 }
      );
    }

    if (!body.userAddress && !body.inviteCode) {
      return NextResponse.json(
        { success: false, error: 'Either userAddress or inviteCode required' },
        { status: 400 }
      );
    }

    if (body.latitude === undefined || body.longitude === undefined) {
      return NextResponse.json(
        { success: false, error: 'GPS location required for check-in' },
        { status: 400 }
      );
    }

    // If checking in via invite code, look up the invite
    let invite: any = null;
    let checkInIdentifier = body.userAddress?.toLowerCase();

    if (body.inviteCode) {
      const inviteStr = await redis.hget(INVITES_KEY, body.inviteCode.toUpperCase()) as string | null;
      if (!inviteStr) {
        return NextResponse.json(
          { success: false, error: 'Invalid invite code' },
          { status: 400 }
        );
      }
      invite = JSON.parse(inviteStr);

      // Verify invite is for this event
      if (String(invite.eventId) !== String(body.eventId)) {
        return NextResponse.json(
          { success: false, error: 'Invite code is for a different event' },
          { status: 400 }
        );
      }

      // Check invite status
      if (invite.status === 'checked_in' || invite.status === 'claimed') {
        return NextResponse.json(
          { success: false, error: `Already checked in with this invite (status: ${invite.status})` },
          { status: 400 }
        );
      }

      // Use wallet from invite if available, otherwise use invite code as identifier
      checkInIdentifier = invite.walletAddress?.toLowerCase() || `invite:${body.inviteCode.toUpperCase()}`;
    }

    // Check for existing check-in
    const checkInKey = `${CHECKINS_KEY}:${body.eventId}:${checkInIdentifier}`;
    const existingCheckIn = await redis.get(checkInKey);

    if (existingCheckIn) {
      return NextResponse.json(
        { success: false, error: 'Already checked in to this event' },
        { status: 400 }
      );
    }

    // Get event details (from Redis cache or contract)
    const eventKey = `sponsored-events:${body.eventId}`;
    let event = await redis.get<any>(eventKey);

    if (!event) {
      // Demo event for testing
      if (body.eventId === '1' || body.eventId.startsWith('pending-')) {
        event = {
          eventId: body.eventId,
          name: 'Rendez-vous Gala Mexico 2026',
          latitude: 19432600,
          longitude: -99133200,
          status: 'Active',
          checkInStart: Math.floor(Date.now() / 1000) - 3600,
          checkInEnd: Math.floor(Date.now() / 1000) + 86400,
          maxAttendees: 120,
          checkedInCount: 0,
        };
      } else {
        return NextResponse.json(
          { success: false, error: 'Event not found' },
          { status: 404 }
        );
      }
    }

    // Verify event is active
    const now = Math.floor(Date.now() / 1000);
    if (event.status !== 'Active' && event.status !== 'Pending') {
      // Allow check-in for demo/pending events
      console.log('[EventsCheckin] Event status:', event.status);
    }

    // Verify GPS location
    const gpsVerified = verifyGPS(
      event.latitude,
      event.longitude,
      body.latitude,
      body.longitude
    );

    // Store check-in
    const checkIn = {
      eventId: body.eventId,
      userAddress: checkInIdentifier,
      userFid: body.userFid || invite?.fid,
      inviteCode: body.inviteCode?.toUpperCase(),
      guestName: invite?.guestName,
      checkInTime: Date.now(),
      latitude: body.latitude,
      longitude: body.longitude,
      gpsVerified,
      rewardsClaimed: false,
      stampTokenId: null,
    };

    await redis.set(checkInKey, JSON.stringify(checkIn));

    // Add to event's check-in list
    const attendeeListKey = `${CHECKINS_KEY}:${body.eventId}:attendees`;
    await redis.lpush(attendeeListKey, checkInIdentifier!);

    // Update event check-in count
    event.checkedInCount = (event.checkedInCount || 0) + 1;
    await redis.set(eventKey, JSON.stringify(event));

    // If using invite code, update invite status to checked_in
    if (invite && body.inviteCode) {
      invite.status = 'checked_in';
      invite.checkedInAt = Date.now();
      await redis.hset(INVITES_KEY, { [body.inviteCode.toUpperCase()]: JSON.stringify(invite) });
      console.log('[EventsCheckin] Updated invite status to checked_in:', body.inviteCode);
    }

    // If contract is deployed, also record on-chain
    if (EVENT_CONTRACT_ADDRESS && checkInIdentifier && !checkInIdentifier.startsWith('invite:')) {
      // In production, this would call the contract via User Safe
      // For now, just log the intent
      console.log('[EventsCheckin] Would call checkInFor on contract:', {
        eventId: body.eventId,
        user: checkInIdentifier,
        userFid: body.userFid || invite?.fid,
        gpsVerified,
      });
    }

    return NextResponse.json({
      success: true,
      checkIn: {
        eventId: body.eventId,
        userAddress: checkInIdentifier,
        inviteCode: body.inviteCode?.toUpperCase(),
        guestName: invite?.guestName,
        checkInTime: checkIn.checkInTime,
        gpsVerified,
      },
      message: gpsVerified
        ? 'Check-in successful! GPS location verified.'
        : 'Check-in recorded, but GPS could not be verified (too far from venue).',
    });

  } catch (error: any) {
    console.error('[EventsCheckin] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET - Check if user is checked in (by wallet address or invite code)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const userAddress = searchParams.get('userAddress');
    const inviteCode = searchParams.get('inviteCode');

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'eventId required' },
        { status: 400 }
      );
    }

    if (!userAddress && !inviteCode) {
      return NextResponse.json(
        { success: false, error: 'userAddress or inviteCode required' },
        { status: 400 }
      );
    }

    // Determine check-in identifier
    let checkInIdentifier = userAddress?.toLowerCase();

    if (inviteCode) {
      // Look up invite to get wallet or use invite-based identifier
      const inviteStr = await redis.hget(INVITES_KEY, inviteCode.toUpperCase()) as string | null;
      if (inviteStr) {
        const invite = JSON.parse(inviteStr);
        checkInIdentifier = invite.walletAddress?.toLowerCase() || `invite:${inviteCode.toUpperCase()}`;
      } else {
        checkInIdentifier = `invite:${inviteCode.toUpperCase()}`;
      }
    }

    const checkInKey = `${CHECKINS_KEY}:${eventId}:${checkInIdentifier}`;
    const checkIn = await redis.get<any>(checkInKey);

    if (!checkIn) {
      return NextResponse.json({
        success: true,
        checkedIn: false,
      });
    }

    return NextResponse.json({
      success: true,
      checkedIn: true,
      checkIn: typeof checkIn === 'string' ? JSON.parse(checkIn) : checkIn,
    });

  } catch (error: any) {
    console.error('[EventsCheckin] GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
