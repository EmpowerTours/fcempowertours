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

    // Check following relationship using v1 linksByFid API
    let isFollowing = false;
    let pageToken: string | null = null;
    let attempts = 0;
    const maxAttempts = 10; // Limit to prevent infinite loops

    console.log(`🔎 Searching through follow links for FID ${fid}...`);

    while (attempts < maxAttempts && !isFollowing) {
      const linksUrl = pageToken
        ? `https://api.neynar.com/v1/farcaster/linksByFid?fid=${fid}&link_type=follow&pageSize=100&pageToken=${encodeURIComponent(pageToken)}`
        : `https://api.neynar.com/v1/farcaster/linksByFid?fid=${fid}&link_type=follow&pageSize=100`;

      const linksResponse = await fetch(linksUrl, {
        headers: {
          'api_key': NEYNAR_API_KEY,
        },
      });

      if (!linksResponse.ok) {
        const errorText = await linksResponse.text();
        console.error(`❌ Neynar v1 links API error (${linksResponse.status}):`, errorText);
        throw new Error(`Neynar links API error: ${linksResponse.status}`);
      }

      const linksData = await linksResponse.json();
      const messages = linksData.messages || [];

      console.log(`📦 Fetched ${messages.length} link messages (attempt ${attempts + 1})`);

      // Check if @unify34 is in this batch
      // Link messages have data.linkBody.targetFid
      isFollowing = messages.some((msg: any) => {
        const targetFid = msg.data?.linkBody?.targetFid?.toString();
        if (targetFid) {
          console.log(`  🔗 Found link to FID: ${targetFid}`);
        }
        return targetFid === unify34Fid;
      });

      if (isFollowing) {
        console.log(`✅ Found follow link to @${UNIFY34_USERNAME} (FID: ${unify34Fid})`);
        break;
      }

      // Check if there's more data to fetch
      pageToken = linksData.nextPageToken;
      if (!pageToken || pageToken === '') {
        console.log(`📄 No more pages to fetch`);
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
