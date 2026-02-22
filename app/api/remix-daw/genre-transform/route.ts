import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — Demucs + MusicGen + mix
export const dynamic = 'force-dynamic';

const EC2_API = process.env.REMIX_DAW_EC2_URL || 'http://18.190.218.92:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.audioUrl || !body.genre) {
      return NextResponse.json({ error: 'audioUrl and genre are required' }, { status: 400 });
    }

    console.log('[RemixDAW/genre-transform] Starting:', {
      genre: body.genre,
      audioUrl: body.audioUrl?.substring(0, 80),
      tokenId: body.tokenId,
    });

    // Genre transform: Demucs separation + MusicGen instrumental generation
    // Can take 3-5 minutes via Replicate
    const ec2Res = await fetch(`${EC2_API}/genre-transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(360_000),
    });

    if (!ec2Res.ok) {
      let errMsg: string;
      try {
        const errJson = await ec2Res.json();
        errMsg = errJson.detail || errJson.error || JSON.stringify(errJson);
      } catch {
        errMsg = await ec2Res.text();
      }
      console.error('[RemixDAW/genre-transform] EC2 error:', ec2Res.status, errMsg);
      return NextResponse.json(
        { error: `Genre transform failed: ${errMsg}` },
        { status: ec2Res.status }
      );
    }

    const data = await ec2Res.json();
    console.log('[RemixDAW/genre-transform] Success:', data.jobId);
    return NextResponse.json(data);
  } catch (error: any) {
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    console.error('[RemixDAW/genre-transform] Error:', {
      name: error.name,
      message: error.message,
      isTimeout,
    });
    return NextResponse.json(
      {
        error: isTimeout
          ? 'Genre transform timed out. The song may be too long — try a shorter track.'
          : (error.message || 'Internal server error'),
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
