import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, Address } from "viem";
import { monadMainnet } from "@/app/chains";
import { isV3Contracts, readMasterPrice } from "@/lib/contract-generation";

const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT! as Address;

const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY
  ? `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/`
  : "https://harlequin-used-hare-224.mypinata.cloud/ipfs/";

const masterTokensAbi = parseAbi([
  "function masterTokens(uint256) view returns (uint256 artistFid, address originalArtist, string tokenURI, string collectorTokenURI, uint256 price, uint256 collectorPrice, uint256 totalSold, uint256 activeLicenses, uint256 maxCollectorEditions, uint256 collectorsMinted, bool active, uint8 nftType, uint96 royaltyPercentage)",
]);

const client = createPublicClient({
  chain: monadMainnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz"),
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
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", PINATA_GATEWAY);
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
      functionName: "masterTokens",
      args: [BigInt(tokenId)],
    });

    // result is a tuple matching the return types
    const [
      ,
      ,
      ,
      // artistFid
      // originalArtist
      // tokenURI
      collectorTokenURIRaw, // price
      ,
      collectorPriceRaw, // totalSold
      ,
      ,
      // activeLicenses
      maxCollectorEditions,
      collectorsMinted, // active
      // nftType
      // royaltyPercentage
      ,
      ,
      ,
    ] = result;

    // v3's `masterTokens` is a compatibility view for LiveRadioV3. `maxCollectorEditions` and
    // `collectorsMinted` are real in it; `collectorTokenURI` and `collectorPrice` are not —
    // pricing moved to SalesController, and v3 has no master-level collector URI at all
    // (a collector licence carries its own URI, set when that licence is minted).
    let collectorTokenURI = collectorTokenURIRaw;
    let collectorPrice = collectorPriceRaw;

    if (isV3Contracts()) {
      const v3Price = await readMasterPrice(client, {
        nftAddress: NFT_CONTRACT,
        salesController: process.env.NEXT_PUBLIC_SALES_CONTROLLER as
          | `0x${string}`
          | undefined,
        tokenId: BigInt(tokenId),
        isCollector: true,
      });
      collectorPrice = v3Price ?? 0n;

      // v3 has no master-level collector URI field, but the pointer is not lost: the upload
      // route writes `collector_token_uri` into the master's own metadata document, which is
      // what `tokenURI` already resolves to. Read it back from there rather than reporting
      // the edition as having no artwork.
      collectorTokenURI = "";
      try {
        const masterUri = (await client.readContract({
          address: NFT_CONTRACT,
          abi: parseAbi(["function tokenURI(uint256) view returns (string)"]),
          functionName: "tokenURI",
          args: [BigInt(tokenId)],
        })) as string;
        if (masterUri) {
          const masterRes = await fetch(resolveIPFS(masterUri), {
            signal: AbortSignal.timeout(8000),
          });
          if (masterRes.ok) {
            const masterMeta = await masterRes.json();
            if (typeof masterMeta?.collector_token_uri === "string") {
              collectorTokenURI = masterMeta.collector_token_uri;
            }
          }
        }
      } catch (metaErr: any) {
        // A master minted before this field existed simply has no pointer. The edition still
        // sells; it just falls back to the master artwork below.
        console.warn(
          "⚠️ Could not read collector artwork from master metadata:",
          metaErr?.message,
        );
      }
    }

    // Under v3 the editions cap is the only master-level signal that a collector tier exists,
    // so that is what the check has to rest on.
    const isCollectorMaster = isV3Contracts()
      ? maxCollectorEditions > 0n
      : collectorTokenURI !== "" && maxCollectorEditions > 0n;
    let collectorImageUrl: string | null = null;

    if (isCollectorMaster && collectorTokenURI) {
      try {
        const metadataUrl = resolveIPFS(collectorTokenURI);
        const metadataRes = await fetch(metadataUrl, {
          signal: AbortSignal.timeout(5000),
        });
        if (metadataRes.ok) {
          const metadata = await metadataRes.json();
          if (metadata.image) {
            collectorImageUrl = resolveIPFS(metadata.image);
          }
        }
      } catch {
        // IPFS fetch failed — still return contract data
        console.warn(
          `[collector-info] Failed to fetch collector metadata for token ${tokenId}`,
        );
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
    console.error(
      `[collector-info] Contract read failed for token ${tokenId}:`,
      err,
    );
    // Return default non-collector info
    const info: CollectorInfo = {
      tokenId,
      isCollectorMaster: false,
      collectorImageUrl: null,
      maxEditions: 0,
      collectorsMinted: 0,
      collectorPrice: "0",
    };
    // Cache failures briefly (30s) to avoid hammering
    cache.set(tokenId, { data: info, expiry: Date.now() + 30_000 });
    return info;
  }
}

// GET /api/nft/collector-info?tokenId=<id>
export async function GET(req: NextRequest) {
  const tokenId = req.nextUrl.searchParams.get("tokenId");
  if (!tokenId || !/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: "Invalid tokenId" }, { status: 400 });
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
      return NextResponse.json(
        { error: "tokenIds must be a non-empty array" },
        { status: 400 },
      );
    }

    if (tokenIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 tokens per request" },
        { status: 400 },
      );
    }

    // Validate all IDs are numeric
    if (!tokenIds.every((id) => /^\d+$/.test(String(id)))) {
      return NextResponse.json(
        { error: "All tokenIds must be numeric" },
        { status: 400 },
      );
    }

    const results = await Promise.all(
      tokenIds.map((id) => getCollectorInfo(String(id))),
    );

    // Return as a map for easy lookup
    const resultMap: Record<string, CollectorInfo> = {};
    results.forEach((info) => {
      resultMap[info.tokenId] = info;
    });

    return NextResponse.json(resultMap);
  } catch (err) {
    console.error("[collector-info] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
