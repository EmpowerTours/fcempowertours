import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { NextResponse } from 'next/server';

const config = new Configuration({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      'x-neynar-experimental': 'true',
    },
  },
});

const neynar = new NeynarAPIClient(config);

export async function GET() {
  try {
    // Example: Fetch recent casts
    const casts = await neynar.fetchGlobalFeed({ limit: 5 });
    return NextResponse.json({ casts: casts.result.casts || [] });
  } catch (error) {
    console.error('Neynar error:', error);
    return NextResponse.json({ error: 'Neynar error' }, { status: 500 });
  }
}
