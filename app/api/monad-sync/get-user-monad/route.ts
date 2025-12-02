import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid');
    const walletAddress = searchParams.get('wallet');

    if (!fid && !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing fid or wallet' },
        { status: 400 }
      );
    }

    let monadData = null;

    if (fid) {
      const data = await kv.get(`monad:user:${fid}`);
      if (data) {
        monadData = typeof data === 'string' ? JSON.parse(data) : data;
      }
    } else if (walletAddress) {
      const data = await kv.get(`monad:wallet:${walletAddress.toLowerCase()}`);
      if (data) {
        monadData = typeof data === 'string' ? JSON.parse(data) : data;
      }
    }

    return NextResponse.json({
      success: true,
      monad: monadData
    });

  } catch (error: any) {
    console.error('❌ Get monad error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Fetch failed' },
      { status: 500 }
    );
  }
}
