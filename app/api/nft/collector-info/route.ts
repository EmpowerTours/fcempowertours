import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, Address } from 'viem';
import { monadMainnet } from '@/app/chains';

const NFT_CONTRACT = (process.env.NEXT_PUBLIC_NFT_CONTRACT || '0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08') as Address;

const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY
  ? `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/`
  : 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

const masterTokensAbi = parseAbi([
  'function masterTokens(uint256) view returns (uint256 artistFid, address originalArtist, string tokenURI, string collectorTokenURI, uint256 price, uint256 collectorPrice, uint256 totalSold, uint256 activeLicenses, uint256 maxCollectorEditions, uint256 collectorsMinted, bool active, uint8 nftType, uint96 royaltyPercentage)',
]);

const client = createPublicClient({
  chain: monadMainnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz'),
});

// In-memory cache with 5min TTL
const cache = new Map<string, { data: CollectorInfo; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CollectorInfo {
  tokenId: string;
  isCollectorMaster: boolean;
  collectorImageUrl: string | null;
  maxEditions: number;
  collectorsMinted: number;
  collectorPrice: string;
}

function resolveIPFS(url: string): string {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', PINATA_GATEWAY);
  }
  return url;
}

async function getCollectorInfo(tokenId: string): Promise<CollectorInfo> {
  // Check cache
  const cached = cache.get(tokenId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const result = await client.readContract({
      address: NFT_CONTRACT,
      abi: masterTokensAbi,
      functionName: 'masterTokens',
      args: [BigInt(tokenId)],
    });

    // result is a tuple matching the return types
    const [
      , // artistFid
      , // originalArtist
      , // tokenURI
      collectorTokenURI,
      , // price
      collectorPrice,
      , // totalSold
      , // activeLicenses
      maxCollectorEditions,
      collectorsMinted,
      , // active
      , // nftType
      , // royaltyPercentage
    ] = result;

    const isCollectorMaster = collectorTokenURI !== '' && maxCollectorEditions > 0n;
    let collectorImageUrl: string | null = null;

    if (isCollectorMaster && collectorTokenURI) {
      try {
        const metadataUrl = resolveIPFS(collectorTokenURI);
        const metadataRes = await fetch(metadataUrl, { signal: AbortSignal.timeout(5000) });
        if (metadataRes.ok) {
          const metadata = await metadataRes.json();
          if (metadata.image) {
            collectorImageUrl = resolveIPFS(metadata.image);
          }
        }
      } catch {
        // IPFS fetch failed — still return contract data
        console.warn(`[collector-info] Failed to fetch collector metadata for token ${tokenId}`);
      }
    }

    const info: CollectorInfo = {
      tokenId,
      isCollectorMaster,
      collectorImageUrl,
      maxEditions: Number(maxCollectorEditions),
      collectorsMinted: Number(collectorsMinted),
      collectorPrice: (Number(collectorPrice) / 1e18).toFixed(6),
    };

    // Cache the result
    cache.set(tokenId, { data: info, expiry: Date.now() + CACHE_TTL });
    return info;
  } catch (err) {
    console.error(`[collector-info] Contract read failed for token ${tokenId}:`, err);
    // Return default non-collector info
    const info: CollectorInfo = {
      tokenId,
      isCollectorMaster: false,
      collectorImageUrl: null,
      maxEditions: 0,
      collectorsMinted: 0,
      collectorPrice: '0',
    };
    // Cache failures briefly (30s) to avoid hammering
    cache.set(tokenId, { data: info, expiry: Date.now() + 30_000 });
    return info;
  }
}

// GET /api/nft/collector-info?tokenId=<id>
export async function GET(req: NextRequest) {
  const tokenId = req.nextUrl.searchParams.get('tokenId');
  if (!tokenId || !/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  const info = await getCollectorInfo(tokenId);
  return NextResponse.json(info);
}

// POST /api/nft/collector-info { tokenIds: [...] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tokenIds: string[] = body.tokenIds;

    if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
      return NextResponse.json({ error: 'tokenIds must be a non-empty array' }, { status: 400 });
    }

    if (tokenIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 tokens per request' }, { status: 400 });
    }

    // Validate all IDs are numeric
    if (!tokenIds.every(id => /^\d+$/.test(String(id)))) {
      return NextResponse.json({ error: 'All tokenIds must be numeric' }, { status: 400 });
    }

    const results = await Promise.all(
      tokenIds.map(id => getCollectorInfo(String(id)))
    );

    // Return as a map for easy lookup
    const resultMap: Record<string, CollectorInfo> = {};
    results.forEach(info => {
      resultMap[info.tokenId] = info;
    });

    return NextResponse.json(resultMap);
  } catch (err) {
    console.error('[collector-info] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
