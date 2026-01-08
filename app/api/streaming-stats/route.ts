import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, formatEther, Address } from 'viem';
import { monadTestnet } from '@/app/chains';

/**
 * Streaming Stats API
 *
 * Uses existing data sources:
 * 1. MusicLicense from Envio (purchases = artist payments)
 * 2. PlayRecorded events from PlayOracle contract (on-chain)
 * 3. MusicNFT data for song metadata
 */

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/157f9ed/v1/graphql';
const PLAY_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_PLAY_ORACLE as Address;
const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_ADDRESS as Address;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// PlayRecorded event from PlayOracle
const PlayRecordedEvent = parseAbiItem('event PlayRecorded(address indexed user, uint256 indexed masterTokenId, uint256 duration, uint256 timestamp)');

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

    // 1. Fetch recent plays from PlayOracle contract (on-chain)
    if (PLAY_ORACLE_ADDRESS) {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const BLOCK_RANGE = BigInt(5000); // RPC limits block range, use smaller chunks
        const MAX_BLOCKS_BACK = BigInt(50000); // ~1 day of blocks
        const startBlock = currentBlock > MAX_BLOCKS_BACK ? currentBlock - MAX_BLOCKS_BACK : 0n;

        // Paginate through blocks in chunks to avoid RPC limits
        const playLogs: any[] = [];
        for (let from = startBlock; from < currentBlock; from += BLOCK_RANGE) {
          const to = from + BLOCK_RANGE > currentBlock ? currentBlock : from + BLOCK_RANGE;
          try {
            const logs = await publicClient.getLogs({
              address: PLAY_ORACLE_ADDRESS,
              event: PlayRecordedEvent,
              fromBlock: from,
              toBlock: to,
            });
            playLogs.push(...logs);
          } catch (e) {
            console.error(`[StreamingStats] Error fetching blocks ${from}-${to}:`, e);
          }
        }

        console.log(`[StreamingStats] Found ${playLogs.length} play events on-chain`);

        const uniqueListeners = new Set<string>();
        const songPlayCounts = new Map<string, number>();

        // Collect token IDs for metadata fetch
        const tokenIds = [...new Set(playLogs.map(log => log.args.masterTokenId?.toString() || ''))];

        // Fetch metadata from Envio
        const metadataMap = new Map<string, { name: string; artist: string }>();
        if (tokenIds.length > 0) {
          try {
            const metaQuery = `
              query GetMetadata($tokenIds: [String!]!) {
                MusicNFT(where: {tokenId: {_in: $tokenIds}}) {
                  tokenId
                  name
                  artist
                }
              }
            `;
            const metaResponse = await fetch(ENVIO_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: metaQuery, variables: { tokenIds } }),
            });
            const metaData = await metaResponse.json();
            (metaData.data?.MusicNFT || []).forEach((nft: any) => {
              metadataMap.set(nft.tokenId, { name: nft.name || `Song #${nft.tokenId}`, artist: nft.artist });
            });
          } catch (e) {
            console.error('[StreamingStats] Metadata fetch error:', e);
          }
        }

        // Process play logs
        playLogs.slice(-limit * 2).reverse().forEach(log => {
          const user = log.args.user as string;
          const tokenId = log.args.masterTokenId?.toString() || '';
          const duration = Number(log.args.duration || 0);
          const timestamp = Number(log.args.timestamp || 0);
          const metadata = metadataMap.get(tokenId);

          uniqueListeners.add(user.toLowerCase());
          songPlayCounts.set(tokenId, (songPlayCounts.get(tokenId) || 0) + 1);

          if (stats.recentPlays.length < limit) {
            stats.recentPlays.push({
              user,
              masterTokenId: tokenId,
              duration,
              timestamp,
              txHash: log.transactionHash,
              songName: metadata?.name,
              artistAddress: metadata?.artist,
            });
          }
        });

        stats.totalPlays = playLogs.length;
        stats.uniqueListeners = uniqueListeners.size;

      } catch (error) {
        console.error('[StreamingStats] Error fetching play events:', error);
      }
    }

    // 2. Fetch sales data from Envio (MusicLicense = purchases = artist payments)
    try {
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

    return NextResponse.json({
      success: true,
      stats,
      sources: {
        plays: PLAY_ORACLE_ADDRESS ? 'on-chain (PlayOracle)' : 'not configured',
        sales: 'envio (MusicLicense)',
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
