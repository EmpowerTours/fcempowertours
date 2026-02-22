import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — XTTS synthesis is slow (14+ lines)
export const dynamic = 'force-dynamic';

const EC2_API = process.env.REMIX_DAW_EC2_URL || 'http://18.190.218.92:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.jobId || !body.lyrics?.trim()) {
      return NextResponse.json(
        { error: 'jobId and lyrics are required' },
        { status: 400 }
      );
    }

    // XTTS synthesis + beat alignment can take several minutes on GPU
    const ec2Res = await fetch(`${EC2_API}/vocal-synth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(480_000), // 8 min max
    });

    if (!ec2Res.ok) {
      const err = await ec2Res.text();
      console.error('[EmpowerStudio/vocal-synth] EC2 error:', err);
      return NextResponse.json(
        { error: `Vocal synthesis failed: ${err}` },
        { status: ec2Res.status }
      );
    }

    const data = await ec2Res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[EmpowerStudio/vocal-synth] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
