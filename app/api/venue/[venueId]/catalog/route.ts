import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { verifyApiKey, fetchClearedCatalog } from '@/lib/venue';

/**
 * GET /api/venue/[venueId]/catalog — Browse rights-cleared songs
 *
 * Only returns songs with explicit rights clearance (status = 'cleared').
 * Legacy NFTs without rights records are excluded.
 *
 * Query params:
 *   ?page=1&limit=50 — pagination
 *   ?genre=hip-hop   — genre filter (future)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;

    // Auth check
    const apiKey = req.headers.get('x-venue-key') || new URL(req.url).searchParams.get('key');
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API key required' }, { status: 401 });
    }

    const valid = await verifyApiKey(redis, venueId, apiKey);
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 });
    }

    // Parse pagination
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const genre = url.searchParams.get('genre');

    // Fetch all cleared songs
    const allSongs = await fetchClearedCatalog(redis);

    // Apply genre filter if provided (future: genre metadata from Envio)
    let filtered = allSongs;
    if (genre) {
      // Genre filtering would require genre metadata in Envio
      // For now, return all songs with a note
      console.log(`[VenueCatalog] Genre filter requested: ${genre} (not yet implemented)`);
    }

    // Paginate
    const total = filtered.length;
    const start = (page - 1) * limit;
    const songs = filtered.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      songs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + limit < total,
      },
    });
  } catch (error: any) {
    console.error('[VenueCatalog] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
