import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseAbi, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Redis } from '@upstash/redis';

/**
 * POST /api/events/create
 *
 * Creates an event on-chain via EventOracleLite contract.
 * For testnet - no deposit required, just creates the event.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

import { activeChain } from '@/app/chains';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const EVENT_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_EVENT_ORACLE as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const EVENTS_KEY = 'event-oracle:events';

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(MONAD_RPC),
});

// EventOracleLite ABI
const eventOracleAbi = parseAbi([
  'function createEvent(string name, string description, uint256 sponsorFid, string sponsorName, string sponsorLogoIPFS, string city, string country, int256 latitude, int256 longitude, uint256 eventDate, uint256 maxAttendees, bool isOpenEvent) external returns (uint256)',
]);

interface CreateEventRequest {
  name: string;
  description: string;
  sponsorFid: number;
  sponsorName: string;
  sponsorLogoIPFS?: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  eventDate: number;
  maxAttendees?: number;
  isOpenEvent?: boolean;
  toursPerUser?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateEventRequest = await req.json();

    // Validate required fields
    if (!body.name || !body.city || !body.eventDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, city, eventDate' },
        { status: 400 }
      );
    }

    // Check if contract is configured
    if (!EVENT_ORACLE_ADDRESS || !DEPLOYER_KEY) {
      console.log('[EventsCreate] Contract not configured, storing in Redis only');

      const eventId = `event-${Date.now()}`;
      const event = {
        eventId,
        ...body,
        status: 'Active',
        createdAt: Date.now(),
        checkedInCount: 0,
        onChain: false,
      };

      await redis.hset(EVENTS_KEY, { [eventId]: JSON.stringify(event) });

      return NextResponse.json({
        success: true,
        eventId,
        event,
        onChain: false,
        message: 'Event created in database. Contract not configured for on-chain creation.',
      });
    }

    // Create on-chain using deployer wallet (oracle)
    const account = privateKeyToAccount(DEPLOYER_KEY);
    const walletClient = createWalletClient({
      account,
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    console.log('[EventsCreate] Creating event on-chain:', body.name);

    const hash = await walletClient.writeContract({
      address: EVENT_ORACLE_ADDRESS,
      abi: eventOracleAbi,
      functionName: 'createEvent',
      args: [
        body.name,
        body.description || '',
        BigInt(body.sponsorFid || 0),
        body.sponsorName || '',
        body.sponsorLogoIPFS || '',
        body.city,
        body.country || '',
        BigInt(Math.round((body.latitude || 0) * 1e6)),
        BigInt(Math.round((body.longitude || 0) * 1e6)),
        BigInt(body.eventDate),
        BigInt(body.maxAttendees || 100),
        body.isOpenEvent !== false, // Default to open
      ],
    });

    console.log('[EventsCreate] Transaction hash:', hash);

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('[EventsCreate] Transaction confirmed, block:', receipt.blockNumber);

    // Get event ID from logs (EventCreated event)
    // For now, we'll use a counter from Redis
    const eventCount = await redis.incr('event-oracle:counter');
    const eventId = eventCount.toString();

    // Store in Redis for quick access
    const event = {
      eventId,
      name: body.name,
      description: body.description || '',
      sponsorFid: body.sponsorFid || 0,
      sponsorName: body.sponsorName || '',
      sponsorLogoIPFS: body.sponsorLogoIPFS || '',
      city: body.city,
      country: body.country || '',
      latitude: body.latitude || 0,
      longitude: body.longitude || 0,
      eventDate: body.eventDate,
      maxAttendees: body.maxAttendees || 100,
      isOpenEvent: body.isOpenEvent !== false,
      toursPerUser: body.toursPerUser || '100',
      status: 'Active',
      createdAt: Date.now(),
      checkedInCount: 0,
      txHash: hash,
      onChain: true,
    };

    await redis.hset(EVENTS_KEY, { [eventId]: JSON.stringify(event) });

    return NextResponse.json({
      success: true,
      eventId,
      event,
      txHash: hash,
      onChain: true,
    });

  } catch (error: any) {
    console.error('[EventsCreate] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
