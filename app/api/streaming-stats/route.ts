import { NextRequest, NextResponse } from 'next/server';

/**
 * Streaming Stats API
 *
 * GET /api/streaming-stats
 * - Returns recent plays, artist payments, and aggregated stats
 * - Queries Envio indexer for PlayRecord, RoyaltyPayment, and ArtistPayout entities
 */

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/157f9ed/v1/graphql';

interface StreamingStats {
  totalPlays: number;
  totalPaymentsWMON: string;
  uniqueListeners: number;
  uniqueArtistsPaid: number;
  recentPlays: {
    id: string;
    user: string;
    masterTokenId: string;
    duration: string;
    playedAt: string;
    txHash: string;
    songName?: string;
    artistAddress?: string;
  }[];
  recentPayments: {
    id: string;
    masterTokenId: string;
    artist: string;
    amount: string;
    amountFormatted: string;
    paidAt: string;
    txHash: string;
    songName?: string;
    type: 'royalty' | 'payout';
  }[];
  topSongs: { tokenId: string; name: string; plays: number; artist: string; royalties: string }[];
  topArtists: { address: string; totalEarnings: string; totalPlays: number }[];
  artistPayouts: {
    monthId: string;
    artist: string;
    amount: string;
    amountFormatted: string;
    playCount: string;
    paidAt: string;
  }[];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const artist = searchParams.get('artist');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build filter for artist if provided
    const artistFilter = artist ? `, artist: {_eq: "${artist.toLowerCase()}"}` : '';
    const userFilter = artist ? `, user: {_eq: "${artist.toLowerCase()}"}` : '';

    const query = `
      query GetStreamingStats($limit: Int!) {
        # Recent plays
        PlayRecord(limit: $limit, order_by: {playedAt: desc}${userFilter ? `, where: {${userFilter.slice(2)}}` : ''}) {
          id
          user
          masterTokenId
          duration
          playedAt
          txHash
          masterToken {
            name
            artist
          }
        }

        # Recent royalty payments
        RoyaltyPayment(limit: $limit, order_by: {paidAt: desc}${artistFilter ? `, where: {${artistFilter.slice(2)}}` : ''}) {
          id
          masterTokenId
          artist
          amount
          amountFormatted
          paidAt
          txHash
          masterToken {
            name
          }
        }

        # Artist payouts (monthly)
        ArtistPayout(limit: 10, order_by: {paidAt: desc}${artistFilter ? `, where: {${artistFilter.slice(2)}}` : ''}) {
          id
          monthId
          artist
          amount
          amountFormatted
          playCount
          paidAt
          txHash
        }

        # Song streaming stats (top songs)
        SongStreamingStats(limit: 10, order_by: {totalPlays: desc}) {
          id
          masterTokenId
          totalPlays
          totalDuration
          totalRoyaltiesEarned
          lastPlayedAt
          masterToken {
            name
            artist
          }
        }

        # Artist streaming stats (top artists)
        ArtistStreamingStats(limit: 10, order_by: {totalEarningsWMON: desc}) {
          id
          artist
          totalPlays
          totalSongs
          totalEarningsWMON
          totalEarningsTOURS
          lastPayoutAt
        }

        # Aggregates
        PlayRecord_aggregate {
          aggregate {
            count
          }
        }

        RoyaltyPayment_aggregate {
          aggregate {
            count
          }
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { limit } }),
    });

    if (!response.ok) {
      throw new Error(`Envio API returned ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error('[StreamingStats] GraphQL errors:', result.errors);
      throw new Error(result.errors[0]?.message || 'Query failed');
    }

    const data = result.data || {};

    // Process recent plays
    const recentPlays = (data.PlayRecord || []).map((play: any) => ({
      id: play.id,
      user: play.user,
      masterTokenId: play.masterTokenId,
      duration: play.duration,
      playedAt: play.playedAt,
      txHash: play.txHash,
      songName: play.masterToken?.name,
      artistAddress: play.masterToken?.artist,
    }));

    // Process recent payments (royalties)
    const recentPayments = (data.RoyaltyPayment || []).map((payment: any) => ({
      id: payment.id,
      masterTokenId: payment.masterTokenId,
      artist: payment.artist,
      amount: payment.amount,
      amountFormatted: payment.amountFormatted,
      paidAt: payment.paidAt,
      txHash: payment.txHash,
      songName: payment.masterToken?.name,
      type: 'royalty' as const,
    }));

    // Process artist payouts
    const artistPayouts = (data.ArtistPayout || []).map((payout: any) => ({
      monthId: payout.monthId,
      artist: payout.artist,
      amount: payout.amount,
      amountFormatted: payout.amountFormatted,
      playCount: payout.playCount,
      paidAt: payout.paidAt,
    }));

    // Process top songs
    const topSongs = (data.SongStreamingStats || []).map((song: any) => ({
      tokenId: song.masterTokenId,
      name: song.masterToken?.name || `Song #${song.masterTokenId}`,
      plays: song.totalPlays,
      artist: song.masterToken?.artist || 'Unknown',
      royalties: song.totalRoyaltiesEarned ? (Number(song.totalRoyaltiesEarned) / 1e18).toFixed(4) : '0',
    }));

    // Process top artists
    const topArtists = (data.ArtistStreamingStats || []).map((artist: any) => ({
      address: artist.artist,
      totalEarnings: artist.totalEarningsWMON ? (Number(artist.totalEarningsWMON) / 1e18).toFixed(4) : '0',
      totalPlays: artist.totalPlays,
    }));

    // Calculate totals
    const totalPlays = data.PlayRecord_aggregate?.aggregate?.count || 0;
    const uniqueListeners = new Set(recentPlays.map((p: any) => p.user)).size;
    const uniqueArtistsPaid = new Set(recentPayments.map((p: any) => p.artist)).size;

    // Calculate total payments
    let totalPayments = BigInt(0);
    (data.RoyaltyPayment || []).forEach((p: any) => {
      if (p.amount) totalPayments += BigInt(p.amount);
    });
    (data.ArtistPayout || []).forEach((p: any) => {
      if (p.amount) totalPayments += BigInt(p.amount);
    });

    const stats: StreamingStats = {
      totalPlays,
      totalPaymentsWMON: (Number(totalPayments) / 1e18).toFixed(4),
      uniqueListeners,
      uniqueArtistsPaid,
      recentPlays,
      recentPayments,
      topSongs,
      topArtists,
      artistPayouts,
    };

    return NextResponse.json({
      success: true,
      stats,
      dataSource: 'envio',
    });

  } catch (error: any) {
    console.error('[StreamingStats] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch streaming stats' },
      { status: 500 }
    );
  }
}
