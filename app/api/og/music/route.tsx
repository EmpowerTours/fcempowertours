import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

// Helper function to fetch metadata from IPFS
async function fetchMetadata(tokenURI: string) {
  try {
    // Convert ipfs:// to https://
    let metadataUrl = tokenURI;
    if (tokenURI.startsWith('ipfs://')) {
      const cid = tokenURI.replace('ipfs://', '');
      metadataUrl = `https://${PINATA_GATEWAY}/ipfs/${cid}`;
    }
    
    console.log('📥 Fetching metadata from:', metadataUrl);
    
    const response = await fetch(metadataUrl, { 
      cache: 'no-store',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.status}`);
    }
    
    const metadata = await response.json();
    console.log('✅ Metadata fetched:', {
      name: metadata.name,
      hasImage: !!metadata.image,
      imageUrl: metadata.image
    });
    
    return metadata;
  } catch (error) {
    console.error('❌ Error fetching metadata:', error);
    return null;
  }
}

// Helper function to convert IPFS image URL to HTTP
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
    const artist = searchParams.get('artist');
    const songTitle = searchParams.get('song');

    console.log('🎨 Generating OG image with params:', { tokenId, artist, songTitle });

    // ✅ NEW: If tokenId provided, fetch full metadata including cover art
    if (tokenId) {
      try {
        console.log('🔍 Querying Envio for token metadata...');
        
        // Query Envio indexer for full NFT metadata
        const query = `
          query GetMusicNFT($tokenId: String!) {
            MusicNFT(where: {tokenId: {_eq: $tokenId}}, limit: 1) {
              id
              tokenId
              songTitle
              artist
              price
              tokenURI
            }
          }
        `;
        
        const envioResponse = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            variables: { tokenId }
          }),
          cache: 'no-store'
        });

        if (envioResponse.ok) {
          const envioData = await envioResponse.json();
          const musicNFT = envioData.data?.MusicNFT?.[0];
          
          if (musicNFT) {
            console.log('✅ Found music NFT:', musicNFT);
            
            // Fetch metadata from IPFS to get cover art
            const metadata = await fetchMetadata(musicNFT.tokenURI);
            
            if (metadata && metadata.image) {
              const coverArtUrl = getImageUrl(metadata.image);
              console.log('🎨 Using cover art:', coverArtUrl);
              
              // ✅ NEW: Generate OG image WITH cover art
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
                        src={coverArtUrl}
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
                        {musicNFT.songTitle || 'Untitled'}
                      </div>
                      
                      {/* Artist */}
                      <div
                        style={{
                          fontSize: 32,
                          opacity: 0.8,
                          marginBottom: 30,
                        }}
                      >
                        {musicNFT.artist.slice(0, 6)}...{musicNFT.artist.slice(-4)}
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
                        Token #{tokenId}
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
                        {musicNFT.price} TOURS
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
          }
        }
      } catch (error) {
        console.error('❌ Error generating OG image with cover art:', error);
        // Fall through to default image
      }
    }

    // If specific song/artist provided (but no cover art available)
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
            {/* Music Icon */}
            <div style={{ display: 'flex', fontSize: 100, marginBottom: 30 }}>
              🎵
            </div>
            
            {/* Song Title */}
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
            
            {/* Artist */}
            <div
              style={{
                fontSize: 40,
                opacity: 0.8,
                marginBottom: 30,
              }}
            >
              By {artist.slice(0, 6)}...{artist.slice(-4)}
            </div>

            {/* Token Badge */}
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
            
            {/* CTA */}
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
