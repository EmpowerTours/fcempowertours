import { NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

interface NFTObject {
  id: string;
  type: 'ART' | 'MUSIC' | 'EXPERIENCE';
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
}

// Utility function to resolve IPFS URLs with thumbnail optimization
const resolveIPFS = (url: string, thumbnail: boolean = true): string => {
  if (!url) return '';

  let resolvedUrl = url;
  if (url.startsWith('ipfs://')) {
    resolvedUrl = url.replace('ipfs://', PINATA_GATEWAY);
  }

  // Add Pinata thumbnail optimization for small sizes
  if (thumbnail && resolvedUrl.includes('mypinata.cloud')) {
    // Use Pinata's image optimization - 48px width for tiny thumbnails
    resolvedUrl += '?img-width=48&img-fit=cover';
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
        body: JSON.stringify({
          query: `
            query GetMusicAndArt {
              MusicNFT(
                where: {isBurned: {_eq: false}},
                order_by: {mintedAt: desc},
                limit: 15
              ) {
                id
                tokenId
                tokenURI
                isArt
                artist
              }
            }
          `
        }),
      }),

      // Fetch Experience NFTs
      fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    // Process Music/Art NFTs - fetch metadata for images
    const processedMusicNFTs: NFTObject[] = await Promise.all(
      musicNFTs.slice(0, 10).map(async (nft: any) => {
        let imageUrl = '';
        let name = nft.isArt ? `Art #${nft.tokenId}` : `Track #${nft.tokenId}`;

        try {
          const metadataUrl = resolveIPFS(nft.tokenURI, false);
          const metadataRes = await fetch(metadataUrl);
          if (metadataRes.ok) {
            const metadata = await metadataRes.json();
            if (metadata.image) {
              imageUrl = resolveIPFS(metadata.image, true); // Thumbnail optimization
            }
            if (metadata.name) {
              name = metadata.name;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for NFT ${nft.tokenId}:`, error);
        }

        return {
          id: `music-${nft.id}`,
          type: nft.isArt ? 'ART' : 'MUSIC',
          tokenId: nft.tokenId.toString(),
          name,
          imageUrl,
          price: '0', // Music NFTs don't have direct price in this schema
          contractAddress: process.env.NEXT_PUBLIC_NFT_ADDRESS || '',
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
            const metadataUrl = resolveIPFS(exp.metadataUri, false);
            const metadataRes = await fetch(metadataUrl);
            if (metadataRes.ok) {
              const metadata = await metadataRes.json();
              if (metadata.image) {
                imageUrl = resolveIPFS(metadata.image, true); // Thumbnail optimization
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
    });

  } catch (error: any) {
    console.error('Error fetching NFTs from Envio:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch NFTs',
        nfts: [], // Return empty array on error so UI doesn't break
      },
      { status: 500 }
    );
  }
}
