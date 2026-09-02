import { NextRequest, NextResponse } from "next/server";
import { getTreasuryFeeBps } from "@/lib/artist-cut";
import {
  PLAY_HISTORY_KEY,
  PLAY_HISTORY_CAP,
  toPlayWindow,
} from "@/lib/play-ledger";
import {
  createPublicClient,
  http,
  parseAbi,
  formatEther,
  type Address,
} from "viem";

const MUSIC_SUBSCRIPTION = process.env
  .NEXT_PUBLIC_MUSIC_SUBSCRIPTION as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";

interface SongBreakdown {
  tokenId: string;
  name: string;
  plays: number;
  earnings: string;
  tips: string;
}

interface TopSupporter {
  address: string;
  totalPaid: string;
  songsQueued: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "address parameter required" },
        { status: 400 },
      );
    }

    const artistLower = address.toLowerCase();

    // ── Where each figure now comes from, and what cannot be recovered ────────────────────
    //
    // Earnings were already read from the subscription contract below; the indexer only ever
    // supplied play counts, tips and licence rows. Of those three:
    //
    // - Licences are contract state, so they are read directly.
    // - Lifetime play count is one read: `artistLifetimePlays(artist)`. The first pass summed
    //   getArtistMonthlyStats over 12 months instead, which costs 24 reads and silently drops
    //   anything older than a year. The monthly loop stays only because per-month payout needs
    //   per-month numbers.
    // - Per-song play breakdown really is NOT contract state, re-checked against all three
    //   candidates: MusicSubscriptionV6 keeps dailySongPlayCount[user][day][song] (needs every
    //   user and day enumerated), LiveRadioV3 keeps only the global totalSongsPlayed, and
    //   PlayOracleV3 keeps lastPlayTime[user][song] — a timestamp, not a count. The Redis play
    //   ledger has it, capped at the last 100 plays, so the breakdown is recent, not lifetime.
    // - Tips ARE contract state, contrary to the first pass at this file. `queueSong` emits
    //   TipReceived *and* pushes a QueuedSong carrying `tipAmount` into the public `songQueue`
    //   array, which nothing ever removes from — `queueHead` is a read cursor, not a pop. So the
    //   lifetime record is readable without touching a log. See lib/radio-queue.ts.
    const unavailable: string[] = [];

    const { getResolvedCatalogue } = await import("@/lib/catalogue-resolved");
    const { activeChain: chainForReads } = await import("@/app/chains");
    const readClient = createPublicClient({
      chain: chainForReads,
      transport: http(MONAD_RPC),
    });

    const catalogue = await getResolvedCatalogue({ limit: 1000 }).catch(
      () => null,
    );
    if (!catalogue) unavailable.push("catalogue");
    const myTracks = (catalogue?.tracks ?? []).filter(
      (t) => t.artist.toLowerCase() === artistLower,
    );
    const myTokenIds = new Set(myTracks.map((t) => t.tokenId));

    // Every licence ever minted, kept only where the master is this artist's. Bounded by the
    // licence count, which is small; if that stops being true this needs a per-artist index on
    // the contract rather than a bigger walk here.
    const { getRecentLicenses } = await import("@/lib/user-holdings");
    const allLicences = await getRecentLicenses(
      readClient as any,
      undefined,
      512,
    ).catch(() => {
      unavailable.push("licences");
      return [];
    });
    const licenses = allLicences
      .filter((l) => myTokenIds.has(l.masterTokenId))
      .map((l) => ({
        licensee: l.licensee ?? "0x0000000000000000000000000000000000000000",
        masterTokenId: l.masterTokenId,
        masterToken: {
          name: myTracks.find((t) => t.tokenId === l.masterTokenId)?.name,
          price:
            myTracks.find((t) => t.tokenId === l.masterTokenId)?.price ?? "0",
        },
      }));

    // Recent plays from the Redis ledger — the live-radio route writes each play here and trims
    // to a fixed cap, so this is a recent window, not a lifetime count. When the window comes
    // back FULL the count derived from it is a floor: this endpoint reported totalPlays 100
    // against a contract lifetime of 5, with the per-song breakdown summing to exactly the cap,
    // and nothing in the response said so.
    let plays: any[] = [];
    let playsSaturated = false;
    try {
      const { Redis } = await import("@upstash/redis");
      const redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      const history = await redisClient.lrange(
        PLAY_HISTORY_KEY,
        0,
        PLAY_HISTORY_CAP - 1,
      );
      // Saturation is a property of the WHOLE ledger, not of this artist's slice: the window is
      // filtered below, and a filtered count taken from a full window is just as much a floor.
      playsSaturated = toPlayWindow(history, (e) => e ?? null).saturated;
      plays = history
        .map((entry: any) =>
          typeof entry === "string" ? JSON.parse(entry) : entry,
        )
        .filter((entry: any) => myTokenIds.has(String(entry?.tokenId)))
        .map((entry: any) => ({
          masterTokenId: String(entry.tokenId),
          playedAt: entry.playedAt,
          masterToken: { name: entry.name },
        }));
    } catch (err: any) {
      console.warn(
        "[ArtistEarnings] play ledger read failed:",
        err.message?.slice(0, 80),
      );
      unavailable.push("recentPlays");
    }

    // Tips: read from the queue. A read failure marks tips unavailable rather than reporting 0,
    // because a broken read and a genuinely untipped artist must not look identical.
    let tips: { amount: bigint; masterTokenId: string; tipper: string }[] = [];
    const radioAddress = process.env.NEXT_PUBLIC_LIVE_RADIO as
      | Address
      | undefined;
    if (!radioAddress) {
      unavailable.push("tips (NEXT_PUBLIC_LIVE_RADIO unset)");
    } else {
      try {
        const { readRadioQueue, tipsForMasters } = await import(
          "@/lib/radio-queue"
        );
        const queue = await readRadioQueue(readClient as any, radioAddress);
        if (queue.truncated)
          unavailable.push("tips (queue longer than the read cap)");
        tips = tipsForMasters(queue, myTokenIds).map((e) => ({
          amount: e.tipAmount,
          masterTokenId: e.masterTokenId,
          tipper: e.queuedBy,
        }));
      } catch (err: any) {
        console.warn(
          "[ArtistEarnings] queue read failed:",
          err.message?.slice(0, 80),
        );
        unavailable.push("tips");
      }
    }

    // artistPayout on the play events was always 0 — the real money comes from the subscription
    // contract's monthly distribution, read below.
    let totalRadioEarningsWei = BigInt(0);
    const songPlays = new Map<
      string,
      { name: string; plays: number; earnings: bigint; tips: bigint }
    >();

    for (const play of plays) {
      const tokenId = play.masterTokenId;
      const existing = songPlays.get(tokenId) || {
        name: play.masterToken?.name || `Song #${tokenId}`,
        plays: 0,
        earnings: BigInt(0),
        tips: BigInt(0),
      };
      existing.plays += 1;
      songPlays.set(tokenId, existing);
    }

    // Authoritative lifetime play count — one read, and not bounded by the 12-month earnings
    // window below.
    let contractPlayCount = 0;

    // Fetch real earnings from MusicSubscription contract (monthly distribution)
    let subscriptionEarningsWei = BigInt(0);
    if (MUSIC_SUBSCRIPTION) {
      try {
        const { activeChain } = await import("@/app/chains");
        const client = createPublicClient({
          chain: activeChain,
          transport: http(MONAD_RPC),
        });
        const subAbi = parseAbi([
          "function getCurrentMonthStats() view returns (uint256 monthId, uint256 totalRevenue, uint256 totalPlays, bool finalized)",
          "function getArtistMonthlyStats(address artist, uint256 monthId) view returns (uint256 playCount, uint256 payout, bool claimed)",
          "function monthlyStats(uint256 monthId) view returns (uint256 totalRevenue, uint256 totalPlays, uint256 distributedAmount, bool finalized)",
          "function artistLifetimePlays(address artist) view returns (uint256)",
        ]);

        try {
          contractPlayCount = Number(
            await client.readContract({
              address: MUSIC_SUBSCRIPTION,
              abi: subAbi,
              functionName: "artistLifetimePlays",
              args: [artistLower as Address],
            }),
          );
        } catch {
          unavailable.push("lifetimePlays");
        }

        const currentMonth = await client.readContract({
          address: MUSIC_SUBSCRIPTION,
          abi: subAbi,
          functionName: "getCurrentMonthStats",
        });
        const currentMonthId = Number(currentMonth[0]);

        // Check last 12 months for earnings (both claimed and unclaimed)
        for (let i = 0; i < 12; i++) {
          const monthId = currentMonthId - i;
          if (monthId < 0) break;
          try {
            const [artistStats, monthStats] = await Promise.all([
              client.readContract({
                address: MUSIC_SUBSCRIPTION,
                abi: subAbi,
                functionName: "getArtistMonthlyStats",
                args: [artistLower as Address, BigInt(monthId)],
              }),
              client.readContract({
                address: MUSIC_SUBSCRIPTION,
                abi: subAbi,
                functionName: "monthlyStats",
                args: [BigInt(monthId)],
              }),
            ]);
            const playCount = Number(artistStats[0]);
            const totalPlaysMonth = Number(monthStats[1]);
            const distributedAmount = monthStats[2] as bigint;
            if (playCount > 0 && totalPlaysMonth > 0) {
              const payout =
                (BigInt(playCount) * distributedAmount) /
                BigInt(totalPlaysMonth);
              subscriptionEarningsWei += payout;
            }
          } catch {
            /* skip uninitialized months */
          }
        }
      } catch (err: any) {
        console.warn(
          "[ArtistEarnings] Subscription query failed:",
          err.message?.slice(0, 80),
        );
      }
    }

    totalRadioEarningsWei = subscriptionEarningsWei;

    // Aggregate tips
    let totalTipsWei = BigInt(0);
    const supporterMap = new Map<
      string,
      { totalPaid: bigint; songsQueued: number }
    >();

    for (const tip of tips) {
      const amount = tip.amount;
      totalTipsWei += amount;

      const tokenId = tip.masterTokenId;
      const existing = songPlays.get(tokenId);
      if (existing) {
        existing.tips += amount;
        songPlays.set(tokenId, existing);
      }

      // Track supporter
      const tipper = tip.tipper.toLowerCase();
      const supporter = supporterMap.get(tipper) || {
        totalPaid: BigInt(0),
        songsQueued: 0,
      };
      supporter.totalPaid += amount;
      supporter.songsQueued += 1;
      supporterMap.set(tipper, supporter);
    }

    const treasuryFeeBps = await getTreasuryFeeBps();

    let totalLicenseSalesWei = BigInt(0);
    for (const license of licenses) {
      const price = BigInt(license.masterToken?.price || "0");
      const artistCut = price - (price * treasuryFeeBps) / 10_000n;
      totalLicenseSalesWei += artistCut;

      // Track license buyers as supporters
      const buyer = license.licensee.toLowerCase();
      const supporter = supporterMap.get(buyer) || {
        totalPaid: BigInt(0),
        songsQueued: 0,
      };
      supporter.totalPaid += artistCut;
      supporter.songsQueued += 1;
      supporterMap.set(buyer, supporter);
    }

    // Build song breakdown sorted by earnings
    const songBreakdown: SongBreakdown[] = Array.from(songPlays.entries())
      .map(([tokenId, data]) => ({
        tokenId,
        name: data.name,
        plays: data.plays,
        earnings: formatEther(data.earnings),
        tips: formatEther(data.tips),
      }))
      .sort((a, b) => parseFloat(b.earnings) - parseFloat(a.earnings))
      .slice(0, 10);

    // Build top supporters sorted by total paid
    const topSupporters: TopSupporter[] = Array.from(supporterMap.entries())
      .map(([address, data]) => ({
        address,
        totalPaid: formatEther(data.totalPaid),
        songsQueued: data.songsQueued,
      }))
      .sort((a, b) => parseFloat(b.totalPaid) - parseFloat(a.totalPaid))
      .slice(0, 10);

    return NextResponse.json({
      totalRadioEarnings: formatEther(totalRadioEarningsWei),
      totalTips: formatEther(totalTipsWei),
      totalLicenseSales: formatEther(totalLicenseSalesWei),
      songBreakdown,
      topSupporters,
      // Recent window from the Redis ledger, not a lifetime figure — `totalPlaysAllTime` below
      // is the authoritative one, from the subscription contract.
      totalPlays: plays.length,
      /**
       * True when `totalPlays` and every `songBreakdown[].plays` are FLOORS rather than counts,
       * because the ledger is at its cap and older plays have been dropped. A caller must render
       * "100+" or "at least 100", never "100".
       */
      totalPlaysIsFloor: playsSaturated,
      /** The ledger's cap, so a caller does not have to hard-code it to explain the floor. */
      playWindowCap: PLAY_HISTORY_CAP,
      totalPlaysAllTime: contractPlayCount,
      totalLicenseCount: licenses.length,
      // Named so a caller can render "unavailable" instead of a zero that looks measured.
      unavailable,
    });
  } catch (error: any) {
    console.error("[ArtistEarnings] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch artist earnings" },
      { status: 500 },
    );
  }
}
