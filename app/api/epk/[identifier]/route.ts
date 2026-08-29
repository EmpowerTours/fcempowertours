import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { EPK_SLUG_PREFIX } from "@/lib/epk/constants";
import { fetchEPKFromIPFS } from "@/lib/epk/utils";
import { readEPKFromChain, getArtistStreamingStats } from "@/lib/epk/chain";
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { activeChain } from "@/app/chains";

const redis = Redis.fromEnv();

const EPK_REGISTRY = process.env.NEXT_PUBLIC_EPK_REGISTRY as
  | Address
  | undefined;
const PINATA_GATEWAY =
  process.env.PINATA_GATEWAY || "harlequin-used-hare-224.mypinata.cloud";

/**
 * GET /api/epk/[identifier] - Fetch a full EPK by slug or address
 * Returns: EPK metadata from IPFS + live streaming stats read from the contracts.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;

    // Resolve identifier to artist address
    let artistAddress: string | null = null;

    if (identifier.startsWith("0x") && identifier.length === 42) {
      artistAddress = identifier.toLowerCase();
    } else {
      // Look up slug in Redis
      artistAddress = await redis.get<string>(
        `${EPK_SLUG_PREFIX}${identifier}`,
      );
      if (artistAddress) artistAddress = artistAddress.toLowerCase();
    }

    if (!artistAddress) {
      return NextResponse.json({ error: "EPK not found" }, { status: 404 });
    }

    // Registry -> IPFS. `artistEPKs` returns the current CID directly, so there is no
    // created/updated event join, and it carries `active` — a deactivated EPK now 404s instead of
    // rendering, which the event pair could not detect.
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    }) as PublicClient;

    let epkMetadata = null;
    let onChainData: {
      ipfsCid: string;
      artistFid: number;
      createdAt: number;
      updatedAt: number;
    } | null = null;

    if (EPK_REGISTRY) {
      onChainData = await readEPKFromChain(client, EPK_REGISTRY, artistAddress);
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
          onChainData = {
            ipfsCid: cachedCid,
            artistFid: 0,
            createdAt: 0,
            updatedAt: 0,
          };
        }
      }
    }

    if (!epkMetadata) {
      return NextResponse.json(
        { error: "EPK metadata not found" },
        { status: 404 },
      );
    }

    // Streaming stats from the contracts. A failure costs the stats panel, not the EPK.
    const streamingStats = await getArtistStreamingStats(
      artistAddress,
      client,
    ).catch((e) => {
      console.error("[EPK] streaming stats failed:", e);
      return null;
    });

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
      ipfsUrl: onChainData
        ? `https://${PINATA_GATEWAY}/ipfs/${onChainData.ipfsCid}`
        : null,
    });
  } catch (error: any) {
    console.error("[EPK] Fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch EPK" },
      { status: 500 },
    );
  }
}
