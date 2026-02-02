import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { encodeFunctionData, type Address } from 'viem';
import { sendUserSafeTransaction } from '@/lib/user-safe';
import { EPK_SLUG_PREFIX, EPK_REGISTRY_ADDRESS } from '@/lib/epk/constants';
import { slugify, validateEPK } from '@/lib/epk/utils';
import type { EPKMetadata } from '@/lib/epk/types';
import EPKRegistryABI from '@/lib/abis/EPKRegistry.json';

const redis = Redis.fromEnv();

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

/**
 * POST /api/epk - Create or update an EPK
 * Body: { metadata: EPKMetadata, userAddress: string, userFid: number, update?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { metadata, userAddress, userFid, update } = await req.json();

    if (!metadata || !userAddress) {
      return NextResponse.json({ error: 'metadata and userAddress required' }, { status: 400 });
    }

    // Validate metadata
    const validation = validateEPK(metadata);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Invalid EPK metadata', details: validation.errors }, { status: 400 });
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
      return NextResponse.json({ error: 'Failed to upload EPK to IPFS' }, { status: 500 });
    }

    // Register on-chain via EPKRegistry (user's Safe calls createEPK/updateEPK directly)
    let txHash: string | null = null;
    if (EPK_REGISTRY_ADDRESS) {
      try {
        const functionName = update ? 'updateEPK' : 'createEPK';
        const args = update
          ? [ipfsCid]
          : [ipfsCid, BigInt(userFid || 0)];

        const data = encodeFunctionData({
          abi: EPKRegistryABI,
          functionName,
          args,
        });

        const result = await sendUserSafeTransaction(userAddress, [
          { to: EPK_REGISTRY_ADDRESS as Address, value: 0n, data },
        ]);
        txHash = result.txHash;

        console.log(`[EPK] ${update ? 'Updated' : 'Created'} on-chain for ${userAddress}:`, txHash);
      } catch (chainError: any) {
        console.error('[EPK] On-chain registration failed:', chainError.message);
        // Continue - EPK is still on IPFS, can be registered on-chain later
      }
    }

    // Store slug -> address mapping in Redis
    const slug = epkData.artist.slug;
    await redis.set(`${EPK_SLUG_PREFIX}${slug}`, userAddress.toLowerCase());

    return NextResponse.json({
      success: true,
      slug,
      ipfsCid,
      txHash,
      ipfsUrl: `https://${PINATA_GATEWAY}/ipfs/${ipfsCid}`,
      epkUrl: `/epk/${slug}`,
      explorer: txHash ? `https://monadscan.com/tx/${txHash}` : null,
    });
  } catch (error: any) {
    console.error('[EPK] Create/update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create EPK' }, { status: 500 });
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
        const slug = key.replace(EPK_SLUG_PREFIX, '');
        epks.push({ slug, address });
      }
    }

    return NextResponse.json({ success: true, epks });
  } catch (error: any) {
    console.error('[EPK] List error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Upload EPK metadata JSON to Pinata IPFS
async function uploadEPKToIPFS(metadata: EPKMetadata): Promise<string | null> {
  if (!PINATA_JWT) {
    console.error('[EPK] PINATA_JWT not configured');
    return null;
  }

  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `EPK-${metadata.artist.slug}-${Date.now()}`,
        },
      }),
    });

    const data = await response.json();
    return data.IpfsHash || null;
  } catch (error) {
    console.error('[EPK] IPFS upload error:', error);
    return null;
  }
}
