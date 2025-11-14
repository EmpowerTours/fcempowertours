import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const REQUIRED_CAST_TEXT = 'digital passport'; // Keywords that must be in the cast

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const fid = searchParams.get('fid');

    if (!fid) {
      return NextResponse.json({ error: 'FID is required' }, { status: 400 });
    }

    console.log(`🔍 Checking if FID ${fid} has posted about digital passports...`);

    // Get user's recent casts using Neynar API
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/feed/user/${fid}/casts?limit=50`,
      {
        headers: {
          'api_key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.status}`);
    }

    const data = await response.json();
    const casts = data.casts || [];

    // Check if any cast contains the required text (case-insensitive)
    const hasPostedCast = casts.some((cast: any) => {
      const text = cast.text?.toLowerCase() || '';
      return text.includes(REQUIRED_CAST_TEXT.toLowerCase());
    });

    console.log(`${hasPostedCast ? '✅' : '❌'} FID ${fid} ${hasPostedCast ? 'has' : 'has not'} posted about digital passports`);

    return NextResponse.json({
      success: true,
      hasPostedCast,
      totalCastsChecked: casts.length,
    });

  } catch (error: any) {
    console.error('❌ Error checking cast status:', error);
    return NextResponse.json({
      error: error.message || 'Failed to check cast status',
    }, { status: 500 });
  }
}
