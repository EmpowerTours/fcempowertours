import { NextRequest, NextResponse } from 'next/server';
import { getAllSponsorships, getTotalSponsorships } from '@/lib/event-sponsorship';

/**
 * GET /api/sponsorship/open
 *
 * Get open sponsorships:
 * - Offers waiting for hosts (AwaitingHost)
 * - Requests waiting for sponsors (AwaitingSponsor)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'offers' | 'requests' | null (both)

    const total = await getTotalSponsorships();
    const all = await getAllSponsorships(total, 0);

    let offers = all.filter(s => s.status === 'AwaitingHost');
    let requests = all.filter(s => s.status === 'AwaitingSponsor');

    if (type === 'offers') {
      return NextResponse.json({
        success: true,
        type: 'offers',
        count: offers.length,
        sponsorships: offers,
      });
    }

    if (type === 'requests') {
      return NextResponse.json({
        success: true,
        type: 'requests',
        count: requests.length,
        sponsorships: requests,
      });
    }

    return NextResponse.json({
      success: true,
      offers: {
        count: offers.length,
        sponsorships: offers,
      },
      requests: {
        count: requests.length,
        sponsorships: requests,
      },
    });
  } catch (error: any) {
    console.error('[SponsorshipOpen] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
