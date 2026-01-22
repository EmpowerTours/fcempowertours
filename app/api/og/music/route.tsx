import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
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

async function getFidFromWallet(walletAddress: string): Promise<string | null> {
  if (!NEYNAR_API_KEY) return null;
  
  try {
    // Use bulk_by_address endpoint (correct one for wallet lookups)
    const url = `https://api.neynar.com/v2/farcaster/user/bulk_by_address?addresses=${walletAddress}`;
    const response = await fetch(url, {
      headers: { 'api_key': NEYNAR_API_KEY }
    });
    
    if (response.ok) {
      const data: any = await response.json();
      
      // bulk_by_address returns an object with address as key
      if (data[walletAddress.toLowerCase()] && data[walletAddress.toLowerCase()].length > 0) {
        const user = data[walletAddress.toLowerCase()][0];
        return user.username ? user.username : null;
      }
    }
  } catch (e) {
    console.error('❌ Failed to look up FID:', e);
  }
  
  return null;
}

async function getMetadataFromBlockchain(tokenId: string): Promise<any | null> {
  try {
    console.log('🔗 Querying blockchain for token:', tokenId);
    
    const MUSIC_NFT_ADDRESS = '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6';
    
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
    const directImageUrl = searchParams.get('imageUrl');
    const directTitle = searchParams.get('title');
    const directArtist = searchParams.get('artist');
    const directPrice = searchParams.get('price');

    console.log('🎨 OG Request for music NFT:', { tokenId, hasDirectImage: !!directImageUrl });

    let musicData: any = null;

    // ✅ PRIORITY 1: Use direct parameters if provided (avoids indexer delay)
    if (directImageUrl && directTitle) {
      console.log('✅ Using direct parameters from mint transaction');

      let artistDisplay = directArtist || 'Artist';
      if (directArtist && directArtist.startsWith('0x')) {
        const fid = await getFidFromWallet(directArtist);
        if (fid) {
          artistDisplay = `@${fid}`;
          console.log('✅ Converted wallet to FID:', fid);
        }
      }

      musicData = {
        tokenId: tokenId || '0',
        name: directTitle,
        imageUrl: directImageUrl,
        price: directPrice || '0',
        artist: artistDisplay
      };
    } else if (tokenId) {
      const cached = ogCache.get(`music:${tokenId}`);
      if (cached && cached.expiry > Date.now()) {
        console.log('✅ Using cached OG data');
        musicData = cached.data;
      } else {
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
            const nft = data.data?.MusicNFT?.[0];
            
            if (nft) {
              console.log('✅ Found in Envio:', nft);
              
              const priceDisplay = convertPriceFromWei(nft.price || '0');
              
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
              
              ogCache.set(`music:${tokenId}`, {
                data: musicData,
                expiry: Date.now() + 5 * 60 * 1000
              });
              
              console.log('✅ Got from Envio and cached');
            } else {
              console.log('⚠️ Token not found in Envio, trying blockchain...');
              
              const blockchainData = await getMetadataFromBlockchain(tokenId);
              if (blockchainData) {
                const priceDisplay = convertPriceFromWei(blockchainData.price || '0');
                
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

    // ✅ RENDER: 50/50 layout with MAXIMUM padding to prevent any edge cropping
    if (musicData?.imageUrl) {
      const imageUrl = getImageUrl(musicData.imageUrl);
      console.log('🎨 Rendering with cover art');

      const priceDisplay = musicData.price || '0';

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
            {/* Cover Art - Left Side (50%) - Shows complete image */}
            <div
              style={{
                width: '50%',
                height: '100%',
                background: 'linear-gradient(135deg, #0f3460 0%, #1a1a2e 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px',
                boxSizing: 'border-box',
              }}
            >
              {/* Inner container with cover art - shows full image without cropping */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundImage: `url('${imageUrl}')`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  borderRadius: '16px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                }}
              />
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
                padding: '60px 60px',
                color: 'white',
              }}
            >
              {/* Music Icon */}
              <div style={{ fontSize: 60, marginBottom: 20, display: 'flex' }}>
                🎵
              </div>

              {/* Song Title */}
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 'bold',
                  marginBottom: 20,
                  lineHeight: 1.2,
                  maxWidth: '90%',
                  display: 'flex',
                  flexWrap: 'wrap',
                }}
              >
                {musicData.name}
              </div>

              {/* Artist - WITH FID */}
              <div
                style={{
                  fontSize: 28,
                  opacity: 0.8,
                  marginBottom: 30,
                  display: 'flex',
                  color: '#a0aec0',
                }}
              >
                {musicData.artist}
              </div>

              {/* Token Badge */}
              <div
                style={{
                  fontSize: 24,
                  background: 'rgba(124, 58, 237, 0.3)',
                  padding: '10px 24px',
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
                  fontSize: 32,
                  fontWeight: 'bold',
                  color: '#00d4ff',
                  marginBottom: 20,
                  display: 'flex',
                }}
              >
                {priceDisplay} WMON
              </div>

              {/* CTA */}
              <div
                style={{
                  fontSize: 20,
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
