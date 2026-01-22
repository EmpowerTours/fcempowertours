import { NextRequest, NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

interface Song {
  id: string;
  tokenId: string;
  title: string;
  artist: string;
  artistUsername?: string; // Farcaster username (e.g., unify34)
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

    // Query Envio for user's purchased licenses AND owned master tokens
    const query = `
      query GetUserMusic($owner: String!) {
        # User's purchased licenses (most common case)
        MusicLicense(
          where: {
            licensee: {_eq: $owner},
            active: {_eq: true}
          },
          order_by: {purchasedAt: desc}
        ) {
          id
          licenseId
          masterTokenId
          licensee
          masterToken {
            id
            tokenId
            tokenURI
            artist
            name
            imageUrl
            fullAudioUrl
            previewAudioUrl
          }
        }
        # User's owned master NFTs (for artists)
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
          name
          imageUrl
          fullAudioUrl
          previewAudioUrl
        }
      }
    `;

    console.log('[get-user-licenses] Querying Envio for address:', address.toLowerCase());

    // Debug: Check if ANY licenses exist in the indexer
    const debugQuery = `
      query DebugLicenses {
        MusicLicense(limit: 10, order_by: {purchasedAt: desc}) {
          id
          licenseId
          masterTokenId
          licensee
          active
          purchasedAt
          txHash
        }
        GlobalStats(where: {id: {_eq: "global"}}) {
          totalMusicLicensesPurchased
          totalMusicNFTs
          lastUpdated
        }
      }
    `;
    try {
      const debugRes = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: debugQuery })
      });
      const debugData = await debugRes.json();
      const licenses = debugData?.data?.MusicLicense || [];
      const stats = debugData?.data?.GlobalStats?.[0];
      console.log('[get-user-licenses] DEBUG - Indexer stats:', JSON.stringify(stats));
      console.log('[get-user-licenses] DEBUG - Total licenses in DB:', licenses.length);
      console.log('[get-user-licenses] DEBUG - Recent licenses:', licenses.map((l: any) => ({
        id: l.id,
        licensee: l.licensee,
        masterTokenId: l.masterTokenId,
        txHash: l.txHash?.slice(0, 20) + '...'
      })));

      // Check if queried address matches any licensee
      const matchingLicenses = licenses.filter((l: any) =>
        l.licensee?.toLowerCase() === address.toLowerCase()
      );
      console.log('[get-user-licenses] DEBUG - Licenses matching query address:', matchingLicenses.length);
    } catch (e) {
      console.log('[get-user-licenses] DEBUG query failed:', e);
    }

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { owner: address.toLowerCase() }
      }),
    });

    // Debug: Log raw response
    const rawText = await response.clone().text();
    console.log('[get-user-licenses] Raw Envio response:', rawText.substring(0, 500));

    if (!response.ok) {
      throw new Error('Failed to fetch music from Envio');
    }

    const data = await response.json();

    // Combine purchased licenses and owned master tokens
    const licenses = data.data?.MusicLicense || [];
    const ownedMasters = data.data?.MusicNFT || [];

    // Extract music NFTs from licenses (use the masterToken data)
    const licensedNFTs = licenses.map((license: any) => ({
      ...license.masterToken,
      isLicense: true,
      licenseId: license.licenseId
    }));

    // Combine both sources, deduplicating by tokenId
    const seenTokenIds = new Set<string>();
    const musicNFTs: any[] = [];

    // Licenses first (user's purchased content)
    for (const nft of licensedNFTs) {
      if (nft && !seenTokenIds.has(nft.tokenId)) {
        seenTokenIds.add(nft.tokenId);
        musicNFTs.push(nft);
      }
    }

    // Then owned masters (artist's own content)
    for (const nft of ownedMasters) {
      if (!seenTokenIds.has(nft.tokenId)) {
        seenTokenIds.add(nft.tokenId);
        musicNFTs.push(nft);
      }
    }

    console.log('[get-user-licenses] Found', licenses.length, 'licenses and', ownedMasters.length, 'owned masters =', musicNFTs.length, 'total');

    // Fetch Farcaster usernames for all unique artist addresses
    const artistAddresses = [...new Set(musicNFTs.map((nft: any) => nft.artist).filter(Boolean))] as string[];
    const artistUsernames: Record<string, string> = {};
    console.log('[get-user-licenses] Found', musicNFTs.length, 'NFTs with', artistAddresses.length, 'unique artists:', artistAddresses);

    if (artistAddresses.length > 0) {
      try {
        const addressesParam = artistAddresses.join(',');
        const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addressesParam}`;
        const neynarRes = await fetch(neynarUrl, {
          headers: {
            'api_key': process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
          }
        });

        if (neynarRes.ok) {
          const neynarData = await neynarRes.json();
          console.log('[get-user-licenses] Neynar response:', JSON.stringify(neynarData).substring(0, 500));
          // Response format: { "0xaddress": [{ username: "...", ... }], ... }
          for (const [addr, users] of Object.entries(neynarData)) {
            console.log('[get-user-licenses] Processing addr:', addr, 'users:', Array.isArray(users) ? users.length : 'not array');
            if (Array.isArray(users) && users.length > 0 && (users[0] as any).username) {
              artistUsernames[addr.toLowerCase()] = (users[0] as any).username;
              console.log('[get-user-licenses] Found username:', (users[0] as any).username, 'for', addr);
            }
          }
          console.log('[get-user-licenses] Fetched Farcaster usernames for', Object.keys(artistUsernames).length, 'artists');
        } else {
          console.warn('[get-user-licenses] Neynar API returned', neynarRes.status, await neynarRes.text().catch(() => 'no body'));
        }
      } catch (err) {
        console.warn('[get-user-licenses] Failed to fetch Farcaster usernames:', err);
      }
    }

    // Process each NFT - use cached data from Envio first, fallback to fetching metadata
    const songs: Song[] = await Promise.all(
      musicNFTs.map(async (nft: any) => {
        const artistAddr = nft.artist?.toLowerCase();
        const artistUsername = artistAddr ? artistUsernames[artistAddr] : undefined;

        // Use cached data from Envio if available (faster, no extra fetch needed)
        if (nft.name && (nft.fullAudioUrl || nft.previewAudioUrl)) {
          return {
            id: nft.id,
            tokenId: nft.tokenId?.toString() || '',
            title: nft.name,
            artist: nft.artist,
            artistUsername,
            audioUrl: resolveIPFS(nft.fullAudioUrl || nft.previewAudioUrl || ''),
            imageUrl: resolveIPFS(nft.imageUrl || ''),
          };
        }

        // Fallback: fetch metadata from tokenURI
        try {
          const metadataUrl = resolveIPFS(nft.tokenURI);
          const metadataRes = await fetch(metadataUrl);

          if (metadataRes.ok) {
            const metadata = await metadataRes.json();

            return {
              id: nft.id,
              tokenId: nft.tokenId?.toString() || '',
              title: metadata.name || `Track #${nft.tokenId}`,
              artist: metadata.artist || nft.artist,
              artistUsername,
              audioUrl: resolveIPFS(metadata.animation_url || ''),
              imageUrl: resolveIPFS(metadata.image || ''),
            };
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for NFT ${nft.tokenId}:`, error);
        }

        // Final fallback
        return {
          id: nft.id,
          tokenId: nft.tokenId?.toString() || '',
          title: `Track #${nft.tokenId}`,
          artist: nft.artist,
          artistUsername,
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
