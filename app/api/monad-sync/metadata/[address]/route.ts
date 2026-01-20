import { NextRequest, NextResponse } from 'next/server';

const MONAD_TIERS: Record<string, { emoji: string; color: string }> = {
  'Dominant Monad': { emoji: '👑', color: '#FF6B00' },
  'Rational Monad': { emoji: '🧠', color: '#8B5CF6' },
  'Sensitive Monad': { emoji: '🌸', color: '#EC4899' },
  'Bare Monad': { emoji: '🌑', color: '#6B7280' }
};

function generateMonadMirrorSVG(clarity: number, tier: string, address: string): string {
  const tierInfo = MONAD_TIERS[tier] || MONAD_TIERS['Bare Monad'];

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
      <defs>
        <radialGradient id="bgGradient">
          <stop offset="0%" style="stop-color:#1a0033;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
        </radialGradient>
        <radialGradient id="monadGlow">
          <stop offset="0%" style="stop-color:${tierInfo.color};stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:${tierInfo.color};stop-opacity:0" />
        </radialGradient>
      </defs>

      <!-- Background -->
      <rect width="800" height="800" fill="url(#bgGradient)"/>

      <!-- Monad Circle Glow -->
      <circle cx="400" cy="320" r="200" fill="url(#monadGlow)" opacity="0.3"/>

      <!-- Monad Circle -->
      <circle cx="400" cy="320" r="150" fill="none" stroke="${tierInfo.color}" stroke-width="4" opacity="0.8"/>
      <circle cx="400" cy="320" r="130" fill="none" stroke="${tierInfo.color}" stroke-width="2" opacity="0.5"/>
      <circle cx="400" cy="320" r="110" fill="none" stroke="${tierInfo.color}" stroke-width="1" opacity="0.3"/>

      <!-- Clarity Score -->
      <text x="400" y="340" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle">
        ${clarity.toFixed(1)}%
      </text>

      <!-- Tier Name -->
      <text x="400" y="520" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="${tierInfo.color}" text-anchor="middle">
        ${tier}
      </text>

      <!-- Address -->
      <text x="400" y="580" font-family="monospace" font-size="20" fill="#888" text-anchor="middle">
        ${address.slice(0, 6)}...${address.slice(-4)}
      </text>

      <!-- Decorative Elements -->
      <circle cx="400" cy="320" r="8" fill="${tierInfo.color}"/>

      <!-- Monad Sync Label -->
      <text x="400" y="680" font-family="Arial, sans-serif" font-size="24" fill="#666" text-anchor="middle">
        MONAD SYNC × FARCASTER
      </text>

      <!-- Perception Clarity Label -->
      <text x="400" y="720" font-family="Arial, sans-serif" font-size="18" fill="#555" text-anchor="middle">
        Perception Clarity Score
      </text>
    </svg>
  `;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const { searchParams } = new URL(req.url);
    const clarity = parseFloat(searchParams.get('clarity') || '50');
    const tier = searchParams.get('tier') || 'Bare Monad';

    // Check if requesting SVG or JSON metadata
    const format = searchParams.get('format');

    if (format === 'svg') {
      const svg = generateMonadMirrorSVG(clarity, tier, address);
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // Return JSON metadata
    const metadata = {
      name: `Monad Mirror #${address.slice(-6)}`,
      description: `Your eternal monad signature on Farcaster × Monad Blockchain. Windowless, yet the universe reflects within. Clarity: ${clarity.toFixed(1)}% | Tier: ${tier}`,
      image: `https://fcempowertours.xyz/api/monad-sync/metadata/${address}?format=svg&clarity=${clarity}&tier=${encodeURIComponent(tier)}`,
      attributes: [
        { trait_type: 'Monad Tier', value: tier },
        { trait_type: 'Perception Clarity', value: clarity, display_type: 'number', max_value: 100 },
        { trait_type: 'Pre-Established Harmony', value: Math.floor(clarity * 4.2) },
        { trait_type: 'Chain', value: 'Monad' }
      ],
      chain: 'monad',
      external_url: `https://fcempowertours.xyz/monad-sync?address=${address}`
    };

    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error: any) {
    console.error('❌ Metadata generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Metadata generation failed' },
      { status: 500 }
    );
  }
}
