import { NextRequest, NextResponse } from 'next/server';
import { requireUserProof } from '@/lib/require-user-proof';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TERMS_KEY_PREFIX = 'terms:accepted:';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { timestamp, version } = body;

    if (!body.address || !timestamp) {
      return NextResponse.json(
        { error: 'Address and timestamp required' },
        { status: 400 }
      );
    }

    const proof = await requireUserProof(request, body.address, "terms-accept");
    if (!proof.ok) return proof.response;
    const address = proof.address;

    // IP / UA kept server-side for compliance only — never returned to clients.
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    const acceptanceRecord = {
      address,
      timestamp,
      version: version || '1.0',
      ip,
      userAgent,
      acceptedAt: new Date().toISOString(),
    };

    // Store in Redis
    await redis.set(
      `${TERMS_KEY_PREFIX}${address}`,
      JSON.stringify(acceptanceRecord)
    );

    console.log('[Terms] Acceptance recorded:', address);

    return NextResponse.json({
      success: true,
      message: 'Terms acceptance recorded',
      record: {
        address,
        timestamp,
        version: acceptanceRecord.version,
        acceptedAt: acceptanceRecord.acceptedAt,
      },
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

    const raw = await redis.get<string>(`${TERMS_KEY_PREFIX}${address.toLowerCase()}`);
    let publicRecord: {
      address: string;
      timestamp?: unknown;
      version?: string;
      acceptedAt?: string;
    } | null = null;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      // Strip IP / userAgent — those are compliance-only, not for the client.
      publicRecord = {
        address: parsed.address,
        timestamp: parsed.timestamp,
        version: parsed.version,
        acceptedAt: parsed.acceptedAt,
      };
    }

    return NextResponse.json({
      hasAccepted: !!publicRecord,
      address,
      record: publicRecord,
    });
  } catch (error: any) {
    console.error('[Terms] Failed to check acceptance:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
