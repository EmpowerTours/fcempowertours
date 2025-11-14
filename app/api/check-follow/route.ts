import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const UNIFY34_USERNAME = 'unify34';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const fid = searchParams.get('fid');

    if (!fid) {
      return NextResponse.json({ error: 'FID is required' }, { status: 400 });
    }

    console.log(`🔍 Checking if FID ${fid} follows @${UNIFY34_USERNAME}...`);

    // First, resolve @unify34 username to FID
    const unify34Response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${UNIFY34_USERNAME}`,
      {
        headers: {
          'api_key': NEYNAR_API_KEY,
        },
      }
    );

    if (!unify34Response.ok) {
      throw new Error(`Failed to resolve @${UNIFY34_USERNAME}: ${unify34Response.status}`);
    }

    const unify34Data = await unify34Response.json();
    const unify34Fid = unify34Data.user?.fid?.toString();

    if (!unify34Fid) {
      throw new Error(`Could not find FID for @${UNIFY34_USERNAME}`);
    }

    console.log(`📍 @${UNIFY34_USERNAME} FID: ${unify34Fid}`);

    // Check if user follows @unify34 using Neynar API
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
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
    const user = data.users?.[0];

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check following relationship - need to paginate through all following
    let isFollowing = false;
    let cursor: string | null = null;
    let attempts = 0;
    const maxAttempts = 10; // Limit to prevent infinite loops

    while (attempts < maxAttempts && !isFollowing) {
      const followingUrl: string = cursor
        ? `https://api.neynar.com/v2/farcaster/following?fid=${fid}&limit=100&cursor=${cursor}`
        : `https://api.neynar.com/v2/farcaster/following?fid=${fid}&limit=100`;

      const followingResponse = await fetch(followingUrl, {
        headers: {
          'api_key': NEYNAR_API_KEY,
        },
      });

      if (!followingResponse.ok) {
        throw new Error(`Neynar following API error: ${followingResponse.status}`);
      }

      const followingData = await followingResponse.json();
      const following = followingData.users || [];

      // Check if @unify34 is in this batch
      isFollowing = following.some((u: any) => u.fid?.toString() === unify34Fid);

      if (isFollowing) {
        break;
      }

      // Check if there's more data to fetch
      cursor = followingData.next?.cursor;
      if (!cursor) {
        break; // No more pages
      }

      attempts++;
    }

    console.log(`${isFollowing ? '✅' : '❌'} FID ${fid} ${isFollowing ? 'follows' : 'does not follow'} @${UNIFY34_USERNAME}`);

    return NextResponse.json({
      success: true,
      isFollowing,
      username: user.username,
      targetFid: unify34Fid,
    });

  } catch (error: any) {
    console.error('❌ Error checking follow status:', error);
    return NextResponse.json({
      error: error.message || 'Failed to check follow status',
    }, { status: 500 });
  }
}
