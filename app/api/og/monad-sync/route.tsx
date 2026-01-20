import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const MONAD_TIERS: Record<string, { emoji: string; color: string; gradient: string }> = {
  'Dominant Monad': {
    emoji: '👑',
    color: '#FF6B00',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #FF6B00 100%)'
  },
  'Rational Monad': {
    emoji: '🧠',
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #60A5FA 0%, #EC4899 100%)'
  },
  'Sensitive Monad': {
    emoji: '🌸',
    color: '#EC4899',
    gradient: 'linear-gradient(135deg, #FBCFE8 0%, #FCA5A5 100%)'
  },
  'Bare Monad': {
    emoji: '🌑',
    color: '#6B7280',
    gradient: 'linear-gradient(135deg, #9CA3AF 0%, #374151 100%)'
  }
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get('fid') || '???';
    const clarity = searchParams.get('clarity') || '??';
    const tier = searchParams.get('tier') || 'Unknown Monad';

    const tierInfo = MONAD_TIERS[tier] || MONAD_TIERS['Bare Monad'];

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
            background: 'linear-gradient(135deg, #1a0033 0%, #000000 100%)',
            padding: '80px',
            position: 'relative'
          }}
        >
          {/* Decorative circles */}
          <div
            style={{
              position: 'absolute',
              width: '600px',
              height: '600px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${tierInfo.color}40 0%, transparent 70%)`,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          />

          {/* Main content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 1
            }}
          >
            {/* Tier emoji */}
            <div
              style={{
                fontSize: '160px',
                marginBottom: '40px'
              }}
            >
              {tierInfo.emoji}
            </div>

            {/* Clarity score */}
            <div
              style={{
                fontSize: '120px',
                fontWeight: 'bold',
                background: tierInfo.gradient,
                backgroundClip: 'text',
                color: 'transparent',
                marginBottom: '20px'
              }}
            >
              {clarity}%
            </div>

            {/* Tier name */}
            <div
              style={{
                fontSize: '48px',
                fontWeight: 'bold',
                color: tierInfo.color,
                marginBottom: '60px',
                textAlign: 'center'
              }}
            >
              {tier}
            </div>

            {/* Bottom text */}
            <div
              style={{
                fontSize: '32px',
                color: '#888',
                textAlign: 'center',
                marginTop: '40px'
              }}
            >
              MONAD SYNC × FARCASTER
            </div>

            <div
              style={{
                fontSize: '24px',
                color: '#666',
                textAlign: 'center',
                marginTop: '20px'
              }}
            >
              Perception Clarity Score
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error: any) {
    console.error('OG Image generation error:', error);
    return new Response(`Failed to generate image: ${error.message}`, {
      status: 500,
    });
  }
}
