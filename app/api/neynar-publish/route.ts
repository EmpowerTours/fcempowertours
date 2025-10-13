import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { NextRequest, NextResponse } from 'next/server';

const config = new Configuration({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      'x-neynar-experimental': 'true',
    },
  },
});

const neynar = new NeynarAPIClient(config);

export async function POST(request: NextRequest) {
  try {
    const { text, fid } = await request.json();
    const response = await neynar.publishCast({
      fid: Number(fid),
      text: String(text),
    });
    return NextResponse.json({ success: true, hash: response.result.hash });
  } catch (error) {
    console.error('Neynar publishCast error:', error);
    return NextResponse.json({ error: 'Publish failed' }, { status: 500 });
  }
}
