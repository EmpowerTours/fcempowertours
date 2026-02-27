import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getVenue, verifyApiKey } from '@/lib/venue';

/**
 * GET /api/venue/[venueId]/embed?key=X&size=small|medium|large
 *
 * Returns the HTML embed snippet for venues to copy-paste onto their website.
 * Also serves as CORS-enabled endpoint for the embed iframe.
 */

const SIZES: Record<string, { width: number; height: number }> = {
  small: { width: 300, height: 80 },
  medium: { width: 400, height: 300 },
  large: { width: 500, height: 480 },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('key') || '';
  const size = searchParams.get('size') || 'medium';
  const format = searchParams.get('format') || 'html'; // 'html' or 'json'

  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key required' }, { status: 401 });
  }

  const valid = await verifyApiKey(redis, venueId, apiKey);
  if (!valid) {
    return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 403 });
  }

  const venue = await getVenue(redis, venueId);
  if (!venue) {
    return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
  }

  const dim = SIZES[size] || SIZES.medium;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`;
  const embedUrl = `${baseUrl}/venue/${venueId}/embed?key=${apiKey}&size=${size}`;

  const iframeCode = `<iframe src="${embedUrl}" width="${dim.width}" height="${dim.height}" frameborder="0" allow="autoplay" style="border-radius:8px;border:none;"></iframe>`;

  if (format === 'json') {
    return NextResponse.json({
      success: true,
      venue: { name: venue.name, venueId },
      embed: {
        url: embedUrl,
        iframe: iframeCode,
        sizes: SIZES,
      },
    }, {
      headers: corsHeaders(),
    });
  }

  // Return the iframe code as plain text
  return new NextResponse(iframeCode, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Frame-Options': 'ALLOWALL',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}
