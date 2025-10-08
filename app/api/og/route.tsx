import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || 'EmpowerTours';
    const description = searchParams.get('description') || 'Mint and share Travel and Music NFTs!';
    const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1200px',
            height: '630px',
            background: 'linear-gradient(180deg, #00A55E, #1E90FF)',
            color: '#FFFFFF',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${appUrl}/images/feed.png`}
            alt="EmpowerTours Feed"
            style={{ width: '600px', height: '400px', objectFit: 'cover', borderRadius: '16px' }}
          />
          <h1 style={{ fontSize: '48px', fontWeight: 'bold', margin: '20px 0' }}>{title}</h1>
          <p style={{ fontSize: '24px', textAlign: 'center', maxWidth: '800px' }}>{description}</p>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('OG Image Error:', error);
    return new Response('Failed to generate OG image', { status: 500 });
  }
}
