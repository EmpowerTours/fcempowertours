import { NextRequest, NextResponse } from 'next/server';
import { formatEther } from 'viem';
import { Redis } from '@upstash/redis';

/**
 * Streaming Stats API
 *
 * Uses Envio indexer data:
 * 1. MusicLicense = purchases (artist payments at 70%)
 * 2. MusicNFT = song metadata
 * 3. RadioPlay = radio plays (falls back to Redis if Envio not indexed)
 */

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const PLAY_HISTORY_KEY = 'live-radio:play-history';

interface StreamingStats {
  totalPlays: number;
  totalSalesWMON: string;
  uniqueListeners: number;
  uniqueArtists: number;
  recentPlays: {
    user: string;
    masterTokenId: string;
    duration: number;
    timestamp: number;
    txHash: string;
    songName?: string;
    artistAddress?: string;
  }[];
  recentSales: {
    licenseId: string;
    masterTokenId: string;
    buyer: string;
    price: string;
    priceFormatted: string;
    createdAt: string;
    txHash: string;
    songName?: string;
    artistAddress?: string;
  }[];
  topSongs: { tokenId: string; name: string; salesCount: number; artist: string; totalRevenue: string }[];
  topArtists: { address: string; totalSales: string; songCount: number; licensesSold: number }[];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '15');

    const stats: StreamingStats = {
      totalPlays: 0,
      totalSalesWMON: '0',
      uniqueListeners: 0,
      uniqueArtists: 0,
      recentPlays: [],
      recentSales: [],
      topSongs: [],
      topArtists: [],
    };

    // Fetch all data from Envio (sales + NFTs + plays)
    try {
      // Query licenses and NFTs - RadioPlay has different schema, use Redis fallback
      const salesQuery = `
        query GetSalesData {
          MusicLicense(limit: 50, order_by: {createdAt: desc}) {
            id
            licenseId
            masterTokenId
            licensee
            createdAt
            txHash
            masterToken {
              name
              artist
              price
            }
          }
          MusicNFT(where: {isBurned: {_eq: false}}, limit: 100) {
            tokenId
            name
            artist
            price
            totalSold
          }
        }
      `;

      const salesResponse = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: salesQuery }),
      });

      const salesData = await salesResponse.json();

      // Debug: Log what Envio returns
      console.log('[StreamingStats] Envio response:', {
        hasData: !!salesData.data,
        licensesCount: salesData.data?.MusicLicense?.length || 0,
        nftsCount: salesData.data?.MusicNFT?.length || 0,
        errors: salesData.errors,
      });

      if (salesData.data) {
        const licenses = salesData.data.MusicLicense || [];
        const nfts = salesData.data.MusicNFT || [];

        // Calculate total sales and artist stats
        let totalSales = BigInt(0);
        const artistStats = new Map<string, { sales: bigint; songs: Set<string>; licenses: number }>();
        const songStats = new Map<string, { name: string; artist: string; salesCount: number; revenue: bigint }>();

        // Process licenses (sales)
        licenses.forEach((license: any) => {
          const price = BigInt(license.masterToken?.price || '0');
          const artistAddress = license.masterToken?.artist?.toLowerCase() || '';
          const tokenId = license.masterTokenId;
          const songName = license.masterToken?.name || `Song #${tokenId}`;

          // Calculate artist payment (70% of price goes to artist)
          const artistPayment = (price * BigInt(70)) / BigInt(100);
          totalSales += artistPayment;

          // Track artist stats
          if (artistAddress) {
            if (!artistStats.has(artistAddress)) {
              artistStats.set(artistAddress, { sales: BigInt(0), songs: new Set(), licenses: 0 });
            }
            const stat = artistStats.get(artistAddress)!;
            stat.sales += artistPayment;
            stat.songs.add(tokenId);
            stat.licenses++;
          }

          // Track song stats
          if (!songStats.has(tokenId)) {
            songStats.set(tokenId, { name: songName, artist: artistAddress, salesCount: 0, revenue: BigInt(0) });
          }
          const sstat = songStats.get(tokenId)!;
          sstat.salesCount++;
          sstat.revenue += artistPayment;
        });

        // Recent sales
        stats.recentSales = licenses.slice(0, limit).map((license: any) => ({
          licenseId: license.licenseId,
          masterTokenId: license.masterTokenId,
          buyer: license.licensee,
          price: license.masterToken?.price || '0',
          priceFormatted: formatEther(BigInt(license.masterToken?.price || '0')),
          createdAt: license.createdAt,
          txHash: license.txHash,
          songName: license.masterToken?.name,
          artistAddress: license.masterToken?.artist,
        }));

        stats.totalSalesWMON = formatEther(totalSales);
        stats.uniqueArtists = artistStats.size;

        // Top songs by sales
        stats.topSongs = Array.from(songStats.entries())
          .sort((a, b) => b[1].salesCount - a[1].salesCount)
          .slice(0, 10)
          .map(([tokenId, data]) => ({
            tokenId,
            name: data.name,
            salesCount: data.salesCount,
            artist: data.artist,
            totalRevenue: formatEther(data.revenue),
          }));

        // Top artists by earnings
        stats.topArtists = Array.from(artistStats.entries())
          .sort((a, b) => Number(b[1].sales - a[1].sales))
          .slice(0, 10)
          .map(([address, data]) => ({
            address,
            totalSales: formatEther(data.sales),
            songCount: data.songs.size,
            licensesSold: data.licenses,
          }));
      }
    } catch (error) {
      console.error('[StreamingStats] Error fetching sales data:', error);
    }

    // Fallback: If no plays from Envio (not indexed yet), use Redis play history
    if (stats.recentPlays.length === 0) {
      try {
        const redisPlays = await redis.lrange(PLAY_HISTORY_KEY, 0, limit - 1);
        if (redisPlays && redisPlays.length > 0) {
          stats.recentPlays = redisPlays.map((play: any) => {
            const p = typeof play === 'string' ? JSON.parse(play) : play;
            return {
              user: p.queuedBy || 'radio',
              masterTokenId: p.tokenId,
              duration: 180,
              timestamp: Math.floor(p.playedAt / 1000),
              txHash: '',
              songName: p.name,
              artistAddress: p.artist,
            };
          });
          stats.totalPlays = redisPlays.length;
          console.log('[StreamingStats] Using Redis fallback for plays:', redisPlays.length);
        }
      } catch (redisError) {
        console.error('[StreamingStats] Redis fallback error:', redisError);
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      sources: {
        data: 'envio (MusicLicense, MusicNFT)',
      },
    });

  } catch (error: any) {
    console.error('[StreamingStats] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch streaming stats' },
      { status: 500 }
    );
  }
}
