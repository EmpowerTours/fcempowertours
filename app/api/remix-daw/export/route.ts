import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const EC2_API = process.env.REMIX_DAW_EC2_URL || 'http://18.190.218.92:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ec2Res = await fetch(`${EC2_API}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!ec2Res.ok) {
      const err = await ec2Res.text();
      console.error('[RemixDAW/export] EC2 error:', err);
      return NextResponse.json(
        { error: `Export failed: ${err}` },
        { status: ec2Res.status }
      );
    }

    const data = await ec2Res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[RemixDAW/export] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
