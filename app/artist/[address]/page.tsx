'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';
import { isAddress } from 'viem';
import Link from 'next/link';

// ENV
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/32e51fc/v1/graphql';

// Types
interface MusicMetadata {
  name?: string;
  image?: string;
  animation_url?: string;
}

interface MusicNFT {
  id: string;
  tokenId: string;
  artist: string;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
  price: string;
  name: string;
  imageUrl: string;
  previewAudioUrl: string;
  fullAudioUrl: string;
  metadataFetched: boolean;
}

interface ArtistMusic {
  tokenId: number;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
  metadata?: MusicMetadata;
  price?: string;
}

interface ArtistInfo {
  address: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  fid?: number;
}

interface GraphQLResponse {
  data?: { MusicNFT: MusicNFT[] };
  errors?: Array<{ message: string }>;
}

export default function ArtistProfilePage() {
  const params = useParams();
  const router = useRouter();
  const artistAddress = params.address as string;
  const { user, walletAddress, isMobile, requestWallet } = useFarcasterContext();
  const { executeCommand, loading: commandLoading, error: commandError } = useBotCommand();
  
  const [artistMusic, setArtistMusic] = useState<ArtistMusic[]>([]);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);
  const [audioErrors, setAudioErrors] = useState<Record<number, string>>({});
  const [audioLoading, setAudioLoading] = useState<Record<number, boolean>>({});

  // IPFS URL Resolver Function
  const resolveIPFS = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('ipfs://')) {
      return url.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/');
    }
    if (url.includes('/ipfs/')) {
      const cid = url.split('/ipfs/')[1]?.split('?')[0];
      return `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${cid}`;
    }
    return url;
  };

  useEffect(() => {
    if (artistAddress && isAddress(artistAddress)) {
      loadArtistProfile();
      loadArtistInfo();
    } else {
      console.error('Invalid artist address:', artistAddress);
      setArtistInfo(null);
      setArtistMusic([]);
    }
  }, [artistAddress]);

  const loadArtistInfo = async () => {
    try {
      const neynarApiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
      // Strategy 1: by_verification
      try {
        const response1 = await fetch(
          `https://api.neynar.com/v2/farcaster/user/by_verification?address=${artistAddress}`,
          { headers: { 'api_key': neynarApiKey } }
        );
        if (response1.ok) {
          const data = await response1.json();
          if (data?.user) {
            setArtistInfo({
              address: artistAddress,
              username: data.user.username,
              displayName: data.user.display_name || data.user.username,
              pfpUrl: data.user.pfp_url,
              fid: data.user.fid,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('by_verification failed:', err);
      }

      // Strategy 2: search
      try {
        const response2 = await fetch(
          `https://api.neynar.com/v2/farcaster/user/search?q=${artistAddress}&limit=1`,
          { headers: { 'api_key': neynarApiKey } }
        );
        if (response2.ok) {
          const data = await response2.json();
          const user = data?.result?.users?.[0];
          if (user) {
            const hasAddress =
              user.verified_addresses?.eth_addresses?.some(
                (a: string) => a.toLowerCase() === artistAddress.toLowerCase()
              ) || user.custody_address?.toLowerCase() === artistAddress.toLowerCase();
            if (hasAddress) {
              setArtistInfo({
                address: artistAddress,
                username: user.username,
                displayName: user.display_name || user.username,
                pfpUrl: user.pfp_url,
                fid: user.fid,
              });
              return;
            }
          }
        }
      } catch (err) {
        console.warn('search failed:', err);
      }

      // Fallback
      setArtistInfo({
        address: artistAddress,
        username: `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
        displayName: `Artist ${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
      });
    } catch (error) {
      console.error('Error loading artist info:', error);
      setArtistInfo({
        address: artistAddress,
        username: `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
        displayName: `Artist ${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
      });
    }
  };

  const loadArtistProfile = async () => {
    setLoading(true);
    try {
      const query = `
        query GetArtistMusic($address: String!) {
          MusicNFT(
            where: {
              artist: {_eq: $address},
              isBurned: {_eq: false}
            },
            order_by: {mintedAt: desc},
            limit: 50
          ) {
            id
            tokenId
            tokenURI
            mintedAt
            txHash
            price
            name
            imageUrl
            previewAudioUrl
            fullAudioUrl
            metadataFetched
          }
        }
      `;
      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { address: artistAddress.toLowerCase() } }),
      });
      if (!response.ok) throw new Error(`Envio API error: ${response.status}`);
      const result: GraphQLResponse = await response.json();
      if (result.errors) throw new Error(result.errors.map(e => e.message).join(', '));
      const music = result.data?.MusicNFT || [];

      const artistMusicMapped = music.map((nft: MusicNFT) => ({
        tokenId: Number(nft.tokenId),
        tokenURI: nft.tokenURI,
        mintedAt: nft.mintedAt,
        txHash: nft.txHash,
        metadata: {
          name: nft.name,
          image: resolveIPFS(nft.imageUrl),
          animation_url: resolveIPFS(nft.previewAudioUrl),
        },
        price: (Number(nft.price) / 1e18).toFixed(6),
      }));

      console.log('Loaded music with resolved URLs', artistMusicMapped);
      setArtistMusic(artistMusicMapped);
    } catch (error: any) {
      console.error('Error loading artist profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyLicense = async (music: ArtistMusic) => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      await requestWallet();
      return;
    }
    if (walletAddress.toLowerCase() === artistAddress.toLowerCase()) {
      alert('You cannot buy your own music!');
      return;
    }
    setBuying(music.tokenId);
    try {
      const command = `buy music ${music.tokenId}`;
      
      // ✅ USE THE HOOK INSTEAD OF FETCH
      const result = await executeCommand(command);
      
      if (!result.success) {
        throw new Error(result.error || 'Purchase failed');
      }
      
      alert(`Buying "${music.metadata?.name || 'track'}"!\n\nPrice: ${music.price} TOURS\n\nTX: ${result.txHash}`);
      setTimeout(() => loadArtistProfile(), 2000);
    } catch (error: any) {
      alert(`Purchase failed: ${error.message}`);
    } finally {
      setBuying(null);
    }
  };

  const handleAudioError = (tokenId: number, audioUrl: string, error: any) => {
    console.error(`Audio failed to load for track #${tokenId}:`, {
      url: audioUrl,
      error: error.currentTarget?.error,
      networkState: error.currentTarget?.networkState,
      readyState: error.currentTarget?.readyState
    });
    setAudioErrors(prev => ({
      ...prev,
      [tokenId]: 'Failed to load audio'
    }));
    setAudioLoading(prev => ({
      ...prev,
      [tokenId]: false
    }));
  };

  const handleAudioLoaded = (tokenId: number, audioUrl: string) => {
    console.log(`Audio loaded successfully for track #${tokenId}:`, {
      url: audioUrl,
      duration: 'loaded'
    });
    setAudioErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[tokenId];
      return newErrors;
    });
    setAudioLoading(prev => ({
      ...prev,
      [tokenId]: false
    }));
  };

  const handleAudioCanPlay = (tokenId: number) => {
    console.log(`Audio can play for track #${tokenId}`);
    setAudioLoading(prev => ({
      ...prev,
      [tokenId]: false
    }));
  };

  const handleAudioLoadStart = (tokenId: number) => {
    setAudioLoading(prev => ({
      ...prev,
      [tokenId]: true
    }));
  };

  if (loading && artistMusic.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🎵</div>
          <p className="text-gray-600">Loading artist profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Artist Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center gap-6 mb-6">
            {artistInfo?.pfpUrl ? (
              <img
                src={artistInfo.pfpUrl}
                alt={artistInfo.username || 'Artist'}
                className="w-24 h-24 rounded-full border-2 border-purple-300 shadow-lg object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                🎵
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {artistInfo?.displayName || 'Loading...'}
              </h1>
              {artistInfo?.username && (
                <p className="text-gray-600 text-lg mb-2">@{artistInfo.username}</p>
              )}
              <p className="text-gray-600 font-mono text-sm">
                {artistAddress.slice(0, 10)}...{artistAddress.slice(-8)}
              </p>
              <div className="flex gap-3 mt-4">
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                  {artistMusic.length} Tracks
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  Live on Monad
                </span>
              </div>
            </div>
          </div>
          {isMobile && !walletAddress && (
            <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
              <p className="text-yellow-900 text-sm font-medium mb-2">
                📱 Mobile: Using Farcaster Wallet
              </p>
              <p className="text-yellow-700 text-xs">
                Transactions will use your Farcaster custody address. Make sure it has TOURS tokens + MON for gas.
              </p>
              {!walletAddress && (
                <button
                  onClick={requestWallet}
                  className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          )}
          {walletAddress && (
            <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-green-900 text-sm">
                ✅ Connected:{' '}
                <span className="font-mono text-xs">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </p>
              {isMobile && (
                <p className="text-green-700 text-xs mt-1">
                  Using Farcaster custody address
                </p>
              )}
            </div>
          )}
        </div>

        {/* Music Catalog */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            🎵 Music Catalog
          </h2>
          {artistMusic.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl">
              <div className="text-6xl mb-4">🎵</div>
              <p className="text-gray-600 text-lg">No music available yet</p>
              <p className="text-gray-500 text-sm mt-2">This artist hasn't minted any music NFTs</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {artistMusic.map((music) => (
                <div
                  key={music.tokenId}
                  className="bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 transition-all shadow-sm hover:shadow-lg"
                >
                  {music.metadata?.image ? (
                    <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                      <img
                        src={music.metadata.image}
                        alt={music.metadata.name || `Track #${music.tokenId}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center rounded-t-xl">
                      <span className="text-7xl">🎵</span>
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <div>
                      <p className="font-bold text-gray-900 text-lg truncate">
                        {music.metadata?.name || `Track #${music.tokenId}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        Minted {new Date(music.mintedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {music.metadata?.animation_url ? (
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                        {audioLoading[music.tokenId] && (
                          <div className="text-center py-2">
                            <div className="animate-spin inline-block text-xl">⏳</div>
                            <p className="text-xs text-gray-500 mt-1">Loading audio...</p>
                          </div>
                        )}
                        <audio
                          controls
                          preload="metadata"
                          crossOrigin="anonymous"
                          className="w-full"
                          style={{ height: '40px' }}
                          onLoadStart={() => handleAudioLoadStart(music.tokenId)}
                          onError={(e) => handleAudioError(music.tokenId, music.metadata?.animation_url || '', e)}
                          onLoadedMetadata={() => handleAudioLoaded(music.tokenId, music.metadata?.animation_url || '')}
                          onCanPlay={() => handleAudioCanPlay(music.tokenId)}
                        >
                          <source src={music.metadata.animation_url} type="audio/mpeg" />
                          <source src={music.metadata.animation_url} type="audio/mp3" />
                          <source src={music.metadata.animation_url} type="audio/wav" />
                          <source src={music.metadata.animation_url} type="audio/ogg" />
                          Your browser does not support audio playback.
                        </audio>
                        {audioErrors[music.tokenId] ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-red-500 text-center">
                              ⚠️ {audioErrors[music.tokenId]}
                            </p>
                            <button
                              onClick={() => {
                                // Try opening in new tab as fallback
                                window.open(music.metadata?.animation_url, '_blank');
                              }}
                              className="w-full text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                              Open Audio in New Tab
                            </button>
                            <p className="text-xs text-gray-400 text-center break-all">
                              {music.metadata.animation_url}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 text-center mt-1">
                            🎧 Preview only - Buy to own full track
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                        <p className="text-xs text-gray-500">No preview available</p>
                      </div>
                    )}
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs text-gray-600">License Price</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {music.price || '0.01'} TOURS
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">+10% Royalties</p>
                          <p className="text-xs text-gray-500">to artist</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyLicense(music)}
                        disabled={
                          buying === music.tokenId ||
                          !walletAddress ||
                          walletAddress.toLowerCase() === artistAddress.toLowerCase() ||
                          commandLoading
                        }
                        className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 touch-manipulation"
                        style={{ minHeight: '56px' }}
                      >
                        {buying === music.tokenId || commandLoading
                          ? '⏳ Processing...'
                          : walletAddress?.toLowerCase() === artistAddress.toLowerCase()
                          ? '✓ Your Own Track'
                          : `💳 Buy License (${music.price || '0.01'} TOURS)`}
                      </button>
                      {music.txHash && (
                        <a
                          href={`https://testnet.monadscan.com/tx/${music.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center text-xs text-gray-500 hover:text-purple-600 mt-2"
                        >
                          View TX →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* How It Works */}
        <div className="mt-12 p-6 bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl border-2 border-purple-200">
          <h3 className="font-bold text-gray-900 mb-3">💡 How Music Licenses Work:</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>🎧 <strong>Preview:</strong> Listen to 3s preview for free</li>
            <li>💳 <strong>Buy License:</strong> Pay in TOURS tokens to access full track forever</li>
            <li>💰 <strong>Artist Royalties:</strong> 10% royalties on all sales go to the artist</li>
            <li>⚡ <strong>Instant Access:</strong> Full track unlocked immediately after purchase</li>
            <li>🪙 <strong>Payment:</strong> Uses TOURS tokens (not ETH) - swap MON for TOURS in Market</li>
          </ul>
          <p className="text-xs text-gray-600 mt-4">
            💎 Tip: Support artists directly! All purchases go straight to the artist's wallet.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/profile"
            className="inline-block px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-all"
          >
            ← Back to My Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
