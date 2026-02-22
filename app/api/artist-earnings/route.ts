import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
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

    // Query all earnings data in parallel from Envio
    const radioPlaysQuery = `
      query ArtistRadioPlays($artist: String!) {
        RadioPlay(where: { artist: { _eq: $artist } }, limit: 1000) {
          masterTokenId
          artistPayout
          playedAt
          masterToken {
            name
          }
        }
      }
    `;

    const tipsQuery = `
      query ArtistTips($artist: String!) {
        RadioTip(where: { artist: { _eq: $artist } }, limit: 1000) {
          tipper
          amount
          masterTokenId
          masterToken {
            name
          }
        }
      }
    `;

    const licensesQuery = `
      query ArtistLicenses($artist: String!) {
        MusicLicense(where: { masterToken: { artist: { _eq: $artist } } }, limit: 1000) {
          licensee
          masterTokenId
          masterToken {
            name
            price
          }
        }
      }
    `;

    const fetchEnvio = async (query: string) => {
      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ query, variables: { artist: artistLower } }),
      });
      if (!response.ok) throw new Error(`Envio query failed: ${response.status}`);
      return response.json();
    };

    const [playsResult, tipsResult, licensesResult] = await Promise.all([
      fetchEnvio(radioPlaysQuery),
      fetchEnvio(tipsQuery),
      fetchEnvio(licensesQuery),
    ]);

    const plays = playsResult.data?.RadioPlay || [];
    const tips = tipsResult.data?.RadioTip || [];
    const licenses = licensesResult.data?.MusicLicense || [];

    // Aggregate radio play counts (artistPayout from events is always 0 — real payouts come from subscription contract)
    let totalRadioEarningsWei = BigInt(0);
    const songPlays = new Map<string, { name: string; plays: number; earnings: bigint; tips: bigint }>();

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
      totalPlays: plays.length,
      totalLicenseCount: licenses.length,
    });
  } catch (error: any) {
    console.error('[ArtistEarnings] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch artist earnings' },
      { status: 500 }
    );
  }
}
