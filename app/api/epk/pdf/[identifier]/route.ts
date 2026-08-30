import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { EPK_SLUG_PREFIX } from "@/lib/epk/constants";
import { fetchEPKFromIPFS } from "@/lib/epk/utils";
import { generateEPKPDF, type NFTTrack } from "@/lib/epk/pdf";
import { readEPKFromChain } from "@/lib/epk/chain";
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { activeChain } from "@/app/chains";
import type { EPKMetadata } from "@/lib/epk/types";

const redis = Redis.fromEnv();
const EPK_REGISTRY = process.env.NEXT_PUBLIC_EPK_REGISTRY as
  | Address
  | undefined;

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  // Build a list of URLs to try (primary + fallback gateways for IPFS)
  const urls: string[] = [url];
  const ipfsCidMatch = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (ipfsCidMatch) {
    urls.push(`https://ipfs.io/ipfs/${ipfsCidMatch[1]}`);
    urls.push(`https://gateway.pinata.cloud/ipfs/${ipfsCidMatch[1]}`);
  }
  for (const tryUrl of urls) {
    try {
      const res = await fetch(tryUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const raw = Buffer.from(await res.arrayBuffer());
        console.log(
          `[EPK PDF] Image fetched (${raw.length} bytes) from ${tryUrl}`,
        );
        // pdfkit only supports JPEG and PNG — convert any format (WebP, etc.) to PNG via sharp
        try {
          const { default: sharp } = await import("sharp");
          const png = await sharp(raw).png().toBuffer();
          console.log(`[EPK PDF] Converted to PNG (${png.length} bytes)`);
          return png;
        } catch (convErr) {
          console.warn(
            `[EPK PDF] sharp conversion failed, returning raw buffer:`,
            (convErr as Error).message,
          );
          return raw;
        }
      }
    } catch {
      // try next
    }
  }
  console.warn(`[EPK PDF] Image fetch failed for all gateways: ${url}`);
  return null;
}

async function fetchArtistNFTs(artistAddress: string): Promise<NFTTrack[]> {
  try {
    const { getResolvedCatalogue } = await import("@/lib/catalogue-resolved");
    const { tracks } = await getResolvedCatalogue();

    // Newest first, matching the `order_by: {tokenId: desc}, limit: 1` this replaces.
    const mine = tracks
      .filter(
        (t) =>
          !t.isArt && t.artist?.toLowerCase() === artistAddress.toLowerCase(),
      )
      .sort((a, b) => Number(b.tokenId) - Number(a.tokenId))
      .slice(0, 1);

    return await Promise.all(
      mine.map(async (track) => ({
        tokenId: Number(track.tokenId),
        title: track.name,
        coverImage: track.imageUrl,
        imageBuffer: await fetchImageBuffer(track.imageUrl),
      })),
    );
  } catch (err) {
    console.warn("[EPK PDF] NFT fetch failed:", (err as Error).message);
    return [];
  }
}

/**
 * GET /api/epk/pdf/[identifier] - Generate EPK as downloadable PDF
 * Uses @react-pdf/pdfkit directly (no React) to avoid dual-React instance issues.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;

    let artistAddress: string | null = null;
    if (identifier.startsWith("0x") && identifier.length === 42) {
      artistAddress = identifier;
    } else {
      artistAddress = await redis.get<string>(
        `${EPK_SLUG_PREFIX}${identifier}`,
      );
    }

    if (!artistAddress) {
      return NextResponse.json({ error: "EPK not found" }, { status: 404 });
    }

    let epkMetadata: EPKMetadata | null = null;

    if (EPK_REGISTRY) {
      const client = createPublicClient({
        chain: activeChain,
        transport: http(),
      }) as PublicClient;
      const onChainData = await readEPKFromChain(
        client,
        EPK_REGISTRY,
        artistAddress,
      );
      if (onChainData) {
        epkMetadata = await fetchEPKFromIPFS(onChainData.ipfsCid);
      }
    }

    if (!epkMetadata) {
      const cachedCid = await redis.get<string>(`epk:cache:${artistAddress}`);
      if (cachedCid) {
        epkMetadata = await fetchEPKFromIPFS(cachedCid);
      }
    }

    if (!epkMetadata) {
      return NextResponse.json(
        { error: "EPK metadata not found" },
        { status: 404 },
      );
    }

    // Fetch NFTs in parallel with PDF generation prep
    const nfts = await fetchArtistNFTs(artistAddress);

    const pdfBuffer = await generateEPKPDF(epkMetadata, nfts);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${epkMetadata.artist.slug || "epk"}-press-kit.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("[EPK PDF] Error:", error?.message, error?.stack);
    return NextResponse.json(
      { error: error?.message || "PDF generation failed" },
      { status: 500 },
    );
  }
}
