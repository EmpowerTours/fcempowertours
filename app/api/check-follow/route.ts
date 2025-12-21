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

    // ✅ IMPROVED: Use v2 bulk users API with viewer_fid to check follow relationship
    // This returns viewer_context.following which is much more efficient than paginating links
    console.log(`🔍 Checking follow relationship using viewer_fid approach...`);

    const bulkUserUrl = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${unify34Fid}&viewer_fid=${fid}`;
    const bulkResponse = await fetch(bulkUserUrl, {
      headers: {
        'api_key': NEYNAR_API_KEY,
      },
    });

    if (!bulkResponse.ok) {
      const errorText = await bulkResponse.text();
      console.error(`❌ Neynar bulk user API error (${bulkResponse.status}):`, errorText);
      throw new Error(`Neynar API error: ${bulkResponse.status}`);
    }

    const bulkData = await bulkResponse.json();
    const targetUser = bulkData.users?.[0];

    if (!targetUser) {
      throw new Error(`Could not fetch user data for @${UNIFY34_USERNAME}`);
    }

    // Check if viewer (fid) follows the target (@unify34)
    const isFollowing = targetUser.viewer_context?.following === true;

    console.log(`📊 Viewer context:`, {
      following: targetUser.viewer_context?.following,
      followed_by: targetUser.viewer_context?.followed_by,
    });

    console.log(`${isFollowing ? '✅' : '❌'} FID ${fid} ${isFollowing ? 'follows' : 'does not follow'} @${UNIFY34_USERNAME}`);

    return NextResponse.json({
      success: true,
      isFollowing,
      username: targetUser.username,
      targetFid: unify34Fid,
      viewerContext: {
        following: targetUser.viewer_context?.following || false,
        followed_by: targetUser.viewer_context?.followed_by || false,
      },
    });

  } catch (error: any) {
    console.error('❌ Error checking follow status:', error);
    return NextResponse.json({
      error: error.message || 'Failed to check follow status',
    }, { status: 500 });
  }
}
