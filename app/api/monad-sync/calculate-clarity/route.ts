import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const { fid, baseClarity, walletAddress } = await req.json();

    if (!fid || baseClarity === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing fid or baseClarity' },
        { status: 400 }
      );
    }

    console.log('🧮 Calculating clarity for FID:', fid, 'Base:', baseClarity);

    // Fetch user data from Neynar
    let onchainScore = 0;

    try {
      const userResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
        {
          headers: {
            'api_key': NEYNAR_API_KEY,
          }
        }
      );

      if (userResponse.ok) {
        const userData = await userResponse.json();
        const user = userData.users?.[0];

        if (user) {
          const followerCount = user.follower_count || 1;
          const followingCount = user.following_count || 0;
          const powerBadge = user.power_badge || false;

          // Get recent casts to calculate metrics
          const castsResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/feed/user/${fid}/casts?limit=25`,
            {
              headers: {
                'api_key': NEYNAR_API_KEY,
              }
            }
          );

          let avgLikes = 0;
          let threadRatio = 0;

          if (castsResponse.ok) {
            const castsData = await castsResponse.json();
            const casts = castsData.casts || [];

            if (casts.length > 0) {
              const totalLikes = casts.reduce((sum: number, cast: any) =>
                sum + (cast.reactions?.likes_count || 0), 0
              );
              avgLikes = totalLikes / casts.length;

              const threadCasts = casts.filter((cast: any) =>
                cast.text && cast.text.length > 200
              );
              threadRatio = threadCasts.length / casts.length;
            }
          }

          // Calculate onchain multipliers (from spec)
          const followerRatio = followingCount / Math.max(followerCount, 1);
          const mutualHighClarityBonus = Math.min(40, followerRatio * 40);

          const threadBonus = threadRatio > 0.3 ? 25 : threadRatio > 0.1 ? 10 : 0;
          const likeBonus = avgLikes > 500 ? 20 : avgLikes > 100 ? 10 : 0;
          const powerBadgeBonus = powerBadge ? 30 : 0;

          onchainScore = mutualHighClarityBonus + threadBonus + likeBonus + powerBadgeBonus;

          console.log('📊 Onchain metrics:', {
            followerCount,
            followingCount,
            avgLikes,
            threadRatio,
            powerBadge,
            onchainScore
          });
        }
      }
    } catch (neynarError) {
      console.warn('⚠️ Neynar fetch failed, using base clarity only:', neynarError);
    }

    // Calculate final clarity score (from spec)
    const finalClarity = Math.min(99.9, (baseClarity + onchainScore) / 2);

    // Determine tier
    let tier = 'Bare Monad';
    if (finalClarity >= 98.5) tier = 'Dominant Monad';
    else if (finalClarity >= 85) tier = 'Rational Monad';
    else if (finalClarity >= 40) tier = 'Sensitive Monad';

    console.log('✅ Final clarity:', finalClarity.toFixed(1), '| Tier:', tier);

    // Save to database
    try {
      await fetch(`${process.env.NEXT_PUBLIC_URL}/api/monad-sync/save-user-monad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid,
          walletAddress,
          clarityScore: finalClarity,
          tier,
          baseClarity,
          onchainScore
        })
      });
    } catch (dbError) {
      console.warn('⚠️ Failed to save to DB:', dbError);
    }

    return NextResponse.json({
      success: true,
      clarityScore: finalClarity,
      tier,
      baseClarity,
      onchainScore
    });

  } catch (error: any) {
    console.error('❌ Clarity calculation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Calculation failed' },
      { status: 500 }
    );
  }
}
