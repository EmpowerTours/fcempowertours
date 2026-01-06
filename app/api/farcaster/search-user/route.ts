import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

/**
 * Search for a Farcaster user by username
 * GET /api/farcaster/search-user?username=vitalik
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({
        success: false,
        error: 'Username is required'
      }, { status: 400 });
    }

    // Clean up username (remove @ if present)
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();

    console.log('[SearchUser] Searching for:', cleanUsername);

    // Search for user by username using Neynar API
    const searchResponse = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(cleanUsername)}`,
      {
        headers: {
          'api_key': NEYNAR_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    if (!searchResponse.ok) {
      // Try search endpoint as fallback (per Neynar API spec: GET /v2/farcaster/user/search/)
      const fallbackResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(cleanUsername)}&limit=5`,
        {
          headers: {
            'api_key': NEYNAR_API_KEY,
            'Accept': 'application/json'
          }
        }
      );

      if (!fallbackResponse.ok) {
        console.log('[SearchUser] User not found:', cleanUsername);
        return NextResponse.json({
          success: false,
          error: 'User not found'
        });
      }

      const fallbackData = await fallbackResponse.json();
      // Per API spec: response.result.users is the array
      const users = fallbackData.result?.users || [];

      if (users.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'User not found'
        });
      }

      // Find best match - exact username match first, then first result
      const exactMatch = users.find((u: any) => u.username.toLowerCase() === cleanUsername);
      const user = exactMatch || users[0];
      console.log('[SearchUser] Found via search:', user.username, 'FID:', user.fid);

      // Per API spec: verified_addresses.eth_addresses contains verified Ethereum addresses
      return NextResponse.json({
        success: true,
        user: {
          fid: user.fid,
          username: user.username,
          displayName: user.display_name,
          pfpUrl: user.pfp_url,
          walletAddress: user.verified_addresses?.eth_addresses?.[0] || user.custody_address || null,
          followerCount: user.follower_count,
          followingCount: user.following_count,
          bio: user.profile?.bio?.text || '',
        }
      });
    }

    const data = await searchResponse.json();
    const user = data.user;

    if (!user) {
      console.log('[SearchUser] User not found in response:', cleanUsername);
      return NextResponse.json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('[SearchUser] Found:', user.username, 'FID:', user.fid);

    // Get wallet address from verifications
    const walletAddress = user.verified_addresses?.eth_addresses?.[0] ||
                         user.verifications?.[0] ||
                         user.custody_address ||
                         null;

    return NextResponse.json({
      success: true,
      user: {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        walletAddress,
        followerCount: user.follower_count,
        followingCount: user.following_count,
        bio: user.profile?.bio?.text || '',
      }
    });

  } catch (error: any) {
    console.error('[SearchUser] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to search user'
    }, { status: 500 });
  }
}
