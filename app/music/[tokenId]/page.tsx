'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createPublicClient, http, Address } from 'viem';

interface MusicData {
  tokenId: string;
  name: string;
  artist: string;
  price: string;
  imageUrl: string;
  audioUrl: string;
  createdAt: string;
}

export default function MusicPage() {
  const params = useParams();
  const tokenId = params.tokenId as string;
  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const fetchMusicData = async () => {
      try {
        // ✅ PRIORITY 1: Try Envio first
        console.log('🔍 Fetching music data for token:', tokenId);
        
        const query = `
          query GetMusicNFT($tokenId: String!) {
            MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
              tokenId
              name
              imageUrl
              price
              artist
              createdAt
              previewUrl
              fullUrl
            }
          }
        `;

        const response = await fetch(process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { tokenId } }),
        });

        if (response.ok) {
          const data = await response.json();
          const nft = data.data?.MusicNFT?.[0];

          if (nft) {
            console.log('✅ Found in Envio');
            setMusicData({
              tokenId: nft.tokenId,
              name: nft.name,
              artist: nft.artist,
              price: nft.price,
              imageUrl: nft.imageUrl,
              audioUrl: nft.fullUrl || nft.previewUrl || '',
              createdAt: nft.createdAt,
            });
            return;
          }
        }

        // ✅ PRIORITY 2: If not in Envio, try blockchain directly (for recently minted tokens)
        console.log('⏳ Not in Envio yet, checking blockchain...');
        const client = createPublicClient({
          chain: {
            id: 20143,
            name: 'Monad Testnet',
            network: 'monad-testnet',
            nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
            rpcUrls: {
              default: { http: ['https://testnet-rpc.monad.xyz'] },
              public: { http: ['https://testnet-rpc.monad.xyz'] },
            },
          },
          transport: http(),
        });

        const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_NFT as Address || '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6' as Address;

        // Try to read from contract
        const uriData = await client.readContract({
          address: MUSIC_NFT_ADDRESS,
          abi: [
            {
              name: 'tokenURI',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: 'tokenId', type: 'uint256' }],
              outputs: [{ name: '', type: 'string' }],
            },
          ],
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        });

        if (uriData) {
          console.log('✅ Found token URI on blockchain');
          // Fetch metadata from IPFS
          const ipfsUrl = uriData.startsWith('ipfs://')
            ? `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${uriData.replace('ipfs://', '')}`
            : uriData;

          const metadataResponse = await fetch(ipfsUrl);
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            console.log('✅ Got metadata from IPFS');
            
            // Extract audio URL - try different possible field names
            const audioUrl = metadata.animation_url || metadata.audio || metadata.full || metadata.audio_url || '';
            const audioHttpUrl = audioUrl.startsWith('ipfs://')
              ? `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${audioUrl.replace('ipfs://', '')}`
              : audioUrl;
            
            setMusicData({
              tokenId,
              name: metadata.name || 'Untitled',
              artist: metadata.artist || 'Unknown',
              price: metadata.price || '0',
              imageUrl: metadata.image || '',
              audioUrl: audioHttpUrl,
              createdAt: new Date().toISOString(),
            });
            return;
          }
        }

        // If we get here, token not found anywhere
        setError('Music NFT not found on chain or indexer');
      } catch (err: any) {
        console.error('Error fetching music data:', err);
        setError(err.message || 'Failed to load music data');
      } finally {
        setLoading(false);
      }
    };

    fetchMusicData();
  }, [tokenId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🎵</div>
          <p className="text-white text-xl">Loading music data...</p>
        </div>
      </div>
    );
  }

  if (error || !musicData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-red-400 text-xl">{error || 'Music NFT not found'}</p>
          <p className="text-gray-400 mt-2">Token ID: {tokenId}</p>
          <p className="text-gray-500 text-sm mt-4">Try again in a few moments if this is a newly minted token</p>
        </div>
      </div>
    );
  }

  // Convert IPFS URL to HTTP
  const getImageUrl = (ipfsUrl: string) => {
    if (!ipfsUrl) return '';
    if (ipfsUrl.startsWith('http')) return ipfsUrl;
    if (ipfsUrl.startsWith('ipfs://')) {
      const cid = ipfsUrl.replace('ipfs://', '');
      return `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${cid}`;
    }
    return ipfsUrl;
  };

  // Format artist address
  const formatArtist = (address: string) => {
    if (!address) return 'Unknown Artist';
    if (address.length > 10) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    return address;
  };

  // Format time for audio player
  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const imageUrl = getImageUrl(musicData.imageUrl);
  const priceNum = parseFloat(musicData.price);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-purple-500/20 bg-slate-900/50 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🎵</div>
            <div>
              <h1 className="text-3xl font-bold text-white">EmpowerTours Music</h1>
              <p className="text-gray-400 text-sm">Stream & License Music NFTs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-12">
          {/* Left: Cover Art + Player */}
          <div className="flex flex-col gap-6">
            {/* Cover Art */}
            <div className="flex items-center justify-center">
              {imageUrl ? (
                <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl border-2 border-purple-500/30">
                  <img
                    src={imageUrl}
                    alt={musicData.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
              ) : (
                <div className="w-full aspect-square bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center">
                  <div className="text-8xl">🎵</div>
                </div>
              )}
            </div>

            {/* Audio Player */}
            {musicData.audioUrl ? (
              <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl p-6">
                <audio
                  id="player"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  className="w-full"
                  controls
                  crossOrigin="anonymous"
                >
                  <source src={musicData.audioUrl} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>

                {/* Custom Controls */}
                <div className="mt-4 space-y-3">
                  {/* Progress Bar */}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{formatTime(currentTime)}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-1">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-1 rounded-full"
                        style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                      />
                    </div>
                    <span>{formatTime(duration)}</span>
                  </div>

                  {/* Info Text */}
                  <div className="text-center text-sm text-gray-400">
                    {isPlaying ? '▶️ Now Playing' : '⏸️ Paused'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-6 text-center">
                <p className="text-yellow-400 text-sm">🎧 Audio not available yet</p>
              </div>
            )}
          </div>

          {/* Right: Song Info */}
          <div className="flex flex-col justify-center gap-8">
            {/* Token ID */}
            <div>
              <p className="text-gray-400 text-sm mb-1">TOKEN ID</p>
              <p className="text-2xl font-bold text-purple-400">#{musicData.tokenId}</p>
            </div>

            {/* Song Title */}
            <div>
              <p className="text-gray-400 text-sm mb-2">SONG TITLE</p>
              <h2 className="text-4xl font-bold text-white leading-tight">
                {musicData.name}
              </h2>
            </div>

            {/* Artist */}
            <div>
              <p className="text-gray-400 text-sm mb-1">ARTIST</p>
              <p className="text-xl text-gray-300 font-mono">
                {formatArtist(musicData.artist)}
              </p>
            </div>

            {/* Price */}
            <div>
              <p className="text-gray-400 text-sm mb-2">LICENSE PRICE</p>
              <div className="flex items-baseline gap-2">
                <p className="text-5xl font-bold text-cyan-400">
                  {priceNum}
                </p>
                <p className="text-2xl text-cyan-400 font-semibold">TOURS</p>
              </div>
              <p className="text-gray-500 text-xs mt-2">
                Purchase a time-limited license to stream this track
              </p>
            </div>

            {/* CTA Button */}
            <div className="pt-4">
              <button
                onClick={() => {
                  alert(`Purchase license for "${musicData.name}" at ${priceNum} TOURS\n\nFeature coming soon!`);
                }}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95"
              >
                💎 Purchase License
              </button>
              <p className="text-gray-500 text-xs mt-3 text-center">
                Own the license to stream this track
              </p>
            </div>

            {/* Info */}
            <div className="pt-4 border-t border-gray-700/50">
              <p className="text-gray-500 text-sm">
                ⚡ Powered by EmpowerTours on Monad
              </p>
              <p className="text-gray-600 text-xs mt-2">
                Artist retains master NFT ownership • 90/10 split for licensees
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
