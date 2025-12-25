import { NextRequest, NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/157f9ed/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

interface Song {
  id: string;
  tokenId: string;
  title: string;
  artist: string;
  audioUrl: string;
  imageUrl: string;
}

// Utility function to resolve IPFS URLs
const resolveIPFS = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', PINATA_GATEWAY);
  }
  return url;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    // Query Envio for user's music NFTs
    const query = `
      query GetUserMusic($owner: String!) {
        MusicNFT(
          where: {
            owner: {_eq: $owner},
            isBurned: {_eq: false},
            isArt: {_eq: false}
          },
          order_by: {mintedAt: desc}
        ) {
          id
          tokenId
          tokenURI
          artist
          owner
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { owner: address.toLowerCase() }
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch music from Envio');
    }

    const data = await response.json();
    const musicNFTs = data.data?.MusicNFT || [];

    // Fetch metadata for each NFT to get song details
    const songs: Song[] = await Promise.all(
      musicNFTs.map(async (nft: any) => {
        try {
          const metadataUrl = resolveIPFS(nft.tokenURI);
          const metadataRes = await fetch(metadataUrl);

          if (metadataRes.ok) {
            const metadata = await metadataRes.json();

            return {
              id: nft.id,
              tokenId: nft.tokenId.toString(),
              title: metadata.name || `Track #${nft.tokenId}`,
              artist: metadata.artist || nft.artist,
              audioUrl: resolveIPFS(metadata.animation_url || ''),
              imageUrl: resolveIPFS(metadata.image || ''),
            };
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for NFT ${nft.tokenId}:`, error);
        }

        // Fallback if metadata fetch fails
        return {
          id: nft.id,
          tokenId: nft.tokenId.toString(),
          title: `Track #${nft.tokenId}`,
          artist: nft.artist,
          audioUrl: '',
          imageUrl: '',
        };
      })
    );

    // Filter out songs without audio URLs
    const validSongs = songs.filter(song => song.audioUrl);

    return NextResponse.json({
      success: true,
      songs: validSongs,
    });

  } catch (error: any) {
    console.error('Error fetching user licenses:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch music',
        songs: [],
      },
      { status: 500 }
    );
  }
}
