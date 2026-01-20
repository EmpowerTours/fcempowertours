import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { createPublicClient, createWalletClient, http, parseAbi, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Event Invite System
 *
 * Supports inviting guests WITHOUT requiring wallet addresses upfront.
 *
 * POST /api/events/invite - Create invites (by email, name, or generate codes)
 * GET /api/events/invite?code=XXX - Get invite details
 * PUT /api/events/invite - Accept invite (link wallet to invite)
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

import { activeChain } from '@/app/chains';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const EVENT_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_EVENT_ORACLE as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

const INVITES_KEY = 'event-oracle:invites'; // Hash: inviteCode -> invite data
const EVENT_INVITES_KEY = 'event-oracle:event-invites'; // Hash: eventId -> list of invite codes

// Generate a short invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0,O,1,I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

interface Invite {
  code: string;
  eventId: string;
  eventName: string;
  guestName?: string;
  guestEmail?: string;
  walletAddress?: string;
  fid?: number;
  status: 'pending' | 'accepted' | 'checked_in' | 'claimed';
  createdAt: number;
  acceptedAt?: number;
  checkedInAt?: number;
}

// POST - Create invites
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, eventName, guests, count } = body;

    if (!eventId) {
      return NextResponse.json({ success: false, error: 'eventId required' }, { status: 400 });
    }

    const invites: Invite[] = [];

    // Option 1: Create invites for specific guests (with names/emails)
    if (guests && Array.isArray(guests)) {
      for (const guest of guests) {
        const code = generateInviteCode();
        const invite: Invite = {
          code,
          eventId,
          eventName: eventName || '',
          guestName: guest.name,
          guestEmail: guest.email,
          walletAddress: guest.wallet, // Optional - if they already have one
          status: guest.wallet ? 'accepted' : 'pending',
          createdAt: Date.now(),
        };

        await redis.hset(INVITES_KEY, { [code]: JSON.stringify(invite) });
        invites.push(invite);
      }
    }
    // Option 2: Generate X anonymous invite codes
    else if (count && count > 0) {
      const numCodes = Math.min(count, 500); // Max 500 at once
      for (let i = 0; i < numCodes; i++) {
        const code = generateInviteCode();
        const invite: Invite = {
          code,
          eventId,
          eventName: eventName || '',
          status: 'pending',
          createdAt: Date.now(),
        };

        await redis.hset(INVITES_KEY, { [code]: JSON.stringify(invite) });
        invites.push(invite);
      }
    }

    // Store invite codes for this event
    const codes = invites.map(i => i.code);
    const existingCodes = await redis.hget(EVENT_INVITES_KEY, eventId) as string | null;
    const allCodes = existingCodes ? [...JSON.parse(existingCodes), ...codes] : codes;
    await redis.hset(EVENT_INVITES_KEY, { [eventId]: JSON.stringify(allCodes) });

    // Generate invite links
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://empowertours.xyz';
    const inviteLinks = invites.map(invite => ({
      code: invite.code,
      guestName: invite.guestName,
      guestEmail: invite.guestEmail,
      link: `${baseUrl}/event/invite/${invite.code}`,
      qrData: JSON.stringify({ type: 'event-invite', code: invite.code, eventId }),
    }));

    return NextResponse.json({
      success: true,
      invites: inviteLinks,
      count: invites.length,
      message: `Created ${invites.length} invite(s). Share the links with guests.`,
    });

  } catch (error: any) {
    console.error('[EventInvite] POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET - Get invite details by code
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const eventId = searchParams.get('eventId');

    // Get single invite by code
    if (code) {
      const inviteStr = await redis.hget(INVITES_KEY, code.toUpperCase()) as string | null;

      if (!inviteStr) {
        return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
      }

      const invite = JSON.parse(inviteStr);
      return NextResponse.json({ success: true, invite });
    }

    // Get all invites for an event
    if (eventId) {
      const codesStr = await redis.hget(EVENT_INVITES_KEY, eventId) as string | null;

      if (!codesStr) {
        return NextResponse.json({ success: true, invites: [], count: 0 });
      }

      const codes = JSON.parse(codesStr);
      const invites: Invite[] = [];

      for (const c of codes) {
        const inviteStr = await redis.hget(INVITES_KEY, c) as string | null;
        if (inviteStr) {
          invites.push(JSON.parse(inviteStr));
        }
      }

      // Summary stats
      const stats = {
        total: invites.length,
        pending: invites.filter(i => i.status === 'pending').length,
        accepted: invites.filter(i => i.status === 'accepted').length,
        checkedIn: invites.filter(i => i.status === 'checked_in').length,
        claimed: invites.filter(i => i.status === 'claimed').length,
      };

      return NextResponse.json({ success: true, invites, stats });
    }

    return NextResponse.json({ success: false, error: 'code or eventId required' }, { status: 400 });

  } catch (error: any) {
    console.error('[EventInvite] GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT - Accept invite (link wallet address)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, walletAddress, fid, guestName } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: 'Invite code required' }, { status: 400 });
    }

    const inviteStr = await redis.hget(INVITES_KEY, code.toUpperCase()) as string | null;

    if (!inviteStr) {
      return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
    }

    const invite: Invite = JSON.parse(inviteStr);

    if (invite.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: `Invite already ${invite.status}`,
        invite
      }, { status: 400 });
    }

    // Update invite with wallet/fid
    invite.walletAddress = walletAddress;
    invite.fid = fid;
    invite.guestName = guestName || invite.guestName;
    invite.status = 'accepted';
    invite.acceptedAt = Date.now();

    await redis.hset(INVITES_KEY, { [code.toUpperCase()]: JSON.stringify(invite) });

    // If wallet provided and contract configured, also register on-chain
    if (walletAddress && EVENT_ORACLE_ADDRESS && DEPLOYER_KEY) {
      try {
        const account = privateKeyToAccount(DEPLOYER_KEY);
        const walletClient = createWalletClient({
          account,
          chain: activeChain,
          transport: http(MONAD_RPC),
        });

        const eventOracleAbi = parseAbi([
          'function inviteUsers(uint256 eventId, address[] calldata users) external',
        ]);

        // Invite on-chain
        await walletClient.writeContract({
          address: EVENT_ORACLE_ADDRESS,
          abi: eventOracleAbi,
          functionName: 'inviteUsers',
          args: [BigInt(invite.eventId), [walletAddress as Address]],
        });

        console.log('[EventInvite] On-chain invite registered for:', walletAddress);
      } catch (chainError: any) {
        console.error('[EventInvite] On-chain invite failed:', chainError.message);
        // Continue - off-chain invite still valid
      }
    }

    return NextResponse.json({
      success: true,
      invite,
      message: 'Invite accepted! You can now check in at the event.',
    });

  } catch (error: any) {
    console.error('[EventInvite] PUT Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
