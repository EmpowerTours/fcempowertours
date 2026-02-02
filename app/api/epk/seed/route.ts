import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { encodeFunctionData, type Address } from 'viem';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { EPK_SLUG_PREFIX, EPK_CACHE_PREFIX, EPK_REGISTRY_ADDRESS, EARVIN_GALLARDO_EPK } from '@/lib/epk/constants';
import EPKRegistryABI from '@/lib/abis/EPKRegistry.json';

const redis = Redis.fromEnv();

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

/**
 * POST /api/epk/seed - Seed Earvin Gallardo's EPK
 * Body: { artistAddress: string, artistFid: number }
 */
export async function POST(req: NextRequest) {
  try {
    const { artistAddress, artistFid } = await req.json();

    if (!artistAddress) {
      return NextResponse.json({ error: 'artistAddress required' }, { status: 400 });
    }

    // Build the EPK metadata with provided address and fid
    const epkData = {
      ...EARVIN_GALLARDO_EPK,
      artist: {
        ...EARVIN_GALLARDO_EPK.artist,
        walletAddress: artistAddress,
        farcasterFid: artistFid || 0,
      },
    };

    // Upload to IPFS
    if (!PINATA_JWT) {
      return NextResponse.json({ error: 'PINATA_JWT not configured' }, { status: 500 });
    }

    const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: epkData,
        pinataMetadata: { name: `EPK-earvin-gallardo-${Date.now()}` },
      }),
    });

    const pinataData = await pinataResponse.json();
    const ipfsCid = pinataData.IpfsHash;

    if (!ipfsCid) {
      return NextResponse.json({ error: 'IPFS upload failed' }, { status: 500 });
    }

    console.log('[EPK Seed] Uploaded to IPFS:', ipfsCid);

    // Register on-chain via platform Safe
    let txHash: string | null = null;
    if (EPK_REGISTRY_ADDRESS) {
      try {
        const data = encodeFunctionData({
          abi: EPKRegistryABI,
          functionName: 'createEPK',
          args: [ipfsCid, BigInt(artistFid || 0)],
        });

        txHash = await sendSafeTransaction([
          { to: EPK_REGISTRY_ADDRESS as Address, value: 0n, data },
        ]);

        console.log('[EPK Seed] Registered on-chain:', txHash);
      } catch (chainError: any) {
        console.error('[EPK Seed] On-chain registration failed:', chainError.message);
      }
    }

    // Store slug mapping and cache CID in Redis
    const slug = 'earvin-gallardo';
    await redis.set(`${EPK_SLUG_PREFIX}${slug}`, artistAddress);
    await redis.set(`${EPK_CACHE_PREFIX}${artistAddress}`, ipfsCid);

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
    console.error('[EPK Seed] Error:', error);
    return NextResponse.json({ error: error.message || 'Seed failed' }, { status: 500 });
  }
}
