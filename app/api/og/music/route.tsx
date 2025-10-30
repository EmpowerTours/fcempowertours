import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

// Cache for OG data
const ogCache = new Map<string, { data: any; expiry: number }>();

function getImageUrl(ipfsUrl: string): string {
  if (!ipfsUrl) return '';
  if (ipfsUrl.startsWith('http')) return ipfsUrl; // ✅ Already a full URL
  if (ipfsUrl.startsWith('ipfs://')) {
    const cid = ipfsUrl.replace('ipfs://', '');
    return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  }
  return ipfsUrl;
}

async function fetchMetadataFromIPFS(metadataUrl: string) {
  try {
    const httpUrl = getImageUrl(metadataUrl);
    console.log('📥 Fetching metadata from:', httpUrl);

    const response = await fetch(httpUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`⚠️ Metadata fetch returned ${response.status}`);
      return null;
    }

    const metadata = await response.json();
    console.log('✅ Metadata fetched:', {
      name: metadata.name,
      hasImage: !!metadata.image
    });

    return metadata;
  } catch (error: any) {
    console.error('❌ Error fetching metadata:', error.message);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    // ✅ Direct params from bot
    const directImageUrl = searchParams.get('imageUrl');  // ✅ NOW: This is the DIRECT image URL, not metadata!
    const directSongTitle = searchParams.get('songTitle');
    const directPrice = searchParams.get('price');
    const artist = searchParams.get('artist');
    const song = searchParams.get('song');

    console.log('🎨 OG Request:', {
      tokenId,
      hasDirect: !!directImageUrl,
      songTitle: directSongTitle,
      isDirectImage: directImageUrl?.startsWith('http') || directImageUrl?.startsWith('ipfs://')
    });

    let musicData: any = null;

    // ✅ PRIORITY 1: Direct params from bot (fresh mint)
    if (directImageUrl && directSongTitle) {
      console.log('✅ Using direct params - image URL provided by bot');
      
      // ✅ FIXED: directImageUrl IS the image URL, not metadata!
      const imageUrl = getImageUrl(directImageUrl);
      
      musicData = {
        tokenId: tokenId || '0',
        songTitle: directSongTitle,
        coverImageUrl: imageUrl,  // ✅ Direct image, not fetched metadata
        price: directPrice || '0',
        artist: artist || 'Artist'
      };
      console.log('✅ Using direct image URL:', imageUrl.substring(0, 80) + '...');
    }
    // ✅ PRIORITY 2: Check cache
    else if (tokenId) {
      const cached = ogCache.get(`music:${tokenId}`);
      if (cached && cached.expiry > Date.now()) {
        console.log('✅ Using cached OG data');
        musicData = cached.data;
      }
      // ✅ PRIORITY 3: Query Envio
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
              // Cache for 5 minutes
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

    // ✅ RENDER WITH COVER ART
    if (musicData) {
      const imageUrl = getImageUrl(musicData.coverImageUrl);
      console.log('🎨 Rendering with cover art:', imageUrl.substring(0, 80) + '...');

      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              fontFamily: 'system-ui',
            }}
          >
            {/* Cover Art on Left */}
            <div
              style={{
                width: '50%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px',
              }}
            >
              <img
                src={imageUrl}
                alt="Cover Art"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '20px',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}
              />
            </div>

            {/* Song Details on Right */}
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
              <div style={{ fontSize: 80, marginBottom: 20 }}>
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
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
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
                }}
              >
                {musicData.price} TOURS
              </div>

              {/* CTA */}
              <div
                style={{
                  fontSize: 24,
                  opacity: 0.7,
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

    // Fallback: Generic song preview (old format)
    const songTitle = song || directSongTitle;
    if (songTitle && artist) {
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
              fontFamily: 'system-ui',
              padding: '60px',
            }}
          >
            <div style={{ display: 'flex', fontSize: 100, marginBottom: 30 }}>
              🎵
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 64,
                fontWeight: 'bold',
                marginBottom: 20,
                textAlign: 'center',
                maxWidth: '1000px',
              }}
            >
              {songTitle}
            </div>

            <div
              style={{
                fontSize: 40,
                opacity: 0.8,
                marginBottom: 30,
              }}
            >
              By {artist.length > 10 ? `${artist.slice(0, 6)}...${artist.slice(-4)}` : artist}
            </div>

            {tokenId && (
              <div
                style={{
                  fontSize: 32,
                  opacity: 0.7,
                  background: 'rgba(124, 58, 237, 0.3)',
                  padding: '12px 30px',
                  borderRadius: '20px',
                  border: '2px solid rgba(124, 58, 237, 0.5)',
                }}
              >
                Token #{tokenId}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                fontSize: 32,
                opacity: 0.9,
                marginTop: 50,
              }}
            >
              🎧 License this track on EmpowerTours
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      );
    }

    // Default music page OG image
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
            fontFamily: 'system-ui',
          }}
        >
          <div style={{ display: 'flex', fontSize: 120, marginBottom: 30 }}>
            🎵
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 70,
              fontWeight: 'bold',
              marginBottom: 20,
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
            }}
          >
            Mint & License Music NFTs on Monad
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 28,
              opacity: 0.7,
              marginTop: 40,
              gap: 20,
            }}
          >
            <span>🎸 Artist Owned</span>
            <span>•</span>
            <span>💎 90/10 Split</span>
            <span>•</span>
            <span>⚡ Gasless</span>
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
