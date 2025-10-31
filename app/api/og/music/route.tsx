import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

const ogCache = new Map<string, { data: any; expiry: number }>();

function getImageUrl(ipfsUrl: string): string {
  if (!ipfsUrl) return '';
  if (ipfsUrl.startsWith('http')) return ipfsUrl;
  if (ipfsUrl.startsWith('ipfs://')) {
    const cid = ipfsUrl.replace('ipfs://', '');
    return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  }
  return ipfsUrl;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');
    const directImageUrl = searchParams.get('imageUrl');  // ✅ From bot

    console.log('🎨 OG Request:', {
      tokenId,
      hasDirect: !!directImageUrl,
    });

    let musicData: any = null;

    // ✅ PRIORITY 1: Direct imageUrl from bot (fresh mint - no indexer delay!)
    if (directImageUrl) {
      console.log('✅ Using direct imageUrl from bot');
      const imageUrl = getImageUrl(directImageUrl);
      musicData = {
        tokenId: tokenId || '0',
        songTitle: 'New Release',
        coverImageUrl: imageUrl,
        price: '0',
        artist: 'Artist'
      };
    }
    // PRIORITY 2: Check cache
    else if (tokenId) {
      const cached = ogCache.get(`music:${tokenId}`);
      if (cached && cached.expiry > Date.now()) {
        console.log('✅ Using cached OG data');
        musicData = cached.data;
      }
      // PRIORITY 3: Query Envio (fallback for old mints)
      else {
        console.log('🔍 Querying Envio for token:', tokenId);
        try {
          const query = `
            query GetMusicNFT($tokenId: String!) {
              MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
                tokenId
                name
                imageUrl
                price
                artist
              }
            }
          `;

          const response = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { tokenId } }),
            cache: 'no-store'
          });

          if (response.ok) {
            const data = await response.json();
            const nft = data.data?.MusicNFT?.[0];
            if (nft) {
              musicData = {
                tokenId: nft.tokenId,
                songTitle: nft.name,
                coverImageUrl: nft.imageUrl,
                price: nft.price,
                artist: nft.artist
              };
              ogCache.set(`music:${tokenId}`, {
                data: musicData,
                expiry: Date.now() + 5 * 60 * 1000
              });
              console.log('✅ Got from Envio and cached');
            }
          }
        } catch (err: any) {
          console.error('❌ Envio query failed:', err.message);
        }
      }
    }

    // ✅ RENDER: Full layout with cover art
    if (musicData?.coverImageUrl) {
      const imageUrl = getImageUrl(musicData.coverImageUrl);
      console.log('🎨 Rendering with cover art:', imageUrl.substring(0, 80) + '...');

      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'row',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Cover Art - Left Side (50%) */}
            <div
              style={{
                width: '50%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundImage: `url('${imageUrl}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            >
              {/* Empty flex container - required by next/og */}
            </div>

            {/* Song Info - Right Side (50%) */}
            <div
              style={{
                width: '50%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '80px 60px',
                color: 'white',
              }}
            >
              {/* Music Icon */}
              <div style={{ fontSize: 80, marginBottom: 20, display: 'flex' }}>
                🎵
              </div>

              {/* Song Title */}
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 'bold',
                  marginBottom: 20,
                  lineHeight: 1.2,
                  maxWidth: '90%',
                  display: 'flex',
                }}
              >
                {musicData.songTitle}
              </div>

              {/* Artist */}
              <div
                style={{
                  fontSize: 32,
                  opacity: 0.8,
                  marginBottom: 30,
                  display: 'flex',
                }}
              >
                {musicData.artist && musicData.artist.length > 10
                  ? `${musicData.artist.slice(0, 6)}...${musicData.artist.slice(-4)}`
                  : musicData.artist || 'Artist'}
              </div>

              {/* Token Badge */}
              <div
                style={{
                  fontSize: 28,
                  background: 'rgba(124, 58, 237, 0.3)',
                  padding: '12px 30px',
                  borderRadius: '20px',
                  border: '2px solid rgba(124, 58, 237, 0.5)',
                  marginBottom: 30,
                  display: 'flex',
                }}
              >
                Token #{musicData.tokenId}
              </div>

              {/* Price */}
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 'bold',
                  color: '#00d4ff',
                  marginBottom: 20,
                  display: 'flex',
                }}
              >
                {musicData.price} TOURS
              </div>

              {/* CTA */}
              <div
                style={{
                  fontSize: 24,
                  opacity: 0.7,
                  display: 'flex',
                }}
              >
                🎧 License on EmpowerTours
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

    // ✅ FALLBACK: Simple gradient (no cover art)
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 60,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
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
          <div style={{ fontSize: 120, marginBottom: 30, display: 'flex' }}>🎵</div>

          <div
            style={{
              fontSize: 70,
              fontWeight: 'bold',
              marginBottom: 20,
              textAlign: 'center',
              display: 'flex',
            }}
          >
            EmpowerTours Music
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
            Mint & License Music NFTs on Monad
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
            <span style={{ display: 'flex' }}>🎸 Artist Owned</span>
            <span style={{ display: 'flex' }}>•</span>
            <span style={{ display: 'flex' }}>💎 90/10 Split</span>
            <span style={{ display: 'flex' }}>•</span>
            <span style={{ display: 'flex' }}>⚡ Gasless</span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    console.error('🔴 OG generation error:', e.message);
    return new Response('Failed to generate image', { status: 500 });
  }
}
