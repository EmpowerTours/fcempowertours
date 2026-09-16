import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { encodeFunctionData, type Address } from "viem";
import { EPK_SLUG_PREFIX, EPK_REGISTRY_ADDRESS } from "@/lib/epk/constants";
import { slugify, validateEPK } from "@/lib/epk/utils";
import type { EPKMetadata } from "@/lib/epk/types";
import EPKRegistryABI from "@/lib/abis/EPKRegistry.json";

const redis = Redis.fromEnv();

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY =
  process.env.PINATA_GATEWAY || "harlequin-used-hare-224.mypinata.cloud";

/**
 * POST /api/epk - Create or update an EPK
 * Body: { metadata: EPKMetadata, userAddress: string, userFid: number, update?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { metadata, userAddress, userFid, update } = await req.json();

    if (!metadata || !userAddress) {
      return NextResponse.json(
        { error: "metadata and userAddress required" },
        { status: 400 },
      );
    }

    // Validate metadata
    const validation = validateEPK(metadata);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid EPK metadata", details: validation.errors },
        { status: 400 },
      );
    }

    // Set wallet and fid on metadata
    const epkData: EPKMetadata = {
      ...metadata,
      artist: {
        ...metadata.artist,
        walletAddress: userAddress,
        farcasterFid: userFid,
        slug: metadata.artist.slug || slugify(metadata.artist.name),
      },
    };

    // Upload EPK metadata JSON to IPFS via Pinata
    const ipfsCid = await uploadEPKToIPFS(epkData);
    if (!ipfsCid) {
      return NextResponse.json(
        { error: "Failed to upload EPK to IPFS" },
        { status: 500 },
      );
    }

    // ---- The chain write is returned, NOT sent. The caller signs it themselves.
    //
    // This used to relay through `sendUserSafeTransaction`, which made the user's SAFE the
    // `msg.sender`. Both registry functions key on `msg.sender`:
    //
    //   createEPK  writes artistEPKs[msg.sender]   -> registers the SAFE as the artist
    //   updateEPK  requires artistEPKs[msg.sender] -> reverts EPKDoesNotExist for a Safe
    //              .createdAt != 0                    that was never registered
    //
    // That is not hypothetical. On 2026-02-02 the platform Safe registered ITSELF as an artist
    // this way, and `0xf3b9D123…` is still a registered artist carrying unify34's fid — a
    // duplicate that will hold a stale document the moment the real one is updated. The contract
    // gained `createEPKFor`/`updateEPKFor` three minutes later specifically because of it.
    //
    // A press kit belongs to an ADDRESS, and the only address that can prove it is the one that
    // signs. So the route pins the document — it holds the Pinata credential, the client does
    // not — and hands back the call for the artist's own wallet to send.
    const functionName = update ? "updateEPK" : "createEPK";
    const calldata = EPK_REGISTRY_ADDRESS
      ? encodeFunctionData({
          abi: EPKRegistryABI,
          functionName,
          args: update ? [ipfsCid] : [ipfsCid, BigInt(userFid || 0)],
        })
      : null;

    // Store slug -> address mapping in Redis
    const slug = epkData.artist.slug;
    await redis.set(`${EPK_SLUG_PREFIX}${slug}`, userAddress.toLowerCase());

    // `epk:cache` is deliberately NOT written here. It is the fallback the reader uses when the
    // registry has nothing, so writing it now would serve a document that is pinned but not
    // registered — indistinguishable, to every reader, from one that is. It is written after the
    // transaction confirms, by PATCH below.

    return NextResponse.json({
      success: true,
      slug,
      ipfsCid,
      ipfsUrl: `https://${PINATA_GATEWAY}/ipfs/${ipfsCid}`,
      epkUrl: `/epk/${slug}`,
      // The transaction for the caller to sign. `from` must be the artist's own address.
      tx: calldata
        ? { to: EPK_REGISTRY_ADDRESS, data: calldata, functionName }
        : null,
    });
  } catch (error: any) {
    console.error("[EPK] Create/update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create EPK" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/epk - record a confirmed registration.
 *
 * Body: { userAddress, ipfsCid, txHash }
 *
 * Writes `epk:cache` only after verifying on chain that the registry now actually holds this CID
 * for this address. The client reporting success is not evidence: `eth_sendTransaction` resolves
 * when the wallet broadcasts, which says nothing about whether the call reverted — the same trap
 * `lib/artist-claim.ts` documents, where the UI announced "Claimed!" for a reverted transaction.
 * So this re-reads the registry rather than trusting either the caller or the receipt.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userAddress, ipfsCid, txHash } = await req.json();
    if (!userAddress || !ipfsCid) {
      return NextResponse.json(
        { error: "userAddress and ipfsCid required" },
        { status: 400 },
      );
    }
    if (!EPK_REGISTRY_ADDRESS) {
      return NextResponse.json(
        { error: "registry not configured" },
        { status: 500 },
      );
    }

    const { createPublicClient, http } = await import("viem");
    const { activeChain } = await import("@/app/chains");
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    });

    const onChain = (await client.readContract({
      address: EPK_REGISTRY_ADDRESS as Address,
      abi: EPKRegistryABI,
      functionName: "artistEPKs",
      args: [userAddress as Address],
    })) as readonly [string, bigint, bigint, bigint, boolean];

    if (onChain[0] !== ipfsCid) {
      // Not an error the user caused, and not something to paper over: the document is pinned
      // but the registry does not point at it, so the press kit has not changed.
      return NextResponse.json(
        {
          success: false,
          error:
            "Registry does not hold this CID — the transaction did not take effect.",
          onChainCid: onChain[0] || null,
        },
        { status: 409 },
      );
    }

    await redis.set(`epk:cache:${String(userAddress).toLowerCase()}`, ipfsCid);
    return NextResponse.json({
      success: true,
      ipfsCid,
      explorer: txHash ? `https://monadscan.com/tx/${txHash}` : null,
    });
  } catch (error: any) {
    console.error("[EPK] confirm error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/epk - List all EPKs
 */
export async function GET() {
  try {
    // Scan Redis for all EPK slugs
    const keys = await redis.keys(`${EPK_SLUG_PREFIX}*`);
    const epks: Array<{ slug: string; address: string }> = [];

    for (const key of keys) {
      const address = await redis.get<string>(key);
      if (address) {
        const slug = key.replace(EPK_SLUG_PREFIX, "");
        epks.push({ slug, address });
      }
    }

    return NextResponse.json({ success: true, epks });
  } catch (error: any) {
    console.error("[EPK] List error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Upload EPK metadata JSON to Pinata IPFS
async function uploadEPKToIPFS(metadata: EPKMetadata): Promise<string | null> {
  if (!PINATA_JWT) {
    console.error("[EPK] PINATA_JWT not configured");
    return null;
  }

  try {
    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PINATA_JWT}`,
        },
        body: JSON.stringify({
          pinataContent: metadata,
          pinataMetadata: {
            name: `EPK-${metadata.artist.slug}-${Date.now()}`,
          },
        }),
      },
    );

    const data = await response.json();
    return data.IpfsHash || null;
  } catch (error) {
    console.error("[EPK] IPFS upload error:", error);
    return null;
  }
}
