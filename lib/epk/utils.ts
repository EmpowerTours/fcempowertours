import type { EPKMetadata, ArtistStreamingStats, SongStats } from './types';

/**
 * Convert an artist name to a URL-safe slug
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validate EPK metadata structure
 */
export function validateEPK(epk: Partial<EPKMetadata>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!epk.artist?.name) errors.push('Artist name is required');
  if (!epk.artist?.bio) errors.push('Artist bio is required');
  if (!epk.artist?.genre || epk.artist.genre.length === 0) errors.push('At least one genre is required');
  if (!epk.artist?.location) errors.push('Location is required');

  if (epk.press) {
    for (const article of epk.press) {
      if (!article.outlet) errors.push('Press article outlet is required');
      if (!article.title) errors.push('Press article title is required');
      if (!article.url) errors.push('Press article URL is required');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Fetch artist streaming stats from Envio
 */
export async function fetchArtistStreamingStats(
  artistAddress: string,
  envioEndpoint: string
): Promise<ArtistStreamingStats> {
  const query = `
    query ArtistStats($artist: String!) {
      EmpowerToursNFT_MasterMinted(
        where: { artist: { _eq: $artist } }
        order_by: { tokenId: asc }
      ) {
        tokenId
        title
        artist
        coverImage
        audioUrl
      }
      PlayOracle_PlayRecorded(
        where: { artist: { _eq: $artist } }
      ) {
        id
        tokenId
        listener
      }
      MusicSubscription_ArtistPayout(
        where: { artist: { _eq: $artist } }
      ) {
        amount
      }
      EmpowerToursNFT_LicensePurchased(
        where: { tokenId_gt: 0 }
      ) {
        tokenId
        buyer
        price
      }
    }
  `;

  try {
    const response = await fetch(envioEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { artist: artistAddress.toLowerCase() } }),
    });

    const data = await response.json();

    const nfts = data?.data?.EmpowerToursNFT_MasterMinted || [];
    const plays = data?.data?.PlayOracle_PlayRecorded || [];
    const payouts = data?.data?.MusicSubscription_ArtistPayout || [];
    const sales = data?.data?.EmpowerToursNFT_LicensePurchased || [];

    // Build token ID set for this artist
    const artistTokenIds = new Set(nfts.map((n: any) => n.tokenId));

    // Filter sales to only this artist's tokens
    const artistSales = sales.filter((s: any) => artistTokenIds.has(s.tokenId));

    // Calculate unique listeners
    const uniqueListeners = new Set(plays.map((p: any) => p.listener)).size;

    // Calculate total revenue from payouts
    const totalRevenue = payouts.reduce((sum: bigint, p: any) => sum + BigInt(p.amount || '0'), 0n);

    // Build per-song stats
    const songPlayCounts: Record<number, number> = {};
    const songSaleCounts: Record<number, number> = {};
    for (const play of plays) {
      songPlayCounts[play.tokenId] = (songPlayCounts[play.tokenId] || 0) + 1;
    }
    for (const sale of artistSales) {
      songSaleCounts[sale.tokenId] = (songSaleCounts[sale.tokenId] || 0) + 1;
    }

    const topSongs: SongStats[] = nfts.map((nft: any) => ({
      tokenId: nft.tokenId,
      title: nft.title || `Track #${nft.tokenId}`,
      artist: nft.artist,
      coverImage: nft.coverImage || '',
      audioUrl: nft.audioUrl || '',
      plays: songPlayCounts[nft.tokenId] || 0,
      sales: songSaleCounts[nft.tokenId] || 0,
    })).sort((a: SongStats, b: SongStats) => b.plays - a.plays);

    return {
      totalPlays: plays.length,
      uniqueListeners,
      totalSales: artistSales.length,
      totalRevenue: (Number(totalRevenue) / 1e18).toFixed(2),
      topSongs,
    };
  } catch (error) {
    console.error('[EPK] Failed to fetch streaming stats:', error);
    return {
      totalPlays: 0,
      uniqueListeners: 0,
      totalSales: 0,
      totalRevenue: '0',
      topSongs: [],
    };
  }
}

/**
 * Fetch EPK from Envio (on-chain CID) then IPFS (metadata)
 */
export async function fetchEPKFromChain(
  artistAddress: string,
  envioEndpoint: string
): Promise<{ ipfsCid: string; artistFid: number; createdAt: number; updatedAt: number } | null> {
  const query = `
    query GetEPK($artist: String!) {
      EPKRegistry_EPKCreated(
        where: { artist: { _eq: $artist } }
        limit: 1
      ) {
        artist
        artistFid
        ipfsCid
        blockTimestamp
      }
      EPKRegistry_EPKUpdated(
        where: { artist: { _eq: $artist } }
        order_by: { blockTimestamp: desc }
        limit: 1
      ) {
        ipfsCid
        blockTimestamp
      }
    }
  `;

  try {
    const response = await fetch(envioEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { artist: artistAddress.toLowerCase() } }),
    });

    const data = await response.json();
    const created = data?.data?.EPKRegistry_EPKCreated?.[0];
    if (!created) return null;

    const updated = data?.data?.EPKRegistry_EPKUpdated?.[0];

    return {
      ipfsCid: updated?.ipfsCid || created.ipfsCid,
      artistFid: created.artistFid,
      createdAt: created.blockTimestamp,
      updatedAt: updated?.blockTimestamp || created.blockTimestamp,
    };
  } catch (error) {
    console.error('[EPK] Failed to fetch from chain:', error);
    return null;
  }
}

/**
 * Fetch EPK metadata JSON from IPFS
 */
export async function fetchEPKFromIPFS(ipfsCid: string): Promise<EPKMetadata | null> {
  const gateways = [
    `https://${process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud'}/ipfs/${ipfsCid}`,
    `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
    `https://ipfs.io/ipfs/${ipfsCid}`,
  ];

  for (const url of gateways) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      continue;
    }
  }

  console.error('[EPK] Failed to fetch from IPFS:', ipfsCid);
  return null;
}

/**
 * Get Rumble embed URL from a Rumble video page URL
 */
export function getRumbleEmbedUrl(url: string): string | null {
  // Rumble embed IDs differ from page URL slugs, so we can't derive
  // the embed URL from the page URL. Return null to fall back to link.
  return null;
}
