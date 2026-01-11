import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * GET /api/events/list
 *
 * Returns all sponsored events from Redis cache.
 * Events are indexed by the EventSponsorshipAgreement contract.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const EVENTS_KEY = 'event-oracle:events';
const EVENTS_LIST_KEY = 'sponsored-events:list';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/68dbfa8/v1/graphql';

interface SponsoredEvent {
  eventId: string;
  name: string;
  description: string;
  eventType: string;
  status: string;
  sponsor: string;
  sponsorFid: number;
  sponsorName: string;
  sponsorLogoIPFS: string;
  sponsorLogoUrl?: string;
  totalDeposit: string;
  wmonRewardPerUser: string;
  toursRewardPerUser: string;
  venueName: string;
  venueAddress: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  googlePlaceId: string;
  eventDate: number;
  checkInStart: number;
  checkInEnd: number;
  maxAttendees: number;
  checkedInCount: number;
  stampImageIPFS: string;
  stampName: string;
}

export async function GET() {
  try {
    // Try to fetch from Envio first
    const envioEvents = await fetchEventsFromEnvio();

    if (envioEvents.length > 0) {
      // Cache in Redis
      await redis.set(EVENTS_KEY, JSON.stringify(envioEvents), { ex: 60 }); // 1 min cache
      return NextResponse.json({ success: true, events: envioEvents, source: 'envio' });
    }

    // Check events hash (from create API)
    const eventsHash = await redis.hgetall(EVENTS_KEY);
    if (eventsHash && Object.keys(eventsHash).length > 0) {
      const events = Object.values(eventsHash).map((e) =>
        typeof e === 'string' ? JSON.parse(e) : e
      );
      return NextResponse.json({ success: true, events, source: 'redis' });
    }

    // Fallback to old list cache
    const cached = await redis.get<SponsoredEvent[]>(EVENTS_LIST_KEY);
    if (cached) {
      return NextResponse.json({ success: true, events: cached, source: 'cache' });
    }

    // Return demo event for testing
    const demoEvent: SponsoredEvent = {
      eventId: '1',
      name: 'Rendez-vous Gala Mexico 2026',
      description: 'Art gala featuring Latin American artists Ali Alvarez, José Andrés Aguilar, and Veronica Riedel. Includes silent auction and cultural performances.',
      eventType: 'Gala',
      status: 'Pending',
      sponsor: '0x0000000000000000000000000000000000000000',
      sponsorFid: 0,
      sponsorName: 'La Mille',
      sponsorLogoIPFS: '',
      totalDeposit: '10000',
      wmonRewardPerUser: '50',
      toursRewardPerUser: '100',
      venueName: 'Casa Seminario 12',
      venueAddress: 'Seminario #12, Centro Historico, CDMX',
      city: 'Mexico City',
      country: 'Mexico',
      latitude: 19432600, // 19.4326 * 1e6
      longitude: -99133200, // -99.1332 * 1e6
      googlePlaceId: '',
      eventDate: Math.floor(new Date('2026-03-15T19:00:00').getTime() / 1000),
      checkInStart: Math.floor(new Date('2026-03-15T18:00:00').getTime() / 1000),
      checkInEnd: Math.floor(new Date('2026-03-16T01:00:00').getTime() / 1000),
      maxAttendees: 120,
      checkedInCount: 0,
      stampImageIPFS: '',
      stampName: 'Rendez-vous Gala Mexico 2026',
    };

    return NextResponse.json({
      success: true,
      events: [demoEvent],
      source: 'demo',
      message: 'Demo event - contract not yet deployed',
    });

  } catch (error: any) {
    console.error('[EventsList] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function fetchEventsFromEnvio(): Promise<SponsoredEvent[]> {
  try {
    const query = `
      query GetSponsoredEvents {
        SponsoredEvent(
          where: { status: { _neq: "Cancelled" } }
          order_by: { eventDate: asc }
          limit: 50
        ) {
          eventId
          name
          description
          eventType
          status
          sponsor
          sponsorFid
          sponsorName
          sponsorLogoIPFS
          totalDeposit
          wmonRewardPerUser
          toursRewardPerUser
          venueName
          venueAddress
          city
          country
          latitude
          longitude
          googlePlaceId
          eventDate
          checkInStart
          checkInEnd
          maxAttendees
          checkedInCount
          stampImageIPFS
          stampName
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.log('[EventsList] Envio query failed:', response.status);
      return [];
    }

    const data = await response.json();
    const events = data.data?.SponsoredEvent || [];

    // Add IPFS gateway URL for logos
    return events.map((event: any) => ({
      ...event,
      sponsorLogoUrl: event.sponsorLogoIPFS
        ? `https://ipfs.io/ipfs/${event.sponsorLogoIPFS}`
        : '',
    }));

  } catch (error) {
    console.error('[EventsList] Envio fetch error:', error);
    return [];
  }
}
