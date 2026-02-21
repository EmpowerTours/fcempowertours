import { NextRequest, NextResponse } from 'next/server';

const EC2_API = process.env.REMIX_DAW_EC2_URL || 'http://18.190.218.92:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ec2Res = await fetch(`${EC2_API}/separate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Stem separation can take up to 3 minutes on GPU
      signal: AbortSignal.timeout(300_000),
    });

    if (!ec2Res.ok) {
      const err = await ec2Res.text();
      console.error('[RemixDAW/separate] EC2 error:', err);
      return NextResponse.json(
        { error: `Stem separation failed: ${err}` },
        { status: ec2Res.status }
      );
    }

    const data = await ec2Res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[RemixDAW/separate] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
