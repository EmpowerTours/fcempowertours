import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import { Redis } from "@upstash/redis";

/**
 * Streaming Stats API
 *
 * Sources:
 * 1. Licences and song metadata — read from the contracts. Licence ids come from a monotonic
 *    counter offset by 1,000,000, so "most recent" is the top of that range.
 * 2. Radio plays — the Redis ledger written by the live-radio route, trimmed to the last 100.
 *    Plays are not contract state, and the events that carried them are unreachable with
 *    eth_getLogs capped at 100 blocks on the public RPC and 10 on the current key.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

import { PLAY_HISTORY_KEY, PLAY_HISTORY_CAP } from "@/lib/play-ledger";
import { getTreasuryFeeBps } from "@/lib/artist-cut";

interface StreamingStats {
  /**
   * Plays a human actually listened to, attributed to a listener address.
   *
   * **This is deliberately NOT the radio's song counter.** That counter advances every time
   * the scheduler starts a track, whether or not a single person is connected, so it measures
   * broadcast uptime. On 2026-09-08 it stood at 35,493 against 28 plays recorded on-chain by
   * PlayOracle — a 1,268x overstatement being shown to artists as their play count.
   *
   * A play here means: a listener address was credited for a song in `listener-stats`. That is
   * the same event the reward maths pays for, so the number the app displays and the number it
   * pays on cannot drift apart.
   */
  totalPlays: number;
  /**
   * Songs the radio has broadcast. Uptime, not engagement — report it as such, never as plays.
   */
  totalSongsBroadcast: number;
  /**
   * True when `totalPlays` is a FLOOR: it came from the trimmed play ledger rather than the
   * uncapped counter, and the ledger is full. Render "100+", never "100".
   */
  totalPlaysIsFloor: boolean;
  /** The ledger's cap, so a caller need not hard-code it to explain the floor. */
  playWindowCap: number;
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
  topSongs: {
    tokenId: string;
    name: string;
    salesCount: number;
    artist: string;
    totalRevenue: string;
  }[];
  topArtists: {
    address: string;
    totalSales: string;
    songCount: number;
    licensesSold: number;
  }[];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "15");

    const stats: StreamingStats = {
      totalPlays: 0,
      totalSongsBroadcast: 0,
      totalPlaysIsFloor: false,
      playWindowCap: PLAY_HISTORY_CAP,
      totalSalesWMON: "0",
      uniqueListeners: 0,
      uniqueArtists: 0,
      recentPlays: [],
      recentSales: [],
      topSongs: [],
      topArtists: [],
    };

    // Sales and catalogue from the contracts; plays from Redis, as before.
    //
    // Licence ids come from a monotonic counter offset by 1,000,000, so "the 50 most recent" is
    // the top of that range rather than a query. Each is joined to its master here so the song
    // name and artist on a sale are the same ones the catalogue shows — the indexer resolved
    // that with a `masterToken` sub-selection, and doing it in one place keeps the two from
    // drifting apart.
    //
    // txHash is gone: contract reads cannot know the minting transaction, and eth_getLogs is
    // capped at 100 blocks on the public RPC and 10 on the current key.
    try {
      const { getRecentLicenses } = await import("@/lib/user-holdings");
      const { getResolvedCatalogue } = await import("@/lib/catalogue-resolved");
      const { activeChain } = await import("@/app/chains");
      const { createPublicClient, http } = await import("viem");

      const client = createPublicClient({
        chain: activeChain,
        transport: http(),
      }) as any;

      const [recentLicences, catalogue] = await Promise.all([
        getRecentLicenses(client, undefined, 50).catch(() => []),
        getResolvedCatalogue({ client, limit: 1000 }).catch(() => null),
      ]);

      const byTokenId = new Map(
        (catalogue?.tracks ?? []).map((t) => [t.tokenId, t]),
      );

      const salesData = {
        data: {
          MusicLicense: recentLicences.map((l) => {
            const master = byTokenId.get(l.masterTokenId);
            return {
              id: l.licenseId,
              licenseId: l.licenseId,
              masterTokenId: l.masterTokenId,
              licensee: l.licensee ?? "",
              createdAt: String(l.mintedAt),
              txHash: "",
              masterToken: master
                ? {
                    name: master.name,
                    artist: master.artist,
                    price: master.price,
                  }
                : undefined,
            };
          }),
          MusicNFT: (catalogue?.tracks ?? []).map((t) => ({
            tokenId: t.tokenId,
            name: t.name,
            artist: t.artist,
            price: t.price,
            totalSold: 0,
          })),
        },
      };

      console.log("[StreamingStats] chain reads:", {
        licences: salesData.data.MusicLicense.length,
        tracks: salesData.data.MusicNFT.length,
      });

      if (salesData.data) {
        const licenses = salesData.data.MusicLicense || [];
        const _nfts = salesData.data.MusicNFT || [];

        // Calculate total sales and artist stats
        let totalSales = BigInt(0);
        const artistStats = new Map<
          string,
          { sales: bigint; songs: Set<string>; licenses: number }
        >();
        const songStats = new Map<
          string,
          { name: string; artist: string; salesCount: number; revenue: bigint }
        >();

        // The artist's share is the price less SalesController's treasury fee.
        // Read once: this loop is synchronous and the fee cannot change inside
        // a request.
        const treasuryFeeBps = await getTreasuryFeeBps();

        // Process licenses (sales)
        licenses.forEach((license: any) => {
          const price = BigInt(license.masterToken?.price || "0");
          const artistAddress =
            license.masterToken?.artist?.toLowerCase() || "";
          const tokenId = license.masterTokenId;
          const songName = license.masterToken?.name || `Song #${tokenId}`;

          // Was hardcoded at 70% while the deployed fee pays the artist 90%.
          const artistPayment = price - (price * treasuryFeeBps) / 10_000n;
          totalSales += artistPayment;

          // Track artist stats
          if (artistAddress) {
            if (!artistStats.has(artistAddress)) {
              artistStats.set(artistAddress, {
                sales: BigInt(0),
                songs: new Set(),
                licenses: 0,
              });
            }
            const stat = artistStats.get(artistAddress)!;
            stat.sales += artistPayment;
            stat.songs.add(tokenId);
            stat.licenses++;
          }

          // Track song stats
          if (!songStats.has(tokenId)) {
            songStats.set(tokenId, {
              name: songName,
              artist: artistAddress,
              salesCount: 0,
              revenue: BigInt(0),
            });
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
          price: license.masterToken?.price || "0",
          priceFormatted: formatEther(
            BigInt(license.masterToken?.price || "0"),
          ),
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
      console.error("[StreamingStats] Error fetching sales data:", error);
    }

    // Fetch radio play data from Redis (live-radio tracks plays and listeners)
    try {
      const LISTENER_STATS_KEY = "live-radio:listener-stats";
      const RADIO_STATE_KEY = "live-radio:state";

      // Get play history from Redis
      const playHistory = await redis.lrange(PLAY_HISTORY_KEY, 0, limit - 1);
      const plays = playHistory.map((item: any) => {
        const entry = typeof item === "string" ? JSON.parse(item) : item;
        return {
          user: entry.queuedBy || "",
          masterTokenId: entry.tokenId || "",
          duration: 0,
          timestamp: Math.floor((entry.playedAt || 0) / 1000),
          txHash: `radio-${entry.tokenId}-${entry.playedAt}`,
          songName: entry.name,
          artistAddress: entry.artist,
        };
      });

      stats.recentPlays = plays;

      // Get total plays from radio state
      const radioState = await redis.get<{ totalSongsPlayed?: number }>(
        RADIO_STATE_KEY,
      );
      // Broadcast uptime. Reported on its own field so it can never be mistaken for engagement.
      stats.totalSongsBroadcast = radioState?.totalSongsPlayed || 0;

      // ---- Plays, counted from listeners rather than from the scheduler.
      //
      // Summing `totalSongsListened` across listener-stats counts exactly the events the reward
      // maths pays for (see lib/listener-points.ts), so the displayed number and the paid number
      // are the same number. The scheduler's counter is NOT consulted here: it advances on an
      // empty room, which is how 35,493 came to be displayed against 28 real plays on-chain.
      const allListenerStats =
        await redis.hgetall<Record<string, { totalSongsListened?: number }>>(
          LISTENER_STATS_KEY,
        );
      let listenedTotal = 0;
      if (allListenerStats) {
        stats.uniqueListeners = Object.keys(allListenerStats).length;
        for (const entry of Object.values(allListenerStats)) {
          const n = Number(entry?.totalSongsListened);
          if (Number.isFinite(n) && n > 0) listenedTotal += n;
        }
      }
      stats.totalPlays = listenedTotal;

      // A per-listener running total is never trimmed, so this is a true count and not a floor.
      // The field stays for callers that render "100+"; the ledger cap still describes the
      // recentPlays window below.
      stats.totalPlaysIsFloor = false;
      stats.playWindowCap = PLAY_HISTORY_CAP;
    } catch (redisError) {
      console.error("[StreamingStats] Redis play data error:", redisError);
    }

    return NextResponse.json({
      success: true,
      stats,
      sources: {
        sales: "chain (LicenseRegistry)",
        plays: "redis (live-radio)",
      },
    });
  } catch (error: any) {
    console.error("[StreamingStats] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch streaming stats",
      },
      { status: 500 },
    );
  }
}
