import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { EPK_SLUG_PREFIX } from '@/lib/epk/constants';
import { fetchEPKFromIPFS, fetchEPKFromChain, fetchArtistStreamingStats } from '@/lib/epk/utils';

const redis = Redis.fromEnv();

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

/**
 * GET /api/epk/[identifier] - Fetch a full EPK by slug or address
 * Returns: EPK metadata from IPFS + live streaming stats from Envio
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;

    // Resolve identifier to artist address
    let artistAddress: string | null = null;

    if (identifier.startsWith('0x') && identifier.length === 42) {
      artistAddress = identifier.toLowerCase();
    } else {
      // Look up slug in Redis
      artistAddress = await redis.get<string>(`${EPK_SLUG_PREFIX}${identifier}`);
      if (artistAddress) artistAddress = artistAddress.toLowerCase();
    }

    if (!artistAddress) {
      return NextResponse.json({ error: 'EPK not found' }, { status: 404 });
    }

    // Try to get EPK from chain (Envio -> IPFS)
    let epkMetadata = null;
    let onChainData = null;

    if (ENVIO_ENDPOINT) {
      onChainData = await fetchEPKFromChain(artistAddress, ENVIO_ENDPOINT);
      if (onChainData) {
        epkMetadata = await fetchEPKFromIPFS(onChainData.ipfsCid);
      }
    }

    // Fallback: check if there's a cached CID in Redis
    if (!epkMetadata) {
      const cachedCid = await redis.get<string>(`epk:cache:${artistAddress}`);
      if (cachedCid) {
        epkMetadata = await fetchEPKFromIPFS(cachedCid);
        if (epkMetadata) {
          onChainData = { ipfsCid: cachedCid, artistFid: 0, createdAt: 0, updatedAt: 0 };
        }
      }
    }

    if (!epkMetadata) {
      return NextResponse.json({ error: 'EPK metadata not found' }, { status: 404 });
    }

    // Fetch live streaming stats from Envio
    let streamingStats = null;
    if (ENVIO_ENDPOINT) {
      streamingStats = await fetchArtistStreamingStats(artistAddress, ENVIO_ENDPOINT);
    }

    // Enrich with on-chain info
    if (onChainData) {
      epkMetadata.onChain = {
        contractAddress: process.env.NEXT_PUBLIC_EPK_REGISTRY || undefined,
        ipfsCid: onChainData.ipfsCid,
        registeredAt: onChainData.createdAt,
        updatedAt: onChainData.updatedAt,
      };
    }

    return NextResponse.json({
      success: true,
      epk: epkMetadata,
      streamingStats,
      artistAddress,
      ipfsUrl: onChainData ? `https://${PINATA_GATEWAY}/ipfs/${onChainData.ipfsCid}` : null,
    });
  } catch (error: any) {
    console.error('[EPK] Fetch error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch EPK' }, { status: 500 });
  }
}
