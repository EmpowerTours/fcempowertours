import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';

interface PassportData {
  tokenId: string;
  countryCode: string;
  countryName: string;
  region: string;
  continent: string;
  owner: string;
}

// Simple in-memory cache
const ogCache = new Map<string, { data: PassportData; expiry: number }>();

// Get flag emoji from country code
function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

async function getPassportData(tokenId: string): Promise<PassportData | null> {
  // Check cache first
  const cached = ogCache.get(`passport:${tokenId}`);
  if (cached && cached.expiry > Date.now()) {
    console.log('✅ Using cached passport data');
    return cached.data;
  }

  try {
    console.log('🔍 Querying Envio for passport:', tokenId);

    const query = `
      query GetPassport($tokenId: String!) {
        PassportNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
          tokenId
          countryCode
          countryName
          region
          continent
          owner
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { tokenId }
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error('❌ Envio query failed:', response.status);
      return null;
    }

    const data = await response.json();
    const passport = data.data?.PassportNFT?.[0];

    if (passport) {
      console.log('✅ Found passport in Envio:', passport);

      // Cache for 5 minutes
      ogCache.set(`passport:${tokenId}`, {
        data: passport,
        expiry: Date.now() + 5 * 60 * 1000
      });

      return passport;
    }

    console.log('⚠️ Passport not found in Envio');
    return null;
  } catch (err: any) {
    console.error('❌ Error fetching passport data:', err.message);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    console.log('🎨 Passport OG Request for token:', tokenId);

    if (!tokenId) {
      return generateDefaultPassportImage();
    }

    const passportData = await getPassportData(tokenId);

    if (passportData) {
      return generatePassportImage(passportData);
    }

    // Fallback to default image if passport not found
    return generateDefaultPassportImage();
  } catch (e: any) {
    console.error('🔴 Passport OG generation error:', e.message);
    return new Response('Failed to generate image', { status: 500 });
  }
}

function generatePassportImage(passport: PassportData) {
  const flag = getFlagEmoji(passport.countryCode);
  const countryName = passport.countryName || 'Unknown';
  const region = passport.region || 'Unknown Region';
  const continent = passport.continent || 'Unknown';
  const tokenId = passport.tokenId || '0';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '60px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '10px',
              display: 'flex',
            }}
          >
            🌍 EMPOWER TOURS
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#e0f2fe',
              display: 'flex',
            }}
          >
            Digital Passport
          </div>
        </div>

        {/* Main Content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(30, 64, 175, 0.3)',
            borderRadius: '20px',
            padding: '60px',
            border: '4px solid rgba(96, 165, 250, 0.5)',
          }}
        >
          {/* Flag */}
          <div
            style={{
              fontSize: 180,
              marginBottom: '40px',
              display: 'flex',
            }}
          >
            {flag}
          </div>

          {/* Country Name */}
          <div
            style={{
              fontSize: countryName.length > 15 ? 48 : 56,
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '20px',
              textAlign: 'center',
              display: 'flex',
            }}
          >
            {countryName.toUpperCase()}
          </div>

          {/* Country Code */}
          <div
            style={{
              fontSize: 32,
              color: '#93c5fd',
              marginBottom: '10px',
              display: 'flex',
            }}
          >
            {passport.countryCode}
          </div>

          {/* Region */}
          <div
            style={{
              fontSize: 24,
              color: '#60a5fa',
              display: 'flex',
            }}
          >
            {region}
          </div>
        </div>

        {/* Footer Info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '40px',
            padding: '20px 30px',
            background: 'rgba(30, 64, 175, 0.3)',
            borderRadius: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 20,
                color: '#93c5fd',
                marginBottom: '5px',
                display: 'flex',
              }}
            >
              Token #{tokenId}
            </div>
            <div
              style={{
                fontSize: 16,
                color: '#60a5fa',
                display: 'flex',
              }}
            >
              {continent} • Stakeable NFT
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                fontSize: 18,
                color: '#10b981',
                fontWeight: 'bold',
                display: 'flex',
              }}
            >
              ⚡ STAKEABLE
            </div>
            <div
              style={{
                fontSize: 14,
                color: '#d1fae5',
                display: 'flex',
              }}
            >
              Earn Rewards • Build Credit
            </div>
          </div>
        </div>

        {/* Stamp Badge */}
        <div
          style={{
            position: 'absolute',
            top: '80px',
            right: '80px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '120px',
            height: '120px',
            border: '6px solid #ef4444',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: '#ef4444',
              textAlign: 'center',
              display: 'flex',
            }}
          >
            PASSPORT
          </div>
          <div
            style={{
              fontSize: 16,
              color: '#ef4444',
              display: 'flex',
            }}
          >
            #{tokenId}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}

function generateDefaultPassportImage() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 60,
          background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ fontSize: 120, marginBottom: 30, display: 'flex' }}>🌍</div>

        <div
          style={{
            fontSize: 70,
            fontWeight: 'bold',
            marginBottom: 20,
            display: 'flex',
          }}
        >
          EmpowerTours Passport
        </div>

        <div
          style={{
            fontSize: 36,
            opacity: 0.9,
            textAlign: 'center',
            maxWidth: '900px',
            display: 'flex',
          }}
        >
          Collect. Stake. Earn Rewards.
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            opacity: 0.7,
            marginTop: 40,
            gap: 20,
          }}
        >
          <span style={{ display: 'flex' }}>🎫 195 Countries</span>
          <span style={{ display: 'flex' }}>•</span>
          <span style={{ display: 'flex' }}>💎 Stakeable</span>
          <span style={{ display: 'flex' }}>•</span>
          <span style={{ display: 'flex' }}>⚡ Free Mint</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
