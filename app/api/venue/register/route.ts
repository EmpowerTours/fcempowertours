import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { createPublicClient, http } from 'viem';
import { activeChain } from '@/app/chains';
import {
  authenticateRequest,
  buildActionMessage,
  generateNonce,
  type SignaturePayload,
} from '@/lib/auth';
import { registerVenue, getVenueByOwner } from '@/lib/venue';

/**
 * POST /api/venue/register — Register a new venue
 * GET  /api/venue/register?address=X — Check registration status
 * GET  /api/venue/register?action=nonce&address=X — Get nonce for signing
 */

const MUSIC_SUBSCRIPTION_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION;

const SUBSCRIPTION_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'hasActiveSubscription',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ success: false, error: 'Address required' }, { status: 400 });
    }

    // Generate nonce for registration signing
    if (action === 'nonce') {
      const nonce = await generateNonce(address, 'venue-register');
      return NextResponse.json({ success: true, nonce });
    }

    // Check if address has a venue
    const venue = await getVenueByOwner(redis, address);
    return NextResponse.json({
      success: true,
      hasVenue: !!venue,
      venue: venue ? {
        venueId: venue.venueId,
        name: venue.name,
        isActive: venue.isActive,
        settings: venue.settings,
        createdAt: venue.createdAt,
      } : null,
    });
  } catch (error: any) {
    console.error('[VenueRegister] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, signature, timestamp, nonce, name, fid } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Venue name required (min 2 characters)' },
        { status: 400 }
      );
    }

    // Authenticate wallet signature
    const expectedMessage = buildActionMessage(
      address,
      timestamp,
      nonce,
      'Register Venue',
      `Venue: ${name.trim()}`
    );

    const authResult = await authenticateRequest(
      { address, signature, timestamp, nonce } as SignaturePayload,
      expectedMessage,
      'venue-register',
      true
    );

    if (!authResult.valid) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      );
    }

    // Check MusicSubscriptionV5 status
    if (MUSIC_SUBSCRIPTION_ADDRESS) {
      try {
        const publicClient = createPublicClient({
          chain: activeChain,
          transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz'),
        });

        const hasSubscription = await publicClient.readContract({
          address: MUSIC_SUBSCRIPTION_ADDRESS as `0x${string}`,
          abi: SUBSCRIPTION_ABI,
          functionName: 'hasActiveSubscription',
          args: [address as `0x${string}`],
        });

        if (!hasSubscription) {
          return NextResponse.json(
            { success: false, error: 'Active music subscription required to register a venue' },
            { status: 403 }
          );
        }
      } catch (err: any) {
        console.warn('[VenueRegister] Subscription check failed:', err.message);
        // Continue anyway if subscription check fails (contract may not be deployed)
      }
    }

    // Register the venue
    const { venue, apiKey } = await registerVenue(redis, address, name.trim(), fid);

    return NextResponse.json({
      success: true,
      venueId: venue.venueId,
      apiKey, // Shown once, never again
      message: 'Venue registered! Save your API key — it will not be shown again.',
    });
  } catch (error: any) {
    console.error('[VenueRegister] POST error:', error);

    if (error.message.includes('already has a registered venue')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
