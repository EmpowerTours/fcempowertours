import { NextRequest, NextResponse } from 'next/server';
import { getAllSponsorships, readSponsorship, getTotalSponsorships, SponsorshipStatus } from '@/lib/event-sponsorship';

/**
 * GET /api/sponsorship/list
 *
 * List sponsorships with optional filters.
 * Query params:
 * - status: Filter by status (AwaitingHost, AwaitingSponsor, Active, etc.)
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 * - sponsor: Filter by sponsor address
 * - host: Filter by host address
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sponsor = searchParams.get('sponsor')?.toLowerCase();
    const host = searchParams.get('host')?.toLowerCase();

    const total = await getTotalSponsorships();

    let sponsorships = await getAllSponsorships(limit + offset, 0);

    // Apply filters
    if (status) {
      const statusCode = Object.entries(SponsorshipStatus).find(
        ([, name]) => name === status
      )?.[0];
      if (statusCode !== undefined) {
        sponsorships = sponsorships.filter(s => s.statusCode === parseInt(statusCode));
      }
    }

    if (sponsor) {
      sponsorships = sponsorships.filter(s => s.sponsor.toLowerCase() === sponsor);
    }

    if (host) {
      sponsorships = sponsorships.filter(s => s.host.toLowerCase() === host);
    }

    // Apply pagination after filters
    sponsorships = sponsorships.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      total,
      count: sponsorships.length,
      sponsorships,
    });
  } catch (error: any) {
    console.error('[SponsorshipList] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
