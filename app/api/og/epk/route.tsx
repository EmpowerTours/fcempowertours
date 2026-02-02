import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

/**
 * GET /api/og/epk?name=...&genre=...&location=...&verified=true
 * Generates a 1200x630 OG image for EPK sharing
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get('name') || 'Artist';
  const genre = searchParams.get('genre') || 'Music';
  const location = searchParams.get('location') || '';
  const verified = searchParams.get('verified') === 'true';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '60px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 70%, #0f172a 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top badge */}
        <div
          style={{
            position: 'absolute',
            top: '40px',
            right: '60px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {verified && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '20px',
                padding: '8px 16px',
                fontSize: '16px',
                color: '#22c55e',
              }}
            >
              On-Chain Verified
            </div>
          )}
        </div>

        {/* EmpowerTours branding */}
        <div
          style={{
            position: 'absolute',
            top: '40px',
            left: '60px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '18px',
            color: '#a78bfa',
            fontWeight: 'bold',
          }}
        >
          EmpowerTours
        </div>

        {/* Artist name */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 'bold',
            color: '#ffffff',
            lineHeight: 1.1,
            marginBottom: '16px',
          }}
        >
          {name}
        </div>

        {/* Genre pills */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          {genre.split(',').map((g, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(167, 139, 250, 0.15)',
                border: '1px solid rgba(167, 139, 250, 0.3)',
                borderRadius: '20px',
                padding: '8px 20px',
                fontSize: '18px',
                color: '#a78bfa',
              }}
            >
              {g.trim()}
            </div>
          ))}
        </div>

        {/* Location */}
        {location && (
          <div style={{ fontSize: '20px', color: '#94a3b8', marginBottom: '8px' }}>
            {location}
          </div>
        )}

        {/* CTA */}
        <div
          style={{
            fontSize: '20px',
            color: '#64748b',
            marginTop: '8px',
          }}
        >
          Electronic Press Kit | Contact for rates
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
