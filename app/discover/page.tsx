'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import PageTransition, { SlideIn, FadeIn } from '@/app/components/animations/PageTransition';
import { MusicLoader, DotsLoader } from '@/app/components/animations/AnimatedLoader';
import { MusicEmptyState } from '@/app/components/animations/EmptyState';
import { AnimatedStatCard, MusicNFTCard } from '@/app/components/animations/AnimatedCard';

// Constants
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
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
  isArt?: boolean;
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
            where: {isBurned: {_eq: false}},
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
            isArt
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
            // Neynar returns user data nested inside 'user' object
            const user = data?.user;
            if (user && user.fid) {
              setArtistInfoCache((prev) => ({
                ...prev,
                [artistAddress]: {
                  username: user.username,
                  displayName: user.display_name || user.username,
                  pfpUrl: user.pfp_url,
                  fid: user.fid,
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
    <PageTransition className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <SlideIn direction="down" className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <motion.h1
            className="text-4xl font-bold text-gray-900 mb-4 text-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            ✨ Discover NFTs
          </motion.h1>
          <FadeIn delay={0.3}>
            <p className="text-gray-600 text-center mb-6">
              Browse all music & art NFTs minted on EmpowerTours
            </p>
          </FadeIn>

          {/* Search Bar */}
          <FadeIn delay={0.4}>
            <div className="max-w-2xl mx-auto mb-8">
              <div className="relative">
                <motion.input
                  type="text"
                  placeholder="🔍 Search by artist name, address, or NFT title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg transition-all"
                  whileFocus={{ scale: 1.02 }}
                />
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    ✕
                  </motion.button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                💡 Tip: Search by @username, wallet address, or NFT title
              </p>
            </div>
          </FadeIn>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <AnimatedStatCard
              value={allMusic.filter((m) => !m.isArt).length}
              label="Music Tracks"
              color="purple"
              delay={0.5}
            />
            <AnimatedStatCard
              value={allMusic.filter((m) => m.isArt).length}
              label="Art NFTs"
              color="pink"
              delay={0.55}
            />
            <AnimatedStatCard
              value={[...new Set(allMusic.map((m) => m.artist.toLowerCase()))].length}
              label="Artists"
              color="purple"
              delay={0.6}
            />
            <AnimatedStatCard
              value={filteredMusic.length}
              label="Search Results"
              color="blue"
              delay={0.65}
            />
          </div>
        </SlideIn>

        {/* Music Grid */}
        {loading ? (
          <div className="text-center py-16">
            <MusicLoader text="Loading music..." />
          </div>
        ) : filteredMusic.length === 0 ? (
          <MusicEmptyState searchQuery={searchQuery} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredMusic.map((music, index) => {
              const artistInfo = artistInfoCache[music.artist.toLowerCase()];

              return (
                <MusicNFTCard
                  key={music.id}
                  delay={index * 0.05}
                  className="bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 transition-colors shadow-sm"
                >
                  {/* Cover Art */}
                  {music.metadata?.image ? (
                    <div className="w-full aspect-square overflow-hidden rounded-t-xl relative group">
                      <motion.img
                        src={resolveIPFS(music.metadata.image)}
                        alt={music.metadata.name || `Track #${music.tokenId}`}
                        className="w-full h-full object-cover"
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      {/* Art/Music Badge */}
                      <div className="absolute top-2 right-2">
                        {music.isArt ? (
                          <span className="px-3 py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold rounded-full shadow-lg">
                            🎨 ART
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-bold rounded-full shadow-lg">
                            🎵 MUSIC
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center rounded-t-xl">
                      {music.isLoadingMetadata ? (
                        <DotsLoader />
                      ) : (
                        <motion.span
                          className="text-7xl"
                          animate={{
                            scale: [1, 1.1, 1],
                            rotate: [0, 5, -5, 0]
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut'
                          }}
                        >
                          {music.isArt ? '🎨' : '🎵'}
                        </motion.span>
                      )}
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    {/* NFT Title */}
                    <div>
                      <p className="font-bold text-gray-900 text-lg truncate">
                        {music.metadata?.name || `${music.isArt ? 'Art' : 'Track'} #${music.tokenId}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        {new Date(music.mintedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Artist Info */}
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Link
                        href={`/artist/${music.artist}`}
                        className={`block p-3 rounded-lg transition-all ${
                          music.isArt
                            ? 'bg-blue-50 hover:bg-blue-100'
                            : 'bg-purple-50 hover:bg-purple-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {artistInfo?.pfpUrl ? (
                            <motion.img
                              src={artistInfo.pfpUrl}
                              alt={artistInfo.username}
                              className="w-8 h-8 rounded-full object-cover"
                              whileHover={{ scale: 1.1, rotate: 5 }}
                            />
                          ) : (
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                              music.isArt ? 'bg-blue-400' : 'bg-purple-300'
                            }`}>
                              {music.isArt ? '🎨' : '🎵'}
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
                    </motion.div>

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
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Link
                        href={`/artist/${music.artist}`}
                        className="block w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-pink-700 text-center transition-all"
                      >
                        👀 View Artist Profile
                      </Link>
                    </motion.div>
                  </div>
                </MusicNFTCard>
              );
            })}
          </div>
        )}

        {/* Refresh Button */}
        <FadeIn delay={0.5}>
          <div className="mt-8 text-center">
            <motion.button
              onClick={loadAllMusic}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {loading ? <DotsLoader /> : '🔄 Refresh'}
            </motion.button>
            <p className="text-xs text-gray-500 mt-2">Powered by Envio Indexer</p>
          </div>
        </FadeIn>
      </div>
    </PageTransition>
  );
}
