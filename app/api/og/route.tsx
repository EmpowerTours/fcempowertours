import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 60,
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: 'system-ui',
          }}
        >
          <div style={{ display: 'flex', fontSize: 100, fontWeight: 'bold', marginBottom: 30 }}>
            🌍 EmpowerTours
          </div>
          <div style={{ fontSize: 45, opacity: 0.9, textAlign: 'center' }}>
            Digital Passport & Travel NFTs
          </div>
          <div style={{ fontSize: 32, opacity: 0.7, marginTop: 30 }}>
            Powered by Monad & Farcaster
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    console.error('OG Image generation error:', e);
    return new Response('Failed to generate OG image', { status: 500 });
  }
}
