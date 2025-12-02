import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function POST(req: NextRequest) {
  try {
    const { fid, walletAddress, clarityScore, tier, baseClarity, onchainScore } = await req.json();

    if (!fid) {
      return NextResponse.json(
        { success: false, error: 'Missing fid' },
        { status: 400 }
      );
    }

    const monadData = {
      fid,
      walletAddress,
      clarityScore,
      tier,
      baseClarity,
      onchainScore,
      updatedAt: new Date().toISOString(),
      hasNFT: false,
      nftTokenId: null
    };

    // Save to KV store
    await kv.set(`monad:user:${fid}`, JSON.stringify(monadData));

    // Also index by wallet address
    if (walletAddress) {
      await kv.set(`monad:wallet:${walletAddress.toLowerCase()}`, JSON.stringify(monadData));
    }

    console.log('✅ Saved monad data for FID:', fid);

    return NextResponse.json({
      success: true,
      monad: monadData
    });

  } catch (error: any) {
    console.error('❌ Save monad error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Save failed' },
      { status: 500 }
    );
  }
}
