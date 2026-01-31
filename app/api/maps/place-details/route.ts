import { NextRequest, NextResponse } from 'next/server';

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

    if (!GOOGLE_MAPS_SERVER_KEY) {
      return NextResponse.json(
        { error: 'Maps API not configured' },
        { status: 500 }
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

    // Validate placeIds format (should start with "ChI" or similar)
    const validPlaceIds = placeIds.filter(
      (id: unknown) => typeof id === 'string' && id.length > 5 && id.length < 200
    );

    const results: Record<string, PlaceDetailsResult> = {};

    // Fetch details for each place using Google Places API (New) server-side
    await Promise.all(
      validPlaceIds.map(async (placeId: string) => {
        try {
          const fields = 'displayName,rating,userRatingCount,formattedAddress,types,currentOpeningHours,photos,location';
          const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&key=${GOOGLE_MAPS_SERVER_KEY}`;

          const response = await fetch(url, {
            headers: {
              'X-Goog-FieldMask': fields,
            },
          });

          if (!response.ok) {
            console.log(`[Maps] Place details failed for ${placeId}: ${response.status}`);
            results[placeId] = { name: placeId };
            return;
          }

          const data = await response.json();

          let photoUrl: string | undefined;
          if (data.photos?.[0]?.name) {
            photoUrl = `https://places.googleapis.com/v1/${data.photos[0].name}/media?maxWidthPx=400&key=${GOOGLE_MAPS_SERVER_KEY}`;
          }

          results[placeId] = {
            name: data.displayName?.text || placeId,
            rating: data.rating,
            userRatingsTotal: data.userRatingCount,
            address: data.formattedAddress,
            types: data.types,
            openNow: data.currentOpeningHours?.openNow,
            photoUrl,
            location: data.location
              ? { lat: data.location.latitude, lng: data.location.longitude }
              : undefined,
          };
        } catch (err) {
          console.error(`[Maps] Error fetching place ${placeId}:`, err);
          results[placeId] = { name: placeId };
        }
      })
    );

    return NextResponse.json({ success: true, places: results });
  } catch (error: any) {
    console.error('[Maps] place-details error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch place details' },
      { status: 500 }
    );
  }
}
