import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const REQUIRED_CAST_TEXT = 'empowertours'; // Keywords that must be in the cast
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const fid = searchParams.get('fid');

    if (!fid) {
      return NextResponse.json({ error: 'FID is required' }, { status: 400 });
    }

    console.log(`🔍 Checking if FID ${fid} has posted about EmpowerTours...`);

    // Get user's recent casts using Neynar API v2
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${fid}&limit=25`,
      {
        headers: {
          'api_key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Neynar API error ${response.status}:`, errorText);
      throw new Error(`Neynar API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`📊 Received ${data.casts?.length || 0} casts from Neynar`);
    const casts = data.casts || [];

    // Check if any cast contains the required text (case-insensitive) OR the app URL
    const hasPostedCast = casts.some((cast: any) => {
      const text = cast.text?.toLowerCase() || '';
      const embedsText = (cast.embeds || []).map((e: any) => e.url?.toLowerCase() || '').join(' ');

      const matchesKeyword = text.includes(REQUIRED_CAST_TEXT.toLowerCase());
      const matchesUrl = embedsText.includes(APP_URL.toLowerCase());
      const matchesPassport = text.includes('digital passport');

      if (matchesKeyword || matchesUrl || matchesPassport) {
        console.log(`✅ Found matching cast:`, {
          text: cast.text?.substring(0, 100),
          embeds: cast.embeds?.map((e: any) => e.url),
          matchesKeyword,
          matchesUrl,
          matchesPassport
        });
      }

      return matchesKeyword || matchesUrl || matchesPassport;
    });

    console.log(`${hasPostedCast ? '✅' : '❌'} FID ${fid} ${hasPostedCast ? 'has' : 'has not'} posted about EmpowerTours`);

    if (!hasPostedCast && casts.length > 0) {
      console.log(`📝 Sample casts checked:`, casts.slice(0, 3).map((c: any) => ({
        text: c.text?.substring(0, 80),
        embeds: c.embeds?.map((e: any) => e.url)
      })));
    }

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
