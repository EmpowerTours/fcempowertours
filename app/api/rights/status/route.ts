import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getRightsStatus } from '@/lib/rights-declaration';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    if (!tokenId) {
      return NextResponse.json(
        { error: 'tokenId query parameter required' },
        { status: 400 }
      );
    }

    const status = await getRightsStatus(redis, tokenId);

    if (!status) {
      // Legacy NFT — no rights record exists, considered cleared
      return NextResponse.json({
        cleared: true,
        legacy: true,
        tokenId,
      });
    }

    return NextResponse.json({
      cleared: status.status === 'cleared',
      status: status.status,
      version: status.version,
      agreementCid: status.agreementCid,
      agreementHash: status.agreementHash,
      tokenId,
      storedAt: status.storedAt,
    });
  } catch (error: any) {
    console.error('[RightsStatus] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check rights status' },
      { status: 500 }
    );
  }
}
