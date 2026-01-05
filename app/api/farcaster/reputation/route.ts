import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

/**
 * Farcaster Social Graph Reputation Score Calculator
 *
 * Based on the Resonance Protocol patent:
 * RS = (A × 0.2) + (S × 0.3) + (C × 0.3) + (H × 0.2) - P
 *
 * Where:
 * - A = Age score (account age in days, normalized to max 20 points)
 * - S = Follower score (normalized to max 30 points)
 * - C = Connection score (mutual follows, normalized to max 30 points)
 * - H = History score (based on activity, normalized to max 20 points)
 * - P = Penalties (not implemented yet)
 *
 * Total max score: 100 points
 * Minimum score for subscription: 10 points (configurable)
 */

interface ReputationBreakdown {
  ageScore: number;        // Max 20 - based on account age
  followerScore: number;   // Max 30 - based on follower count
  connectionScore: number; // Max 30 - based on mutual connections / following ratio
  activityScore: number;   // Max 20 - based on casts, recasts, likes
  penalties: number;       // Deductions for suspicious activity
  totalScore: number;      // Final score (0-100)
}

interface NeynarUser {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  follower_count: number;
  following_count: number;
  verifications: string[];
  active_status: string;
  profile: {
    bio: {
      text: string;
      mentioned_profiles: any[];
    };
  };
  // Timestamps
  timestamp?: string; // Account creation timestamp (if available)
}

// Scoring constants (from patent)
const MAX_AGE_SCORE = 20;
const MAX_FOLLOWER_SCORE = 30;
const MAX_CONNECTION_SCORE = 30;
const MAX_ACTIVITY_SCORE = 20;

// Thresholds
const MIN_REPUTATION_FOR_SUBSCRIPTION = 10; // Minimum score to subscribe
const DAYS_FOR_MAX_AGE = 365; // 1 year = max age score
const FOLLOWERS_FOR_MAX_SCORE = 1000; // 1000 followers = max follower score
const FOLLOWING_FOR_MAX_CONNECTION = 500; // Used with ratio calculation

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid');
    const address = searchParams.get('address');

    if (!fid && !address) {
      return NextResponse.json({
        error: 'Either fid or address is required'
      }, { status: 400 });
    }

    let userData: NeynarUser | null = null;
    let userFid = fid;

    // If we have an address but no FID, look up the FID first
    if (address && !fid) {
      const addressLookup = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
        {
          headers: { 'api_key': NEYNAR_API_KEY }
        }
      );

      if (addressLookup.ok) {
        const addressData = await addressLookup.json();
        const users = addressData[address.toLowerCase()];
        if (users && users.length > 0) {
          userFid = users[0].fid.toString();
          userData = users[0];
        }
      }
    }

    // If we have a FID, get full user data
    if (userFid && !userData) {
      const userLookup = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${userFid}`,
        {
          headers: { 'api_key': NEYNAR_API_KEY }
        }
      );

      if (userLookup.ok) {
        const data = await userLookup.json();
        if (data.users && data.users.length > 0) {
          userData = data.users[0];
        }
      }
    }

    if (!userData) {
      return NextResponse.json({
        success: false,
        error: 'User not found on Farcaster',
        reputation: {
          totalScore: 0,
          meetsMinimum: false,
          breakdown: {
            ageScore: 0,
            followerScore: 0,
            connectionScore: 0,
            activityScore: 0,
            penalties: 0,
            totalScore: 0,
          }
        }
      });
    }

    // Calculate reputation score
    const reputation = calculateReputationScore(userData);

    console.log(`[Reputation] FID ${userData.fid} (@${userData.username}): Score ${reputation.totalScore}/100`);

    return NextResponse.json({
      success: true,
      user: {
        fid: userData.fid,
        username: userData.username,
        displayName: userData.display_name,
        pfpUrl: userData.pfp_url,
        followerCount: userData.follower_count,
        followingCount: userData.following_count,
        verifications: userData.verifications || [],
        activeStatus: userData.active_status,
      },
      reputation: {
        totalScore: reputation.totalScore,
        meetsMinimum: reputation.totalScore >= MIN_REPUTATION_FOR_SUBSCRIPTION,
        minimumRequired: MIN_REPUTATION_FOR_SUBSCRIPTION,
        breakdown: reputation,
      }
    });

  } catch (error: any) {
    console.error('[Reputation] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to calculate reputation'
    }, { status: 500 });
  }
}

function calculateReputationScore(user: NeynarUser): ReputationBreakdown {
  // 1. Age Score (max 20 points)
  // Estimate account age from FID - lower FIDs are older accounts
  // FID 1-10000 = very old (2022), FID 100000+ = newer (2024+)
  // This is an approximation since Neynar doesn't always return creation date
  let ageScore = 0;
  const fid = user.fid;

  if (fid < 5000) {
    ageScore = MAX_AGE_SCORE; // Very early adopter
  } else if (fid < 20000) {
    ageScore = 18; // Early 2023
  } else if (fid < 100000) {
    ageScore = 15; // Mid 2023
  } else if (fid < 300000) {
    ageScore = 12; // Late 2023
  } else if (fid < 500000) {
    ageScore = 8; // Early 2024
  } else if (fid < 800000) {
    ageScore = 5; // Mid 2024
  } else {
    ageScore = 2; // Recent account
  }

  // 2. Follower Score (max 30 points)
  // Logarithmic scale: 10 followers = 10pts, 100 = 20pts, 1000+ = 30pts
  let followerScore = 0;
  const followers = user.follower_count || 0;

  if (followers >= FOLLOWERS_FOR_MAX_SCORE) {
    followerScore = MAX_FOLLOWER_SCORE;
  } else if (followers > 0) {
    // Log scale: log10(followers) * 10, capped at 30
    followerScore = Math.min(MAX_FOLLOWER_SCORE, Math.log10(followers + 1) * 10);
  }

  // 3. Connection Score (max 30 points)
  // Based on follower/following ratio and total connections
  // High ratio (more followers than following) indicates organic growth
  // Mutual connections approximated by min(followers, following)
  let connectionScore = 0;
  const following = user.following_count || 0;

  if (followers > 0 && following > 0) {
    // Ratio component (max 15 points) - rewards organic accounts
    const ratio = followers / following;
    const ratioScore = Math.min(15, ratio * 5);

    // Mutual connections estimate (max 15 points)
    // Assume ~30% of min(followers, following) are mutual
    const estimatedMutuals = Math.min(followers, following) * 0.3;
    const mutualScore = Math.min(15, estimatedMutuals / 10);

    connectionScore = ratioScore + mutualScore;
  } else if (followers > 0) {
    // Only followers, no following - could be influential account
    connectionScore = Math.min(15, followers / 50);
  }

  // 4. Activity Score (max 20 points)
  // Based on verifications and active status
  let activityScore = 0;

  // Verified addresses give credibility
  const verifications = user.verifications?.length || 0;
  activityScore += Math.min(10, verifications * 5); // 2 verifications = 10 points

  // Active status
  if (user.active_status === 'active') {
    activityScore += 5;
  }

  // Has bio
  if (user.profile?.bio?.text && user.profile.bio.text.length > 20) {
    activityScore += 5;
  }

  activityScore = Math.min(MAX_ACTIVITY_SCORE, activityScore);

  // 5. Penalties (deductions)
  let penalties = 0;

  // Suspicious patterns
  if (following > 5000 && followers < 100) {
    // Mass following with low followers - likely bot
    penalties += 20;
  }

  if (followers === 0 && following === 0) {
    // Brand new account with no activity
    penalties += 10;
  }

  // Calculate total
  const rawScore = ageScore + followerScore + connectionScore + activityScore;
  const totalScore = Math.max(0, Math.min(100, rawScore - penalties));

  return {
    ageScore: Math.round(ageScore * 10) / 10,
    followerScore: Math.round(followerScore * 10) / 10,
    connectionScore: Math.round(connectionScore * 10) / 10,
    activityScore: Math.round(activityScore * 10) / 10,
    penalties: Math.round(penalties * 10) / 10,
    totalScore: Math.round(totalScore * 10) / 10,
  };
}

