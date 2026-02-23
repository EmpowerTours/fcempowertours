import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, fetchGitHubUser, verifyOAuthState } from '@/lib/homework/github';
import { redis } from '@/lib/redis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      return NextResponse.redirect(new URL('/homework?error=missing_params', req.url));
    }

    // Verify OAuth state
    const wallet = verifyOAuthState(state);
    if (!wallet) {
      return NextResponse.redirect(new URL('/homework?error=invalid_state', req.url));
    }

    // Exchange code for token
    const token = await exchangeCodeForToken(code);

    // Fetch GitHub user info
    const githubUser = await fetchGitHubUser(token);

    // Store wallet <-> GitHub link in Redis
    const linkData = {
      username: githubUser.username,
      token,
      avatarUrl: githubUser.avatarUrl,
      githubId: githubUser.id,
      linkedAt: new Date().toISOString(),
    };

    await redis.set(`hw:github:${wallet.toLowerCase()}`, JSON.stringify(linkData));
    await redis.set(`hw:wallet:${githubUser.username.toLowerCase()}`, wallet.toLowerCase());

    console.log(`[Homework] GitHub linked: ${wallet} -> ${githubUser.username}`);

    return NextResponse.redirect(new URL('/homework?linked=true', req.url));
  } catch (error: any) {
    console.error('[Homework] GitHub OAuth error:', error);
    return NextResponse.redirect(new URL(`/homework?error=${encodeURIComponent(error.message || 'oauth_failed')}`, req.url));
  }
}
