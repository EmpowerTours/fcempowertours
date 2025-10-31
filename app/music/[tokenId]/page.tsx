'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createPublicClient, http, Address } from 'viem';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';

interface MusicData {
  tokenId: string;
  name: string;
  artist: string;
  artistAddress: string;
  price: string;
  imageUrl: string;
  audioUrl: string;
  createdAt: string;
}

const PINATA_GATEWAY = 'harlequin-used-hare-224.mypinata.cloud';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;

export default function MusicPage() {
  const params = useParams();
  const tokenId = params.tokenId as string;
  const { walletAddress, isMobile, requestWallet } = useFarcasterContext();
  const { executeCommand, loading: commandLoading } = useBotCommand();

  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [purchaseMessage, setPurchaseMessage] = useState('');

  useEffect(() => {
    fetchMusicData();
  }, [tokenId]);

  // ✅ FIX: Resolve FID from wallet on client-side after data loads
  useEffect(() => {
    const resolveFid = async () => {
      if (musicData?.artistAddress && musicData.artistAddress.startsWith('0x')) {
        // Only resolve if not already resolved (doesn't start with @)
        if (musicData.artist.startsWith('@')) {
          console.log('✅ Artist already resolved:', musicData.artist);
          return;
        }

        try {
          console.log('🔍 Resolving FID for artist:', musicData.artistAddress);
          const response = await fetch(
            `https://api.neynar.com/v2/farcaster/user/by_verification?address=${musicData.artistAddress}`,
            {
              headers: {
                'api_key': NEYNAR_API_KEY || '',
              }
            }
          );

          if (response.ok) {
            const data: any = await response.json();
            console.log('📤 Neynar response:', data);

            if (data.users && data.users.length > 0) {
              const user = data.users[0];
              const username = user.username;
              if (username) {
                console.log('✅ Found FID:', username);
                setMusicData(prev => prev ? {
                  ...prev,
                  artist: `@${username}`
                } : null);
              }
            } else {
              console.warn('⚠️ No users in Neynar response');
            }
          } else {
            console.warn('⚠️ Neynar response not ok:', response.status);
          }
        } catch (err: any) {
          console.warn('⚠️ FID lookup failed:', err.message);
        }
      }
    };

    if (musicData) {
      resolveFid();
    }
  }, [musicData?.artistAddress]);

  const fetchMusicData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Fetching music data for token:', tokenId);

      // PRIORITY 1: Try Envio first - CORRECTED QUERY
      const query = `
        query GetMusicNFT($tokenId: String!) {
          MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
            tokenId
            name
            imageUrl
            price
            artist
            fullAudioUrl
            previewAudioUrl
            mintedAt
          }
        }
      `;

      console.log('📤 Sending Envio query for tokenId:', tokenId);
      const response = await fetch(
        process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { tokenId } }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('📥 Envio response:', data);

        // ✅ CORRECTED: MusicNFT returns array directly, not nested in items
        const nft = data.data?.MusicNFT?.[0];

        if (nft && nft.name) {
          console.log('✅ Found in Envio:', nft);

          // ✅ Convert price from wei to readable TOURS
          let priceInTours = '0';
          if (nft.price) {
            try {
              const priceBI = BigInt(nft.price);
              const priceNum = Number(priceBI) / 1e18;
              priceInTours = priceNum.toString();
            } catch (e) {
              console.warn('Failed to convert price:', nft.price);
              priceInTours = String(nft.price);
            }
          }

          setMusicData({
            tokenId: nft.tokenId,
            name: nft.name,
            artist: nft.artist || 'Unknown Artist',
            artistAddress: nft.artist || 'Unknown Artist',
            price: priceInTours,
            imageUrl: nft.imageUrl || '',
            audioUrl: nft.fullAudioUrl || nft.previewAudioUrl || '',
            createdAt: nft.mintedAt,
          });
          return;
        } else {
          console.log('⚠️ No data in Envio response, falling back to blockchain');
        }
      } else {
        console.log('⚠️ Envio query failed:', response.status);
      }

      // PRIORITY 2: If not in Envio, try blockchain directly
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

      const MUSIC_NFT_ADDRESS =
        (process.env.NEXT_PUBLIC_MUSIC_NFT as Address) ||
        ('0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6' as Address);

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
        const ipfsUrl = uriData.startsWith('ipfs://')
          ? `https://${PINATA_GATEWAY}/ipfs/${uriData.replace('ipfs://', '')}`
          : uriData;

        console.log('📥 Fetching metadata from IPFS:', ipfsUrl);
        const metadataResponse = await fetch(ipfsUrl);
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          console.log('✅ Got metadata from IPFS:', metadata);

          const audioUrl =
            metadata.animation_url || metadata.audio || metadata.full || metadata.audio_url || '';
          const audioHttpUrl = audioUrl.startsWith('ipfs://')
            ? `https://${PINATA_GATEWAY}/ipfs/${audioUrl.replace('ipfs://', '')}`
            : audioUrl;

          // ✅ Convert price from wei
          let priceInTours = '0';
          if (metadata.price) {
            try {
              const priceBI = BigInt(metadata.price);
              const priceNum = Number(priceBI) / 1e18;
              priceInTours = priceNum.toString();
            } catch (e) {
              console.warn('Failed to convert price:', metadata.price);
              priceInTours = String(metadata.price);
            }
          }

          const artistAddress = metadata.artist || 'Unknown Artist';

          setMusicData({
            tokenId,
            name: metadata.name || 'Untitled',
            artist: artistAddress,
            artistAddress: artistAddress,
            price: priceInTours,
            imageUrl: metadata.image || '',
            audioUrl: audioHttpUrl,
            createdAt: new Date().toISOString(),
          });
          return;
        }
      }

      setError('Music NFT not found on chain or indexer');
    } catch (err: any) {
      console.error('Error fetching music data:', err);
      setError(err.message || 'Failed to load music data');
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (ipfsUrl: string) => {
    if (!ipfsUrl) return '';
    if (ipfsUrl.startsWith('http')) return ipfsUrl;
    if (ipfsUrl.startsWith('ipfs://')) {
      const cid = ipfsUrl.replace('ipfs://', '');
      return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
    }
    return ipfsUrl;
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBuyLicense = async () => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      await requestWallet();
      return;
    }

    if (walletAddress.toLowerCase() === musicData?.artistAddress.toLowerCase()) {
      alert('You cannot buy your own music!');
      return;
    }

    setBuying(true);
    setPurchaseStatus('loading');
    setPurchaseMessage('⏳ Processing purchase...');

    try {
      console.log('💎 Starting purchase for token:', tokenId);
      console.log('🎵 Song:', musicData?.name);
      console.log('💰 Price:', musicData?.price, 'TOURS');

      const command = `buy_music ${tokenId}`;
      console.log('🤖 Executing command:', command);

      const result = await executeCommand(command);

      console.log('📤 Full purchase result:', result);
      console.log('📊 Result keys:', Object.keys(result));
      console.log('✔️ Success flag:', result?.success);
      console.log('📝 Message:', result?.message);
      console.log('🚨 Error:', result?.error);

      if (result?.success === true) {
        setPurchaseStatus('success');
        setPurchaseMessage(`🎉 License purchased!\n\n"${musicData?.name}"\n💰 ${musicData?.price} TOURS\n\nEnjoy your music!`);
        console.log('✅ Purchase successful - alert should show');

        // Show success message for 5 seconds
        setTimeout(() => {
          setPurchaseStatus('idle');
          setPurchaseMessage('');
        }, 5000);
      } else {
        const errorMsg = result?.error || result?.message || 'Purchase failed for unknown reason';
        setPurchaseStatus('error');
        setPurchaseMessage(`❌ Purchase failed:\n${errorMsg}`);
        console.error('❌ Purchase failed:', errorMsg);

        setTimeout(() => {
          setPurchaseStatus('idle');
          setPurchaseMessage('');
        }, 5000);
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error) || 'Unknown error';
      setPurchaseStatus('error');
      setPurchaseMessage(`❌ Purchase failed:\n${errorMsg}`);
      console.error('❌ Purchase error:', error);

      setTimeout(() => {
        setPurchaseStatus('idle');
        setPurchaseMessage('');
      }, 5000);
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🎵</div>
          <p className="text-white text-xl">Loading music...</p>
        </div>
      </div>
    );
  }

  if (error || !musicData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-red-400 text-xl mb-2">{error || 'Music NFT not found'}</p>
          <p className="text-gray-400 mb-6">Token ID: {tokenId}</p>
          <p className="text-gray-500 text-sm">Try again in a few moments if this is a newly minted token</p>
          <button
            onClick={fetchMusicData}
            className="mt-6 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
          >
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const imageUrl = getImageUrl(musicData.imageUrl);
  const priceNum = parseFloat(musicData.price);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-8">
      {/* Header */}
      <div className="border-b border-purple-500/20 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="text-3xl">🎵</div>
            <h1 className="text-2xl font-bold text-white">EmpowerTours</h1>
          </div>
          <p className="text-gray-400 text-xs mt-1">Stream Music NFTs on Monad</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Cover Art - ✅ FIXED: Smaller so entire image fits in box */}
        <div className="flex items-center justify-center">
          {imageUrl ? (
            <div className="w-full max-w-xs aspect-square rounded-3xl overflow-hidden shadow-2xl border-4 border-purple-500/30 flex items-center justify-center bg-gray-900">
              <img
                src={imageUrl}
                alt={musicData.name}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-full max-w-xs aspect-square bg-gradient-to-br from-purple-600 to-blue-600 rounded-3xl flex items-center justify-center shadow-2xl">
              <div className="text-9xl">🎵</div>
            </div>
          )}
        </div>

        {/* Song Info */}
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-2xl p-6 space-y-4">
          {/* Title */}
          <div>
            <p className="text-gray-400 text-sm mb-1">SONG TITLE</p>
            <h2 className="text-4xl font-bold text-white leading-tight">{musicData.name}</h2>
          </div>

          {/* Artist */}
          <div>
            <p className="text-gray-400 text-sm mb-1">ARTIST</p>
            <p className="text-xl text-gray-300 font-mono break-all">{musicData.artist}</p>
          </div>

          {/* Token ID */}
          <div>
            <p className="text-gray-400 text-sm mb-1">TOKEN ID</p>
            <p className="text-lg text-purple-400 font-bold">#{musicData.tokenId}</p>
          </div>
        </div>

        {/* Audio Player */}
        {musicData.audioUrl ? (
          <div className="bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/30 rounded-2xl p-6 space-y-4">
            <div className="space-y-2">
              <audio
                id="player"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onError={(e) => {
                  console.error('Audio error:', e);
                  setAudioError('Failed to load audio');
                }}
                onLoadStart={() => setAudioLoading(true)}
                onCanPlay={() => setAudioLoading(false)}
                className="w-full"
                controls
                crossOrigin="anonymous"
              >
                <source src={musicData.audioUrl} type="audio/mpeg" />
                <source src={musicData.audioUrl} type="audio/mp3" />
                <source src={musicData.audioUrl} type="audio/wav" />
                Your browser does not support audio playback.
              </audio>

              {/* Progress Bar */}
              {!audioError && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{formatTime(currentTime)}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-1">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-blue-500 h-1 rounded-full transition-all"
                      style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                    />
                  </div>
                  <span>{formatTime(duration)}</span>
                </div>
              )}

              {/* Status */}
              <div className="text-center text-sm">
                {audioLoading ? (
                  <p className="text-yellow-400">⏳ Loading audio...</p>
                ) : audioError ? (
                  <p className="text-red-400">❌ {audioError}</p>
                ) : isPlaying ? (
                  <p className="text-green-400">▶️ Now Playing</p>
                ) : (
                  <p className="text-gray-400">⏸️ Paused</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-2xl p-6 text-center">
            <p className="text-yellow-400">🎧 Audio not available yet</p>
          </div>
        )}

        {/* Price & Purchase */}
        <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl p-6 space-y-4">
          <div>
            <p className="text-gray-400 text-sm mb-2">LICENSE PRICE</p>
            <div className="flex items-baseline gap-2">
              <p className="text-5xl font-bold text-cyan-400">{priceNum}</p>
              <p className="text-2xl text-cyan-400 font-semibold">TOURS</p>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Own the license to stream this track forever
            </p>
          </div>

          {/* Purchase Status Alert */}
          {purchaseStatus !== 'idle' && (
            <div
              className={`p-4 rounded-xl border ${
                purchaseStatus === 'loading'
                  ? 'bg-blue-900/30 border-blue-600/50 text-blue-300'
                  : purchaseStatus === 'success'
                  ? 'bg-green-900/30 border-green-600/50 text-green-300'
                  : 'bg-red-900/30 border-red-600/50 text-red-300'
              }`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {purchaseMessage}
            </div>
          )}

          {/* Wallet Connection */}
          {!walletAddress ? (
            <div className="p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-xl">
              <p className="text-yellow-300 text-sm mb-3">📱 Connect your wallet to purchase</p>
              <button
                onClick={requestWallet}
                className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-bold transition-all"
              >
                🔗 Connect Wallet
              </button>
            </div>
          ) : walletAddress.toLowerCase() === musicData.artistAddress.toLowerCase() ? (
            <div className="p-4 bg-gray-700/50 border border-gray-600 rounded-xl text-center">
              <p className="text-gray-300">✓ This is your music</p>
            </div>
          ) : (
            <button
              onClick={handleBuyLicense}
              disabled={buying || commandLoading || purchaseStatus === 'loading'}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all active:scale-95"
            >
              {buying || commandLoading || purchaseStatus === 'loading' ? (
                <>⏳ Processing...</>
              ) : (
                <>💎 Purchase License</>
              )}
            </button>
          )}

          {/* Mobile Info */}
          {isMobile && walletAddress && (
            <p className="text-gray-400 text-xs text-center">
              📱 Transaction will use your Farcaster custody address
            </p>
          )}
        </div>

        {/* Info Footer */}
        <div className="text-center space-y-2 text-gray-400 text-xs">
          <p>⚡ Powered by EmpowerTours on Monad</p>
          <p>Artist retains NFT ownership • 10% royalties per sale</p>
        </div>
      </div>
    </div>
  );
}
