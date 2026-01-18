import { NextRequest, NextResponse } from 'next/server';
import { readSponsorship, checkIsCheckedIn, checkHasVoted } from '@/lib/event-sponsorship';
import { Address } from 'viem';

/**
 * GET /api/sponsorship/[id]
 *
 * Get sponsorship details by ID.
 * Optional query param: user (address) - includes check-in/vote status for user
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sponsorshipId = parseInt(id);

    if (isNaN(sponsorshipId) || sponsorshipId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid sponsorship ID' },
        { status: 400 }
      );
    }

    const sponsorship = await readSponsorship(sponsorshipId);

    if (!sponsorship) {
      return NextResponse.json(
        { success: false, error: 'Sponsorship not found' },
        { status: 404 }
      );
    }

    // Check user status if address provided
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('user') as Address | null;
    let userStatus = null;

    if (userAddress) {
      const [isCheckedIn, hasVoted] = await Promise.all([
        checkIsCheckedIn(sponsorshipId, userAddress),
        checkHasVoted(sponsorshipId, userAddress),
      ]);
      userStatus = { isCheckedIn, hasVoted };
    }

    return NextResponse.json({
      success: true,
      sponsorship,
      userStatus,
    });
  } catch (error: any) {
    console.error('[SponsorshipGet] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
