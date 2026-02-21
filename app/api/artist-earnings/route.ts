import { NextRequest, NextResponse } from 'next/server';
import { formatEther } from 'viem';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

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

    // Aggregate radio earnings
    let totalRadioEarningsWei = BigInt(0);
    const songPlays = new Map<string, { name: string; plays: number; earnings: bigint; tips: bigint }>();

    for (const play of plays) {
      const payout = BigInt(play.artistPayout || '0');
      totalRadioEarningsWei += payout;

      const tokenId = play.masterTokenId;
      const existing = songPlays.get(tokenId) || {
        name: play.masterToken?.name || `Song #${tokenId}`,
        plays: 0,
        earnings: BigInt(0),
        tips: BigInt(0),
      };
      existing.plays += 1;
      existing.earnings += payout;
      songPlays.set(tokenId, existing);
    }

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
