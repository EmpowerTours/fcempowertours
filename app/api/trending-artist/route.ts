import { NextRequest, NextResponse } from 'next/server';

/**
 * Trending Artist API
 *
 * GET - Fetches the current trending/hottest artist based on streaming stats
 * POST - Triggers a Farcaster cast about the trending artist
 *
 * Can be called by:
 * - Cron job (Railway scheduler, external service)
 * - Manual trigger from admin
 */

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const KEEPER_SECRET = process.env.KEEPER_SECRET || '';

interface ArtistStats {
  address: string;
  fid?: number;
  username?: string;
  totalPlays: number;
  recentPlays: number; // Plays in last 24h
  songCount: number;
  totalEarnings: string;
}

// Query Envio for streaming data and calculate top artist
async function getTrendingArtist(): Promise<ArtistStats | null> {
  try {
    // Get recent play recordings from Envio
    // PlayRecorded events are indexed under PlayOracle
    const query = `
      query GetStreamingStats {
        # Get all music NFTs with their play counts
        MusicNFT(where: {isBurned: {_eq: false}}, limit: 100, order_by: {totalSold: desc}) {
          tokenId
          name
          artist
          artistFid
          totalSold
          price
        }
        # Get recent license purchases (proxy for plays/engagement)
        MusicLicense(limit: 100, order_by: {createdAt: desc}) {
          masterTokenId
          licensee
          createdAt
          masterToken {
            artist
            artistFid
            name
          }
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (!data.data) {
      console.error('[TrendingArtist] No data from Envio');
      return null;
    }

    const nfts = data.data.MusicNFT || [];
    const licenses = data.data.MusicLicense || [];

    // Calculate artist stats
    const artistStats = new Map<string, ArtistStats>();

    // Count NFTs and sales per artist
    for (const nft of nfts) {
      const artistAddress = nft.artist?.toLowerCase();
      if (!artistAddress) continue;

      if (!artistStats.has(artistAddress)) {
        artistStats.set(artistAddress, {
          address: artistAddress,
          fid: nft.artistFid,
          totalPlays: 0,
          recentPlays: 0,
          songCount: 0,
          totalEarnings: '0',
        });
      }

      const stats = artistStats.get(artistAddress)!;
      stats.songCount++;
      stats.totalPlays += nft.totalSold || 0;
    }

    // Count recent activity from licenses (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const license of licenses) {
      const artistAddress = license.masterToken?.artist?.toLowerCase();
      if (!artistAddress) continue;

      const stats = artistStats.get(artistAddress);
      if (stats && license.createdAt > oneDayAgo) {
        stats.recentPlays++;
      }
    }

    // Find the top artist by recent activity, then by total plays
    let topArtist: ArtistStats | null = null;
    let maxScore = 0;

    for (const stats of artistStats.values()) {
      // Score: recent plays weighted 3x + total plays
      const score = (stats.recentPlays * 3) + stats.totalPlays;
      if (score > maxScore) {
        maxScore = score;
        topArtist = stats;
      }
    }

    // Get username for top artist
    if (topArtist && topArtist.fid) {
      try {
        const neynarResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${topArtist.fid}`,
          { headers: { 'api_key': process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '' } }
        );
        if (neynarResponse.ok) {
          const neynarData = await neynarResponse.json();
          if (neynarData.users?.[0]) {
            topArtist.username = neynarData.users[0].username;
          }
        }
      } catch (err) {
        console.warn('[TrendingArtist] Failed to fetch username');
      }
    }

    return topArtist;
  } catch (error) {
    console.error('[TrendingArtist] Error:', error);
    return null;
  }
}

// GET - Fetch trending artist stats
export async function GET(req: NextRequest) {
  try {
    const topArtist = await getTrendingArtist();

    if (!topArtist) {
      return NextResponse.json({
        success: false,
        error: 'No trending artist found',
      });
    }

    return NextResponse.json({
      success: true,
      artist: topArtist,
    });
  } catch (error: any) {
    console.error('[TrendingArtist] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST - Cast about trending artist (requires auth)
export async function POST(req: NextRequest) {
  try {
    // Verify keeper secret for cron job auth
    const { secret } = await req.json();
    if (secret !== KEEPER_SECRET && KEEPER_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const topArtist = await getTrendingArtist();

    if (!topArtist || topArtist.totalPlays === 0) {
      return NextResponse.json({
        success: false,
        message: 'No trending artist with plays yet',
      });
    }

    // Cast about the trending artist
    const castResponse = await fetch(`${APP_URL}/api/cast-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'top_artist',
        fid: topArtist.fid || 0,
        params: {
          artistName: topArtist.username || `${topArtist.address.slice(0, 6)}...${topArtist.address.slice(-4)}`,
          artistFid: topArtist.fid,
          playCount: topArtist.totalPlays,
          songCount: topArtist.songCount,
          totalEarnings: topArtist.totalEarnings,
        },
      }),
    });

    const castData = await castResponse.json();

    return NextResponse.json({
      success: castData.success,
      artist: topArtist,
      castHash: castData.castHash,
    });
  } catch (error: any) {
    console.error('[TrendingArtist] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
