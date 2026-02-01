import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: 'white',
          }}
        >
          <div style={{ fontSize: 120, marginBottom: 20, display: 'flex' }}>
            🎧
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 'bold',
              marginBottom: 16,
              display: 'flex',
            }}
          >
            EmpowerTours
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: '#00d4ff',
              marginBottom: 30,
              display: 'flex',
            }}
          >
            Live Radio
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 24,
              fontSize: 28,
              opacity: 0.8,
            }}
          >
            <span style={{ display: 'flex' }}>🎵 Music NFTs</span>
            <span style={{ display: 'flex' }}>•</span>
            <span style={{ display: 'flex' }}>🎲 Skip to Random</span>
            <span style={{ display: 'flex' }}>•</span>
            <span style={{ display: 'flex' }}>🎤 Voice Notes</span>
          </div>
          <div
            style={{
              fontSize: 24,
              opacity: 0.6,
              marginTop: 30,
              display: 'flex',
            }}
          >
            Powered by Monad
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    console.error('OG Radio image error:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
