'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

// Constants
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

// Utility function to resolve IPFS URLs
const resolveIPFS = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', PINATA_GATEWAY);
  }
  return url;
};

// Interfaces
interface ArtistInfo {
  username: string;
  displayName: string;
  pfpUrl: string;
  fid: number;
}

interface MusicNFT {
  id: string;
  tokenId: number;
  artist: string;
  owner: string;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
  metadata?: {
    name?: string;
    image?: string;
    animation_url?: string;
  };
  isLoadingMetadata?: boolean;
}

export default function MusicDiscoveryPage() {
  const [allMusic, setAllMusic] = useState<MusicNFT[]>([]);
  const [filteredMusic, setFilteredMusic] = useState<MusicNFT[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [artistInfoCache, setArtistInfoCache] = useState<Record<string, ArtistInfo>>({});

  useEffect(() => {
    loadAllMusic();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredMusic(allMusic);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = allMusic.filter((music) => {
        const artistInfo = artistInfoCache[music.artist.toLowerCase()];
        const artistMatch =
          music.artist.toLowerCase().includes(query) ||
          artistInfo?.username?.toLowerCase().includes(query) ||
          artistInfo?.displayName?.toLowerCase().includes(query);
        const titleMatch = music.metadata?.name?.toLowerCase().includes(query);
        return artistMatch || titleMatch;
      });
      setFilteredMusic(filtered);
    }
  }, [searchQuery, allMusic, artistInfoCache]);

  const loadAllMusic = async () => {
    setLoading(true);
    try {
      const query = `
        query GetAllMusic {
          MusicNFT(
            order_by: {mintedAt: desc},
            limit: 100
          ) {
            id
            tokenId
            artist
            owner
            tokenURI
            mintedAt
            txHash
          }
        }
      `;

      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) throw new Error('Failed to load music');

      const result = await response.json();
      const music: MusicNFT[] = result.data?.MusicNFT || [];

      console.log('✅ Loaded', music.length, 'music NFTs');

      const musicWithLoading: MusicNFT[] = music.map((m) => ({
        ...m,
        isLoadingMetadata: true,
      }));

      setAllMusic(musicWithLoading);
      setFilteredMusic(musicWithLoading);

      // Load metadata for each track
      music.forEach(async (nft: MusicNFT, index: number) => {
        try {
          const metadataUrl = resolveIPFS(nft.tokenURI);
          const metadataRes = await fetch(metadataUrl);
          if (metadataRes.ok) {
            const metadata = await metadataRes.json();
            setAllMusic((prev) => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                metadata,
                isLoadingMetadata: false,
              };
              return updated;
            });
          } else {
            setAllMusic((prev) => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                isLoadingMetadata: false,
              };
              return updated;
            });
          }
        } catch (error) {
          console.error('Error loading metadata:', error);
          setAllMusic((prev) => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              isLoadingMetadata: false,
            };
            return updated;
          });
        }
      });

      // Load artist info for each unique artist
      const uniqueArtists = [...new Set(music.map((m) => m.artist.toLowerCase()))];
      uniqueArtists.forEach(async (artistAddress: string) => {
        try {
          const response = await fetch(
            `https://api.neynar.com/v2/farcaster/user/by_verification?address=${artistAddress}`,
            {
              headers: {
                'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
              },
            }
          );
          if (response.ok) {
            const data = await response.json();
            if (data && data.fid) {
              setArtistInfoCache((prev) => ({
                ...prev,
                [artistAddress]: {
                  username: data.username,
                  displayName: data.display_name || data.username,
                  pfpUrl: data.pfp_url,
                  fid: data.fid,
                },
              }));
            }
          }
        } catch (error) {
          console.error('Error loading artist info:', error);
        }
      });
    } catch (error) {
      console.error('❌ Error loading music:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4 text-center">
            🎵 Discover Music
          </h1>
          <p className="text-gray-600 text-center mb-6">
            Browse all music NFTs minted on EmpowerTours
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Search by artist name, address, or song title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              💡 Tip: Search by @username, wallet address, or song title
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-purple-600">{allMusic.length}</p>
              <p className="text-sm text-gray-600">Total Tracks</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">
                {[...new Set(allMusic.map((m) => m.artist.toLowerCase()))].length}
              </p>
              <p className="text-sm text-gray-600">Artists</p>
            </div>
            <div className="bg-pink-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-pink-600">{filteredMusic.length}</p>
              <p className="text-sm text-gray-600">Search Results</p>
            </div>
          </div>
        </div>

        {/* Music Grid */}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-600">Loading music...</p>
          </div>
        ) : filteredMusic.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-gray-600 text-lg mb-2">
              {searchQuery ? `No results for "${searchQuery}"` : 'No music NFTs minted yet'}
            </p>
            <p className="text-gray-500 text-sm">
              {searchQuery ? 'Try a different search term' : 'Be the first to mint music!'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredMusic.map((music) => {
              const artistInfo = artistInfoCache[music.artist.toLowerCase()];

              return (
                <div
                  key={music.id}
                  className="bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 transition-all shadow-sm hover:shadow-lg"
                >
                  {/* Cover Art */}
                  {music.metadata?.image ? (
                    <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                      <img
                        src={resolveIPFS(music.metadata.image)}
                        alt={music.metadata.name || `Track #${music.tokenId}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center rounded-t-xl">
                      {music.isLoadingMetadata ? (
                        <div className="animate-spin text-4xl">⏳</div>
                      ) : (
                        <span className="text-7xl">🎵</span>
                      )}
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    {/* Song Title */}
                    <div>
                      <p className="font-bold text-gray-900 text-lg truncate">
                        {music.metadata?.name || `Track #${music.tokenId}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        {new Date(music.mintedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Artist Info */}
                    <Link
                      href={`/artist/${music.artist}`}
                      className="block p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        {artistInfo?.pfpUrl ? (
                          <img
                            src={artistInfo.pfpUrl}
                            alt={artistInfo.username}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-purple-300 flex items-center justify-center text-xs font-bold text-white">
                            🎵
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-purple-900 truncate">
                            {artistInfo?.displayName || `Artist ${music.artist.slice(0, 6)}...`}
                          </p>
                          <p className="text-xs text-purple-600">
                            @{artistInfo?.username || `${music.artist.slice(0, 6)}...${music.artist.slice(-4)}`}
                          </p>
                        </div>
                      </div>
                    </Link>

                    {/* Audio Preview */}
                    {music.metadata?.animation_url && !music.isLoadingMetadata ? (
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                        <audio
                          controls
                          preload="metadata"
                          className="w-full"
                          style={{ height: '40px' }}
                        >
                          <source src={resolveIPFS(music.metadata.animation_url)} type="audio/mpeg" />
                          <source src={resolveIPFS(music.metadata.animation_url)} type="audio/wav" />
                        </audio>
                        <p className="text-xs text-gray-500 text-center mt-1">
                          🎧 Preview
                        </p>
                      </div>
                    ) : music.isLoadingMetadata ? (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                        <p className="text-xs text-gray-500">Loading...</p>
                      </div>
                    ) : null}

                    {/* View Artist Profile Button */}
                    <Link
                      href={`/artist/${music.artist}`}
                      className="block w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-pink-700 text-center transition-all active:scale-95"
                    >
                      👀 View Artist Profile
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Refresh Button */}
        <div className="mt-8 text-center">
          <button
            onClick={loadAllMusic}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
          <p className="text-xs text-gray-500 mt-2">Powered by Envio Indexer</p>
        </div>
      </div>
    </div>
  );
}
