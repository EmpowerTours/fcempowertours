import { NextResponse } from 'next/server';

// Force dynamic rendering - don't cache this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

interface NFTObject {
  id: string;
  type: 'ART' | 'MUSIC' | 'EXPERIENCE';
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
  tokenURI?: string; // For music NFTs to fetch metadata
  artistUsername?: string; // Farcaster username of the artist
}

// Utility function to resolve IPFS URLs with thumbnail optimization
const resolveIPFS = (url: string, thumbnail: boolean = false): string => {
  if (!url) return '';

  let resolvedUrl = url;
  if (url.startsWith('ipfs://')) {
    resolvedUrl = url.replace('ipfs://', PINATA_GATEWAY);
  }

  return resolvedUrl;
};

export async function GET() {
  try {
    // Query for Music/Art NFTs and Experience NFTs in parallel
    const [musicResponse, experienceResponse] = await Promise.all([
      // Fetch Music/Art NFTs
      fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          query: `
            query GetMusicAndArt {
              MusicNFT(
                where: {
                  isBurned: {_eq: false},
                  owner: {_neq: "0x0000000000000000000000000000000000000000"}
                },
                order_by: {mintedAt: desc},
                limit: 15
              ) {
                id
                tokenId
                tokenURI
                isArt
                artist
                price
              }
            }
          `
        }),
      }),

      // Fetch Experience NFTs
      fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          query: `
            query GetExperiences {
              Experience(
                where: {active: {_eq: true}},
                order_by: {createdAt: desc},
                limit: 10
              ) {
                experienceId
                title
                price
                metadataUri
                creator
              }
            }
          `
        }),
      }),
    ]);

    if (!musicResponse.ok || !experienceResponse.ok) {
      throw new Error('Failed to fetch NFTs from Envio');
    }

    const musicData = await musicResponse.json();
    const experienceData = await experienceResponse.json();

    const musicNFTs = musicData.data?.MusicNFT || [];
    const experienceNFTs = experienceData.data?.Experience || [];

    // Fetch Farcaster usernames for all unique artist addresses
    const artistAddresses = [...new Set(musicNFTs.map((nft: any) => nft.artist).filter(Boolean))] as string[];
    const artistUsernames: Record<string, string> = {};

    if (artistAddresses.length > 0) {
      try {
        const neynarApiKey = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
        console.log('[get-nfts] Looking up usernames for artists:', artistAddresses);
        if (neynarApiKey) {
          const addressesParam = artistAddresses.join(',');
          // Try with hyphen format and address_types parameter
          const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addressesParam}&address_types=custody_address,verified_address`;
          console.log('[get-nfts] Neynar URL:', neynarUrl);
          const neynarResponse = await fetch(neynarUrl, {
            headers: { 'api_key': neynarApiKey },
          });

          if (neynarResponse.ok) {
            const neynarData = await neynarResponse.json();
            console.log('[get-nfts] Neynar response keys:', Object.keys(neynarData));
            // Map addresses to usernames - response is keyed by lowercase address
            for (const address of artistAddresses) {
              const users = neynarData[address.toLowerCase()];
              if (users && users.length > 0) {
                artistUsernames[address.toLowerCase()] = users[0].username;
                console.log('[get-nfts] Found username:', users[0].username, 'for', address);
              } else {
                console.log('[get-nfts] No Farcaster user found for address:', address);
              }
            }
            console.log('[get-nfts] Fetched Farcaster usernames for', Object.keys(artistUsernames).length, 'artists');
          } else {
            const errorText = await neynarResponse.text().catch(() => 'no body');
            console.error('[get-nfts] Neynar API error:', neynarResponse.status, errorText.substring(0, 200));
          }
        } else {
          console.warn('[get-nfts] No NEYNAR_API_KEY configured');
        }
      } catch (err) {
        console.error('[get-nfts] Failed to fetch artist usernames:', err);
      }
    }

    // Process Music/Art NFTs - fetch metadata for images
    const processedMusicNFTs: NFTObject[] = await Promise.all(
      musicNFTs.slice(0, 10).map(async (nft: any) => {
        let imageUrl = '';
        let name = nft.isArt ? `Art #${nft.tokenId}` : `Track #${nft.tokenId}`;

        try {
          const metadataUrl = resolveIPFS(nft.tokenURI);
          const metadataRes = await fetch(metadataUrl);
          if (metadataRes.ok) {
            const metadata = await metadataRes.json();
            if (metadata.image) {
              imageUrl = resolveIPFS(metadata.image);
            }
            if (metadata.name) {
              name = metadata.name;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for NFT ${nft.tokenId}:`, error);
        }

        // Price is in wei (18 decimals) - convert to WMON
        const priceInWMON = nft.price ? (Number(nft.price) / 1e18).toFixed(2) : '0';

        // Get artist Farcaster username
        const artistUsername = nft.artist ? artistUsernames[nft.artist.toLowerCase()] : undefined;

        return {
          id: `music-${nft.id}`,
          type: nft.isArt ? 'ART' : 'MUSIC',
          tokenId: nft.tokenId.toString(),
          name,
          imageUrl,
          price: priceInWMON,
          contractAddress: process.env.NEXT_PUBLIC_NFT_CONTRACT || '',
          tokenURI: nft.tokenURI, // Include for fetching audio metadata
          artistUsername, // Farcaster username of the artist
        };
      })
    );

    // Process Experience NFTs
    const processedExperienceNFTs: NFTObject[] = await Promise.all(
      experienceNFTs.slice(0, 8).map(async (exp: any) => {
        let imageUrl = '';
        let name = exp.title || `Experience #${exp.experienceId}`;

        try {
          if (exp.metadataUri) {
            const metadataUrl = resolveIPFS(exp.metadataUri);
            const metadataRes = await fetch(metadataUrl);
            if (metadataRes.ok) {
              const metadata = await metadataRes.json();
              if (metadata.image) {
                imageUrl = resolveIPFS(metadata.image);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for Experience ${exp.experienceId}:`, error);
        }

        return {
          id: `experience-${exp.experienceId}`,
          type: 'EXPERIENCE',
          tokenId: exp.experienceId.toString(),
          name,
          imageUrl,
          price: (Number(exp.price) / 1e18).toFixed(2),
          contractAddress: process.env.NEXT_PUBLIC_EXPERIENCE_NFT || '',
        };
      })
    );

    // Combine and shuffle for variety
    const allNFTs = [...processedMusicNFTs, ...processedExperienceNFTs];

    // Simple shuffle
    for (let i = allNFTs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNFTs[i], allNFTs[j]] = [allNFTs[j], allNFTs[i]];
    }

    return NextResponse.json({
      success: true,
      nfts: allNFTs.slice(0, 20), // Return max 20 NFTs for performance
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });

  } catch (error: any) {
    console.error('Error fetching NFTs from Envio:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch NFTs',
        nfts: [], // Return empty array on error so UI doesn't break
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      }
    );
  }
}
