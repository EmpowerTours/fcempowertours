import { NextRequest, NextResponse } from 'next/server';

const EC2_API = process.env.REMIX_DAW_EC2_URL || 'http://18.190.218.92:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.audioUrl || !body.genre) {
      return NextResponse.json({ error: 'audioUrl and genre are required' }, { status: 400 });
    }

    // Genre transform: Demucs separation + MusicGen instrumental generation
    // Can take 3-5 minutes on GPU
    const ec2Res = await fetch(`${EC2_API}/genre-transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(360_000),
    });

    if (!ec2Res.ok) {
      const err = await ec2Res.text();
      console.error('[RemixDAW/genre-transform] EC2 error:', err);
      return NextResponse.json(
        { error: `Genre transform failed: ${err}` },
        { status: ec2Res.status }
      );
    }

    const data = await ec2Res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[RemixDAW/genre-transform] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
