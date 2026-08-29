import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem';

const MUSIC_SUBSCRIPTION = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

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
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
    }

    const artistLower = address.toLowerCase();

    // ── Where each figure now comes from, and what cannot be recovered ────────────────────
    //
    // Earnings were already read from the subscription contract below; the indexer only ever
    // supplied play counts, tips and licence rows. Of those three:
    //
    // - Licences are contract state, so they are read directly.
    // - Play counts are contract state too: getArtistMonthlyStats returns a per-month playCount
    //   per artist, which is authoritative and better than counting event rows.
    // - Per-song play breakdown is NOT contract state. The Redis play ledger has it, capped at
    //   the last 100 plays, so the breakdown is recent rather than lifetime and says so.
    // - TIPS ARE UNRECOVERABLE. LiveRadioV3 emits TipReceived and stores nothing, so historical
    //   tip totals live only in event logs — and eth_getLogs is capped at 100 blocks on the
    //   public RPC and 10 on the current key. Reporting 0 as though it were a measured zero
    //   would be a lie, so the response marks tips unavailable and the UI can say so.
    const unavailable: string[] = [];

    const { getResolvedCatalogue } = await import('@/lib/catalogue-resolved');
    const { activeChain: chainForReads } = await import('@/app/chains');
    const readClient = createPublicClient({
      chain: chainForReads,
      transport: http(MONAD_RPC),
    });

    const catalogue = await getResolvedCatalogue({ limit: 1000 }).catch(() => null);
    if (!catalogue) unavailable.push('catalogue');
    const myTracks = (catalogue?.tracks ?? []).filter(
      (t) => t.artist.toLowerCase() === artistLower,
    );
    const myTokenIds = new Set(myTracks.map((t) => t.tokenId));

    // Every licence ever minted, kept only where the master is this artist's. Bounded by the
    // licence count, which is small; if that stops being true this needs a per-artist index on
    // the contract rather than a bigger walk here.
    const { getRecentLicenses } = await import('@/lib/user-holdings');
    const allLicences = await getRecentLicenses(readClient as any, undefined, 512).catch(
      () => {
        unavailable.push('licences');
        return [];
      },
    );
    const licenses = allLicences
      .filter((l) => myTokenIds.has(l.masterTokenId))
      .map((l) => ({
        licensee: l.licensee ?? '0x0000000000000000000000000000000000000000',
        masterTokenId: l.masterTokenId,
        masterToken: {
          name: myTracks.find((t) => t.tokenId === l.masterTokenId)?.name,
          price: myTracks.find((t) => t.tokenId === l.masterTokenId)?.price ?? '0',
        },
      }));

    // Recent plays from the Redis ledger — the live-radio route writes each play here and trims
    // to the last 100, so this is a recent window, not a lifetime count.
    let plays: any[] = [];
    try {
      const { Redis } = await import('@upstash/redis');
      const redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      const history = await redisClient.lrange('live-radio:play-history', 0, 99);
      plays = history
        .map((entry: any) => (typeof entry === 'string' ? JSON.parse(entry) : entry))
        .filter((entry: any) => myTokenIds.has(String(entry?.tokenId)))
        .map((entry: any) => ({
          masterTokenId: String(entry.tokenId),
          playedAt: entry.playedAt,
          masterToken: { name: entry.name },
        }));
    } catch (err: any) {
      console.warn('[ArtistEarnings] play ledger read failed:', err.message?.slice(0, 80));
      unavailable.push('recentPlays');
    }

    // Tips: see the note above. No source exists.
    const tips: any[] = [];
    unavailable.push('tips');

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

    // Authoritative lifetime play count, accumulated per month from the contract in the same
    // loop that sums earnings below.
    let contractPlayCount = 0;

    // Fetch real earnings from MusicSubscription contract (monthly distribution)
    let subscriptionEarningsWei = BigInt(0);
    if (MUSIC_SUBSCRIPTION) {
      try {
        const { activeChain } = await import('@/app/chains');
        const client = createPublicClient({ chain: activeChain, transport: http(MONAD_RPC) });
        const subAbi = parseAbi([
          'function getCurrentMonthStats() view returns (uint256 monthId, uint256 totalRevenue, uint256 totalPlays, bool finalized)',
          'function getArtistMonthlyStats(address artist, uint256 monthId) view returns (uint256 playCount, uint256 payout, bool claimed)',
          'function monthlyStats(uint256 monthId) view returns (uint256 totalRevenue, uint256 totalPlays, uint256 distributedAmount, bool finalized)',
        ]);

        const currentMonth = await client.readContract({
          address: MUSIC_SUBSCRIPTION, abi: subAbi, functionName: 'getCurrentMonthStats',
        });
        const currentMonthId = Number(currentMonth[0]);

        // Check last 12 months for earnings (both claimed and unclaimed)
        for (let i = 0; i < 12; i++) {
          const monthId = currentMonthId - i;
          if (monthId < 0) break;
          try {
            const [artistStats, monthStats] = await Promise.all([
              client.readContract({
                address: MUSIC_SUBSCRIPTION, abi: subAbi,
                functionName: 'getArtistMonthlyStats',
                args: [artistLower as Address, BigInt(monthId)],
              }),
              client.readContract({
                address: MUSIC_SUBSCRIPTION, abi: subAbi,
                functionName: 'monthlyStats',
                args: [BigInt(monthId)],
              }),
            ]);
            const playCount = Number(artistStats[0]);
            contractPlayCount += playCount;
            const totalPlaysMonth = Number(monthStats[1]);
            const distributedAmount = monthStats[2] as bigint;
            if (playCount > 0 && totalPlaysMonth > 0) {
              const payout = (BigInt(playCount) * distributedAmount) / BigInt(totalPlaysMonth);
              subscriptionEarningsWei += payout;
            }
          } catch { /* skip uninitialized months */ }
        }
      } catch (err: any) {
        console.warn('[ArtistEarnings] Subscription query failed:', err.message?.slice(0, 80));
      }
    }

    totalRadioEarningsWei = subscriptionEarningsWei;

    // Aggregate tips
    let totalTipsWei = BigInt(0);
    const supporterMap = new Map<string, { totalPaid: bigint; songsQueued: number }>();

    for (const tip of tips) {
      const amount = BigInt(tip.amount || '0');
      totalTipsWei += amount;

      const tokenId = tip.masterTokenId;
      const existing = songPlays.get(tokenId);
      if (existing) {
        existing.tips += amount;
        songPlays.set(tokenId, existing);
      }

      // Track supporter
      const tipper = tip.tipper.toLowerCase();
      const supporter = supporterMap.get(tipper) || { totalPaid: BigInt(0), songsQueued: 0 };
      supporter.totalPaid += amount;
      supporter.songsQueued += 1;
      supporterMap.set(tipper, supporter);
    }

    // Aggregate license sales (artist gets 70% of price)
    let totalLicenseSalesWei = BigInt(0);
    for (const license of licenses) {
      const price = BigInt(license.masterToken?.price || '0');
      const artistCut = (price * BigInt(70)) / BigInt(100);
      totalLicenseSalesWei += artistCut;

      // Track license buyers as supporters
      const buyer = license.licensee.toLowerCase();
      const supporter = supporterMap.get(buyer) || { totalPaid: BigInt(0), songsQueued: 0 };
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
      totalPlaysAllTime: contractPlayCount,
      totalLicenseCount: licenses.length,
      // Named so a caller can render "unavailable" instead of a zero that looks measured.
      unavailable,
    });
  } catch (error: any) {
    console.error('[ArtistEarnings] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch artist earnings' },
      { status: 500 }
    );
  }
}
