'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';
import { isAddress } from 'viem';
import Link from 'next/link';

// ENV
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';

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
  isArt: boolean; // ✅ ADD: Art vs Music flag
}

interface ArtistMusic {
  tokenId: number;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
  metadata?: MusicMetadata;
  price?: string;
  isArt: boolean; // ✅ ADD: Art vs Music flag
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
  const searchParams = useSearchParams();
  const artistAddress = params.address as string;
  const { user, walletAddress, isMobile, requestWallet } = useFarcasterContext();
  const { executeCommand, loading: commandLoading, error: commandError } = useBotCommand();

  // Check for autoplay params from frame
  const autoplayTokenId = searchParams.get('tokenId');
  const shouldAutoplay = searchParams.get('autoplay') === 'true';
  const audioRefs = useRef<Record<number, HTMLAudioElement | null>>({});
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);

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
    // Use AbortController to cancel stale requests when dependencies change
    const abortController = new AbortController();

    if (artistAddress && isAddress(artistAddress)) {
      loadArtistProfile();
      loadArtistInfo(abortController.signal);
    } else {
      console.error('Invalid artist address:', artistAddress);
      setArtistInfo(null);
      setArtistMusic([]);
    }

    // Cleanup: abort pending requests when effect re-runs
    return () => {
      abortController.abort();
    };
    // Re-run when Farcaster context loads (user/walletAddress)
  }, [artistAddress, user, walletAddress]);

  // Autoplay effect - triggers when music loads and autoplay is requested
  useEffect(() => {
    if (shouldAutoplay && autoplayTokenId && artistMusic.length > 0 && !hasAutoPlayed) {
      const tokenIdNum = parseInt(autoplayTokenId);
      const audioEl = audioRefs.current[tokenIdNum];

      if (audioEl) {
        console.log('🎵 Autoplay triggered for token:', tokenIdNum);
        // Small delay to ensure audio is ready
        setTimeout(() => {
          audioEl.play().then(() => {
            console.log('✅ Autoplay started');
            setHasAutoPlayed(true);
            // Scroll to the playing track
            audioEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }).catch((err) => {
            console.log('⚠️ Autoplay blocked by browser:', err.message);
            // Still mark as attempted to avoid retry loops
            setHasAutoPlayed(true);
          });
        }, 500);
      }
    }
  }, [artistMusic, shouldAutoplay, autoplayTokenId, hasAutoPlayed]);

  const loadArtistInfo = async (signal?: AbortSignal) => {
    try {
      const neynarApiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
      console.log('[Artist] Loading info for address:', artistAddress);

      // ✅ FIRST: Check if this is the current user's own profile
      // If so, use the Farcaster context directly (most reliable)
      if (walletAddress && artistAddress.toLowerCase() === walletAddress.toLowerCase() && user) {
        console.log('[Artist] This is the current user - using Farcaster context');
        // Handle both camelCase and snake_case property names from SDK/Neynar
        const pfp = user.pfpUrl || user.pfp_url || (user as any).pfp;
        const displayName = user.displayName || user.display_name || user.username;
        console.log('[Artist] User data:', { username: user.username, pfp, displayName });
        setArtistInfo({
          address: artistAddress,
          username: user.username,
          displayName: displayName,
          pfpUrl: pfp,
          fid: user.fid,
        });
        console.log('✅ Artist info loaded from Farcaster context:', user.username, 'pfp:', pfp);
        return;
      }

      // ✅ USE bulk_by_address endpoint (same as music/[tokenId] page)
      try {
        const url = `https://api.neynar.com/v2/farcaster/user/bulk_by_address?addresses=${artistAddress}`;
        console.log('[Artist] Fetching from Neynar:', url);
        const response = await fetch(url, {
          headers: { 'x-api-key': neynarApiKey },
          signal, // Pass abort signal
        });

        // Check if aborted before processing
        if (signal?.aborted) {
          console.log('[Artist] Request aborted, skipping state update');
          return;
        }

        console.log('[Artist] Neynar response status:', response.status);
        if (response.ok) {
          const data: any = await response.json();
          console.log('[Artist] Neynar data:', JSON.stringify(data, null, 2));
          const users = data[artistAddress.toLowerCase()];
          console.log('[Artist] Users found for address:', users);

          if (users && users.length > 0) {
            const user = users[0];
            if (!signal?.aborted) {
              setArtistInfo({
                address: artistAddress,
                username: user.username,
                displayName: user.display_name || user.username,
                pfpUrl: user.pfp_url,
                fid: user.fid,
              });
              console.log('✅ Artist info loaded via bulk_by_address:', user.username);
            }
            return;
          } else {
            console.warn('[Artist] No users found in Neynar response for address');
          }
        } else {
          console.warn('[Artist] Neynar response not OK:', response.status);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('[Artist] bulk_by_address aborted');
          return;
        }
        console.warn('❌ bulk_by_address failed:', err);
      }

      // Check abort before continuing to fallbacks
      if (signal?.aborted) return;

      // Fallback 2: Try custody-address endpoint
      try {
        const custodyUrl = `https://api.neynar.com/v2/farcaster/user/custody-address/?custody_address=${artistAddress}`;
        console.log('[Artist] Trying custody-address endpoint:', custodyUrl);
        const custodyResponse = await fetch(custodyUrl, {
          headers: { 'x-api-key': neynarApiKey },
          signal, // Pass abort signal
        });

        // Check if aborted
        if (signal?.aborted) return;

        if (custodyResponse.ok) {
          const custodyData = await custodyResponse.json();
          console.log('[Artist] Custody address data:', custodyData);
          if (custodyData.user) {
            const user = custodyData.user;
            if (!signal?.aborted) {
              setArtistInfo({
                address: artistAddress,
                username: user.username,
                displayName: user.display_name || user.username,
                pfpUrl: user.pfp_url,
                fid: user.fid,
              });
              console.log('✅ Artist info loaded via custody-address:', user.username);
            }
            return;
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('[Artist] custody-address aborted');
          return;
        }
        console.warn('❌ custody-address failed:', err);
      }

      // Check abort before fallback
      if (signal?.aborted) return;

      // Fallback 3: truncated address (no "Artist" prefix - redundant on artist page)
      console.log('⚠️ No Farcaster account found, using truncated address');
      const truncated = `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
      setArtistInfo({
        address: artistAddress,
        displayName: truncated,
      });
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('❌ Error loading artist info:', error);
      if (!signal?.aborted) {
        const truncated = `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
        setArtistInfo({
          address: artistAddress,
          displayName: truncated,
        });
      }
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
            isArt
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
        isArt: nft.isArt || false, // ✅ ADD: Include isArt flag
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
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
          <div className="mb-4">
            <p className="text-gray-500 text-sm mb-1">Artist</p>
            <h1 className="text-2xl font-bold text-gray-900">
              {artistInfo?.username ? `@${artistInfo.username}` : `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`}
            </h1>
            {artistInfo?.username && (
              <p className="text-gray-500 font-mono text-xs mt-1">
                {artistAddress.slice(0, 6)}...{artistAddress.slice(-4)}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
              {artistMusic.length} {artistMusic.length === 1 ? 'NFT' : 'NFTs'} Live on Monad
            </span>
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
        {artistMusic.filter(m => !m.isArt).length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              🎵 Music Catalog
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {artistMusic.filter(m => !m.isArt).map((music) => (
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
                          ref={(el) => { audioRefs.current[music.tokenId] = el; }}
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
          </div>
        )}

        {/* Art Catalog */}
        {artistMusic.filter(m => m.isArt).length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              🎨 Art Catalog
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {artistMusic.filter(m => m.isArt).map((art) => (
                <div
                  key={art.tokenId}
                  className="bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 transition-all shadow-sm hover:shadow-lg"
                >
                  {art.metadata?.image ? (
                    <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                      <img
                        src={art.metadata.image}
                        alt={art.metadata.name || `Art #${art.tokenId}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-blue-200 to-cyan-200 flex items-center justify-center rounded-t-xl">
                      <span className="text-7xl">🎨</span>
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <div>
                      <p className="font-bold text-gray-900 text-lg truncate">
                        {art.metadata?.name || `Art #${art.tokenId}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        Minted {new Date(art.mintedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                      <p className="text-xs text-gray-500">🎨 Visual Art NFT</p>
                    </div>
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs text-gray-600">License Price</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {art.price || '0.01'} TOURS
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">+10% Royalties</p>
                          <p className="text-xs text-gray-500">to artist</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyLicense(art)}
                        disabled={
                          buying === art.tokenId ||
                          !walletAddress ||
                          walletAddress.toLowerCase() === artistAddress.toLowerCase() ||
                          commandLoading
                        }
                        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-bold hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 touch-manipulation"
                        style={{ minHeight: '56px' }}
                      >
                        {buying === art.tokenId || commandLoading
                          ? '⏳ Processing...'
                          : walletAddress?.toLowerCase() === artistAddress.toLowerCase()
                          ? '✓ Your Own Art'
                          : `💳 Buy License (${art.price || '0.01'} TOURS)`}
                      </button>
                      {art.txHash && (
                        <a
                          href={`https://testnet.monadscan.com/tx/${art.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center text-xs text-gray-500 hover:text-blue-600 mt-2"
                        >
                          View TX →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No NFTs Message */}
        {artistMusic.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl">
            <div className="text-6xl mb-4">🎨🎵</div>
            <p className="text-gray-600 text-lg">No NFTs available yet</p>
            <p className="text-gray-500 text-sm mt-2">This artist hasn't minted any NFTs</p>
          </div>
        )}

        {/* How It Works */}
        <div className="mt-12 p-6 bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl border-2 border-purple-200">
          <h3 className="font-bold text-gray-900 mb-3">💡 How Music Licenses Work:</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>🎧 <strong>Preview:</strong> Listen to 3s preview for free</li>
            <li>💳 <strong>Buy License:</strong> Pay in WMON to access full track forever</li>
            <li>💰 <strong>Artist Royalties:</strong> 90% of sales go directly to the artist</li>
            <li>⚡ <strong>Instant Access:</strong> Full track unlocked immediately after purchase</li>
            <li>🪙 <strong>Payment:</strong> Uses WMON (Wrapped MON) - wrap your MON in the Market tab</li>
          </ul>
          <p className="text-xs text-gray-600 mt-4">
            💎 Tip: Support artists directly! 90% of every purchase goes straight to the artist.
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
