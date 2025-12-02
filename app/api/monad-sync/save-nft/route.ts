import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function POST(req: NextRequest) {
  try {
    const { fid, walletAddress, tokenId, clarityScore, tier, txHash } = await req.json();

    if (!fid || !tokenId) {
      return NextResponse.json(
        { success: false, error: 'Missing fid or tokenId' },
        { status: 400 }
      );
    }

    // Get existing monad data
    const existingData = await kv.get(`monad:user:${fid}`);
    let monadData: any = existingData ? (typeof existingData === 'string' ? JSON.parse(existingData) : existingData) : {};

    // Update with NFT info
    monadData = {
      ...monadData,
      fid,
      walletAddress,
      clarityScore,
      tier,
      hasNFT: true,
      nftTokenId: tokenId,
      nftTxHash: txHash,
      nftMintedAt: new Date().toISOString()
    };

    // Save updated data
    await kv.set(`monad:user:${fid}`, JSON.stringify(monadData));

    if (walletAddress) {
      await kv.set(`monad:wallet:${walletAddress.toLowerCase()}`, JSON.stringify(monadData));
    }

    console.log('✅ Saved NFT data for FID:', fid, 'Token:', tokenId);

    return NextResponse.json({
      success: true,
      monad: monadData
    });

  } catch (error: any) {
    console.error('❌ Save NFT error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Save failed' },
      { status: 500 }
    );
  }
}
