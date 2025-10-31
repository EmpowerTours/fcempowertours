import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
const MONAD_RPC = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

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

// ✅ Helper: Convert price from wei (18 decimals) to readable TOURS
function convertPriceFromWei(price: string | number | bigint): string {
  try {
    const priceBI = BigInt(price);
    const priceNum = Number(priceBI) / 1e18;
    return priceNum.toString();
  } catch (e) {
    console.warn('Failed to convert price:', price);
    return String(price);
  }
}

// ✅ NEW: Look up FID from wallet address using Neynar
async function getFidFromWallet(walletAddress: string): Promise<string | null> {
  if (!NEYNAR_API_KEY) return null;
  
  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_verification?address=${walletAddress}`,
      {
        headers: { 'api_key': NEYNAR_API_KEY }
      }
    );
    
    if (response.ok) {
      const data: any = await response.json();
      if (data.users && data.users.length > 0) {
        const user = data.users[0];
        return user.username ? user.username : null;
      }
    }
  } catch (e) {
    console.error('❌ Failed to look up FID:', e);
  }
  
  return null;
}

// ✅ NEW: Query blockchain directly when Envio hasn't indexed yet
async function getMetadataFromBlockchain(tokenId: string): Promise<any | null> {
  try {
    console.log('🔗 Querying blockchain for token:', tokenId);
    
    const MUSIC_NFT_ADDRESS = '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6';
    
    // Call tokenURI on the contract
    const response = await fetch(MONAD_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: MUSIC_NFT_ADDRESS,
            data: `0xc87b56dd${BigInt(tokenId).toString(16).padStart(64, '0')}`
          },
          'latest'
        ]
      })
    });

    if (!response.ok) {
      console.log('⚠️ Blockchain query failed');
      return null;
    }

    const result: any = await response.json();
    if (!result.result || result.result === '0x') {
      console.log('⚠️ Token not found on blockchain');
      return null;
    }

    // Decode the URI from hex
    const decoded = Buffer.from(result.result.slice(2), 'hex').toString('utf8');
    const uriMatch = decoded.match(/ipfs:\/\/([A-Za-z0-9]+)/);
    
    if (!uriMatch) {
      console.log('⚠️ Could not extract IPFS URI');
      return null;
    }

    const ipfsUri = `ipfs://${uriMatch[1]}`;
    const metadataUrl = getImageUrl(ipfsUri);

    console.log('📥 Fetching metadata from IPFS:', metadataUrl);
    const metadataResponse = await fetch(metadataUrl);
    
    if (metadataResponse.ok) {
      const metadata = await metadataResponse.json();
      console.log('✅ Got metadata from blockchain IPFS');
      
      return {
        tokenId,
        name: metadata.name || 'New Release',
        imageUrl: metadata.image || '',
        price: metadata.price || '0',
        artist: metadata.artist || 'Artist'
      };
    }
  } catch (e: any) {
    console.error('❌ Blockchain query error:', e.message);
  }
  
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    console.log('🎨 OG Request for token:', tokenId);

    let musicData: any = null;

    if (tokenId) {
      // ✅ Check cache first
      const cached = ogCache.get(`music:${tokenId}`);
      if (cached && cached.expiry > Date.now()) {
        console.log('✅ Using cached OG data');
        musicData = cached.data;
      } else {
        // PRIORITY 1: Query Envio - CORRECTED: Use MusicNFT (singular)
        console.log('🔍 Querying Envio for token:', tokenId);
        try {
          const query = `
            query {
              MusicNFT(where: { tokenId: { _eq: "${tokenId}" } }, limit: 1) {
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
            body: JSON.stringify({ query }),
            cache: 'no-store'
          });

          if (response.ok) {
            const data = await response.json();
            // ✅ CORRECTED: MusicNFT returns array directly
            const nft = data.data?.MusicNFT?.[0];
            
            if (nft) {
              console.log('✅ Found in Envio:', nft);
              
              // ✅ Convert price from wei to readable TOURS
              const priceDisplay = convertPriceFromWei(nft.price || '0');
              
              // ✅ Look up FID for display
              let artistDisplay = nft.artist || 'Artist';
              if (nft.artist && nft.artist.startsWith('0x')) {
                const fid = await getFidFromWallet(nft.artist);
                if (fid) {
                  artistDisplay = `@${fid}`;
                  console.log('✅ Converted wallet to FID:', fid);
                }
              }
              
              musicData = {
                tokenId: nft.tokenId,
                name: nft.name || 'New Release',
                imageUrl: nft.imageUrl,
                price: priceDisplay,
                artist: artistDisplay
              };
              
              // Cache for 5 minutes
              ogCache.set(`music:${tokenId}`, {
                data: musicData,
                expiry: Date.now() + 5 * 60 * 1000
              });
              
              console.log('✅ Got from Envio and cached');
            } else {
              console.log('⚠️ Token not found in Envio, trying blockchain...');
              
              // PRIORITY 2: Fall back to blockchain
              const blockchainData = await getMetadataFromBlockchain(tokenId);
              if (blockchainData) {
                // ✅ Convert price from wei
                const priceDisplay = convertPriceFromWei(blockchainData.price || '0');
                
                // ✅ Look up FID for display
                let artistDisplay = blockchainData.artist || 'Artist';
                if (blockchainData.artist && blockchainData.artist.startsWith('0x')) {
                  const fid = await getFidFromWallet(blockchainData.artist);
                  if (fid) {
                    artistDisplay = `@${fid}`;
                    console.log('✅ Converted wallet to FID:', fid);
                  }
                }
                
                musicData = {
                  ...blockchainData,
                  price: priceDisplay,
                  artist: artistDisplay
                };
                
                // Cache
                ogCache.set(`music:${tokenId}`, {
                  data: musicData,
                  expiry: Date.now() + 5 * 60 * 1000
                });
                
                console.log('✅ Got from blockchain');
              }
            }
          }
        } catch (err: any) {
          console.error('❌ Envio query failed:', err.message);
          
          // Still try blockchain as fallback
          const blockchainData = await getMetadataFromBlockchain(tokenId);
          if (blockchainData) {
            const priceDisplay = convertPriceFromWei(blockchainData.price || '0');
            let artistDisplay = blockchainData.artist || 'Artist';
            if (blockchainData.artist && blockchainData.artist.startsWith('0x')) {
              const fid = await getFidFromWallet(blockchainData.artist);
              if (fid) {
                artistDisplay = `@${fid}`;
              }
            }
            
            musicData = {
              ...blockchainData,
              price: priceDisplay,
              artist: artistDisplay
            };
            
            ogCache.set(`music:${tokenId}`, {
              data: musicData,
              expiry: Date.now() + 5 * 60 * 1000
            });
          }
        }
      }
    }

    // ✅ RENDER: IMPROVED - Large cover art on top (60%), info on bottom (40%)
    if (musicData?.imageUrl) {
      const imageUrl = getImageUrl(musicData.imageUrl);
      console.log('🎨 Rendering with large cover art');

      const priceDisplay = musicData.price || '0';

      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: 'linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #0f3460 100%)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              position: 'relative',
            }}
          >
            {/* Cover Art - Top (60%) - MUCH LARGER! */}
            <div
              style={{
                width: '100%',
                height: '60%',
                backgroundImage: `url('${imageUrl}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                position: 'relative',
              }}
            >
              {/* Gradient overlay at bottom to fade into info */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '120px',
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(15,15,30,0.98))',
                }}
              />
            </div>

            {/* Song Info - Bottom (40%) */}
            <div
              style={{
                width: '100%',
                height: '40%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'flex-start',
                padding: '28px 50px 35px 50px',
                color: 'white',
                background: 'linear-gradient(135deg, rgba(15,15,30,0.98) 0%, rgba(22,33,62,0.98) 100%)',
                position: 'relative',
                boxSizing: 'border-box',
              }}
            >
              {/* Song Title */}
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 'bold',
                  marginBottom: 6,
                  lineHeight: 1.15,
                  maxWidth: '100%',
                  display: 'flex',
                  flexWrap: 'wrap',
                  color: '#ffffff',
                  letterSpacing: '-0.5px',
                }}
              >
                {musicData.name}
              </div>

              {/* Artist + Price Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '18px',
                  marginBottom: 10,
                  fontSize: 19,
                  width: '100%',
                  justifyContent: 'space-between',
                }}
              >
                {/* Artist (NOW SHOWS FID OR WALLET) */}
                <div
                  style={{
                    opacity: 0.85,
                    display: 'flex',
                    color: '#a0aec0',
                    fontStyle: 'italic',
                  }}
                >
                  {musicData.artist}
                </div>

                {/* Price */}
                <div
                  style={{
                    color: '#00d4ff',
                    fontWeight: 'bold',
                    fontSize: 24,
                    display: 'flex',
                  }}
                >
                  💰 {priceDisplay} TOURS
                </div>
              </div>

              {/* Bottom Row - Token Badge + CTA */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  width: '100%',
                  marginTop: 'auto',
                  justifyContent: 'space-between',
                }}
              >
                {/* Token Badge */}
                <div
                  style={{
                    fontSize: 15,
                    background: 'rgba(124, 58, 237, 0.4)',
                    padding: '5px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(124, 58, 237, 0.6)',
                    display: 'flex',
                    color: '#c4b5fd',
                  }}
                >
                  🎵 Track #{musicData.tokenId}
                </div>

                {/* CTA */}
                <div
                  style={{
                    fontSize: 17,
                    opacity: 0.8,
                    display: 'flex',
                    color: '#a0aec0',
                    fontWeight: '500',
                  }}
                >
                  🎧 License on EmpowerTours
                </div>
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
