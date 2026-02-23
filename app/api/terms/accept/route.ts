import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TERMS_KEY_PREFIX = 'terms:accepted:';

export async function POST(request: NextRequest) {
  try {
    const { address, timestamp, version } = await request.json();

    if (!address || !timestamp) {
      return NextResponse.json(
        { error: 'Address and timestamp required' },
        { status: 400 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    const acceptanceRecord = {
      address: address.toLowerCase(),
      timestamp,
      version: version || '1.0',
      ip,
      userAgent,
      acceptedAt: new Date().toISOString(),
    };

    // Store in Redis
    await redis.set(
      `${TERMS_KEY_PREFIX}${address.toLowerCase()}`,
      JSON.stringify(acceptanceRecord)
    );

    console.log('[Terms] Acceptance recorded:', address.toLowerCase());

    return NextResponse.json({
      success: true,
      message: 'Terms acceptance recorded',
      record: acceptanceRecord,
    });
  } catch (error: any) {
    console.error('[Terms] Failed to record acceptance:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record acceptance' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address required' },
        { status: 400 }
      );
    }

    const record = await redis.get<string>(`${TERMS_KEY_PREFIX}${address.toLowerCase()}`);

    return NextResponse.json({
      hasAccepted: !!record,
      address,
      record: record ? (typeof record === 'string' ? JSON.parse(record) : record) : null,
    });
  } catch (error: any) {
    console.error('[Terms] Failed to check acceptance:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
