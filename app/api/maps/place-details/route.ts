import { NextRequest, NextResponse } from 'next/server';
import { detectUserTerritory, getMapProvider } from '@/lib/maps/provider';

// Server-side only — key never exposed to client
const GOOGLE_MAPS_SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Rate limiting: per-IP request tracking
const requestLog = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 5;
const MAX_PLACE_IDS = 20;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestLog.get(ip);

  if (!entry || now > entry.resetAt) {
    requestLog.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestLog) {
    if (now > entry.resetAt) requestLog.delete(ip);
  }
}, 300_000);

interface PlaceDetailsResult {
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  address?: string;
  types?: string[];
  openNow?: boolean;
  photoUrl?: string;
  location?: { lat: number; lng: number };
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 5 requests per minute.' },
        { status: 429 }
      );
    }

    const { placeIds } = await req.json();

    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      return NextResponse.json(
        { error: 'placeIds array required' },
        { status: 400 }
      );
    }

    if (placeIds.length > MAX_PLACE_IDS) {
      return NextResponse.json(
        { error: `Max ${MAX_PLACE_IDS} place IDs per request` },
        { status: 400 }
      );
    }

    // Validate placeIds format
    const validPlaceIds = placeIds.filter(
      (id: unknown) => typeof id === 'string' && id.length > 0 && id.length < 200
    );

    // Detect territory and use appropriate provider
    const territory = await detectUserTerritory(req);
    const provider = await getMapProvider(territory);
    console.log('[Maps] Using provider:', provider.type, 'for territory:', territory);

    const providerResults = await provider.getPlaceDetails(validPlaceIds);

    // Convert normalized results to existing PlaceDetailsResult format
    const results: Record<string, PlaceDetailsResult> = {};
    for (const [id, detail] of Object.entries(providerResults)) {
      results[id] = {
        name: detail.name,
        rating: detail.rating,
        userRatingsTotal: detail.userRatingsTotal,
        address: detail.address,
        types: detail.types,
        openNow: detail.openNow,
        photoUrl: detail.photoUrl,
        location: detail.location,
      };
    }

    return NextResponse.json({ success: true, places: results });
  } catch (error: any) {
    console.error('[Maps] place-details error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch place details' },
      { status: 500 }
    );
  }
}
