'use client';
import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { PassportSVG } from '@/components/PassportSVG';
import Link from 'next/link';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';
// Helper to resolve IPFS URLs
const resolveIPFS = (url: string) => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', PINATA_GATEWAY);
  }
  return url;
};
// Interface for NFT metadata
interface MusicMetadata {
  animation_url?: string;
  external_url?: string;
  image?: string;
  name?: string;
  description?: string;
}
interface MusicNFTWithMetadata {
  id: string;
  tokenId: number;
  owner: string;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
  metadata?: MusicMetadata;
  audioUrl?: string;
  isLoadingMetadata?: boolean;
}
interface PassportMetadata {
  name?: string;
  description?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}
interface PassportNFT {
  id: string;
  tokenId: number;
  owner: string;
  countryCode?: string;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
}
async function fetchPassportCountryCode(tokenURI: string): Promise<string | null> {
  try {
    const metadataUrl = resolveIPFS(tokenURI);
    const response = await fetch(metadataUrl);
    if (!response.ok) {
      console.error('Failed to fetch passport metadata:', response.status);
      return null;
    }
    const metadata: PassportMetadata = await response.json();
    const countryAttr = metadata.attributes?.find(
      (attr) => attr.trait_type.toLowerCase() === 'country code'
    );
    return countryAttr ? countryAttr.value.toUpperCase() : null;
  } catch (error) {
    console.error('Error fetching passport country code:', error);
    return null;
  }
}
export default function ProfilePage() {
  const { user, walletAddress, isMobile, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();
  const [passportNFTs, setPassportNFTs] = useState<PassportNFT[]>([]);
  const [musicNFTs, setMusicNFTs] = useState<MusicNFTWithMetadata[]>([]);
  const [purchasedItineraries, setPurchasedItineraries] = useState<any[]>([]);
  const [balances, setBalances] = useState({ mon: '0', tours: '0' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [musicPage, setMusicPage] = useState(1);
  const [passportPage, setPassportPage] = useState(1);
  const ITEMS_PER_PAGE = 12;
  useEffect(() => {
    if (user && !walletAddress) {
      requestWallet();
    }
  }, [user, walletAddress, requestWallet]);
  useEffect(() => {
    if (walletAddress) {
      loadAllData();
      loadBalances();
    }
  }, [walletAddress]);
  // Fetch metadata for a music NFT
  const fetchMusicMetadata = async (tokenURI: string): Promise<MusicMetadata | null> => {
    try {
      const metadataUrl = resolveIPFS(tokenURI);
      const response = await fetch(metadataUrl);
      if (!response.ok) {
        console.error('Failed to fetch metadata:', response.status);
        return null;
      }
      const metadata: MusicMetadata = await response.json();
      return metadata;
    } catch (error) {
      console.error('Error fetching music metadata:', error);
      return null;
    }
  };
  const loadBalances = async () => {
    if (!walletAddress) return;
    try {
      const response = await fetch('/api/get-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      if (response.ok) {
        const data = await response.json();
        setBalances(data);
      }
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };
  const loadAllData = async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const query = `
        query GetUserData($address: String!) {
          PassportNFT(where: {owner: {_eq: $address}}, order_by: {mintedAt: desc}, limit: 100) {
            id
            tokenId
            owner
            countryCode
            tokenURI
            mintedAt
            txHash
          }
          MusicNFT(where: {owner: {_eq: $address}}, order_by: {mintedAt: desc}, limit: 100) {
            id
            tokenId
            owner
            tokenURI
            mintedAt
            txHash
          }
          ItineraryPurchase(where: {buyer: {_eq: $address}}, order_by: {timestamp: desc}, limit: 50) {
            id
            itineraryId
            buyer
            timestamp
            txHash
            itinerary {
              itineraryId
              creator
              description
              price
              active
              createdAt
            }
          }
        }
      `;
      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { address: walletAddress.toLowerCase() }
        }),
      });
      if (!response.ok) {
        throw new Error(`Envio API returned ${response.status}`);
      }
      const result = await response.json();
      if (result.errors) {
        console.error('GraphQL errors:', result.errors);
        throw new Error(result.errors[0]?.message || 'GraphQL query failed');
      }
      let passports: PassportNFT[] = result.data?.PassportNFT || [];
      const music = result.data?.MusicNFT || [];
      const purchases = result.data?.ItineraryPurchase || [];
      console.log('✅ Loaded from Envio:', {
        passports: passports.length,
        music: music.length,
        purchases: purchases.length
      });
      // Enhance passports with countryCode from metadata if missing
      passports = await Promise.all(
        passports.map(async (passport) => {
          if (passport.countryCode) {
            return passport;
          }
          const countryCode = await fetchPassportCountryCode(passport.tokenURI);
          return { ...passport, countryCode: countryCode || 'XX' };  // Use 'XX' if fetch fails
        })
      );
      setPassportNFTs(passports);
      // Set music NFTs and start loading metadata
      const musicWithMetadata: MusicNFTWithMetadata[] = music.map((nft: any) => ({
        ...nft,
        isLoadingMetadata: true
      }));
      setMusicNFTs(musicWithMetadata);
      // Load metadata for each music NFT
      music.forEach(async (nft: any, index: number) => {
        const metadata = await fetchMusicMetadata(nft.tokenURI);
        if (metadata) {
          // Use animation_url (preview clip) for playback in profile
          const audioUrl = metadata.animation_url || metadata.external_url;
          setMusicNFTs(prev => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              metadata,
              audioUrl,
              isLoadingMetadata: false
            };
            return updated;
          });
        } else {
          setMusicNFTs(prev => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              isLoadingMetadata: false
            };
            return updated;
          });
        }
      });
      setPurchasedItineraries(purchases);
    } catch (error: any) {
      console.error('❌ Error loading data from Envio:', error);
      setError(error.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  const paginatedMusic = musicNFTs.slice(
    (musicPage - 1) * ITEMS_PER_PAGE,
    musicPage * ITEMS_PER_PAGE
  );
  const paginatedPassports = passportNFTs.slice(
    (passportPage - 1) * ITEMS_PER_PAGE,
    passportPage * ITEMS_PER_PAGE
  );
  const totalMusicPages = Math.ceil(musicNFTs.length / ITEMS_PER_PAGE);
  const totalPassportPages = Math.ceil(passportNFTs.length / ITEMS_PER_PAGE);
  const copyArtistLink = () => {
    const link = `${window.location.origin}/artist/${walletAddress}`;
    navigator.clipboard.writeText(link);
    alert('✅ Artist profile link copied!\n\nShare this with fans so they can buy your music directly.');
  };
  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }
  if (contextError || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Not in Farcaster</h1>
          <p className="text-gray-600 mb-6">
            This Mini App must be opened in Warpcast or another Farcaster client.
          </p>
          <p className="text-sm text-gray-500">Error: {contextError}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Profile Header */}
          <div className="text-center mb-8">
            {user?.pfpUrl ? (
              <img
                src={user.pfpUrl}
                alt={user.username || 'Profile'}
                className="rounded-full mx-auto mb-4 border-2 border-purple-200 shadow-lg"
                style={{ width: '56px', height: '56px', objectFit: 'cover' }}
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 mx-auto mb-4 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                {user.username?.charAt(0).toUpperCase() || '👤'}
              </div>
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {user.username ? `@${user.username}` : 'Your Profile'}
            </h1>
            <p className="text-gray-600 font-mono text-sm">
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </p>
            {user.fid && (
              <p className="text-gray-500 text-sm mt-1">Farcaster FID: {user.fid}</p>
            )}
          </div>
          {isMobile && (
            <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <p className="text-blue-900 text-sm font-medium mb-1">
                📱 Mobile Wallet Connected
              </p>
              <p className="text-blue-700 text-xs">
                {walletAddress
                  ? `Using Farcaster custody address: ${walletAddress.slice(0, 10)}...`
                  : 'Wallet not connected - some features may be limited'
                }
              </p>
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">⚠️ {error}</p>
              <button
                onClick={loadAllData}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Try Again
              </button>
            </div>
          )}
          {musicNFTs.length > 0 && walletAddress && (
            <div className="mb-8 p-6 bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    🎵 Your Artist Profile
                  </h3>
                  <p className="text-sm text-gray-700">
                    Share this link with fans so they can buy your music directly!
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Link
                  href={`/artist/${walletAddress}`}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-pink-700 text-center transition-all active:scale-95 touch-manipulation"
                >
                  👀 View My Artist Profile
                </Link>
                <button
                  onClick={copyArtistLink}
                  className="px-6 py-3 bg-white border-2 border-purple-600 text-purple-600 rounded-lg font-bold hover:bg-purple-50 transition-all active:scale-95 touch-manipulation"
                >
                  📋 Copy Link
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-5 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border-2 border-yellow-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1 font-medium">MON Balance</p>
                  <p className="text-2xl font-bold text-yellow-700">{balances.mon}</p>
                  <p className="text-xs text-gray-500 mt-1">Native Token</p>
                </div>
                <div className="text-3xl">💰</div>
              </div>
            </div>
            <div className="p-5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border-2 border-green-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1 font-medium">TOURS Balance</p>
                  <p className="text-2xl font-bold text-green-700">{balances.tours}</p>
                  <p className="text-xs text-gray-500 mt-1">EmpowerTours Token</p>
                </div>
                <div className="text-3xl">🎫</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 bg-purple-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-purple-600">{passportNFTs.length}</p>
              <p className="text-sm text-gray-600">Passports</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-blue-600">{musicNFTs.length}</p>
              <p className="text-sm text-gray-600">Music NFTs</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-green-600">{purchasedItineraries.length}</p>
              <p className="text-sm text-gray-600">Itineraries</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-8">
            <Link
              href="/passport"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center text-sm font-medium transition-all"
            >
              🎫 Get Passport
            </Link>
            <Link
              href="/music"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center text-sm font-medium transition-all"
            >
              🎵 Mint Music
            </Link>
            <Link
              href="/market"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center text-sm font-medium transition-all"
            >
              🛒 Browse Market
            </Link>
          </div>
          <div className="space-y-8">
            {/* Music NFTs Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">🎵 My Music Collection</h2>
                <span className="text-sm text-gray-500">
                  {musicNFTs.length} total | Page {musicPage} of {totalMusicPages || 1}
                </span>
              </div>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-500">Loading...</p>
                </div>
              ) : musicNFTs.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600 mb-3">No music NFTs yet</p>
                  <Link
                    href="/music"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                  >
                    Mint Your First Track →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {paginatedMusic.map((nft, idx) => (
                      <div
                        key={nft.id || idx}
                        className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl hover:border-blue-400 transition-all shadow-sm hover:shadow-md"
                      >
                        {/* Cover Image */}
                        {nft.metadata?.image ? (
                          <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                            <img
                              src={resolveIPFS(nft.metadata.image)}
                              alt={nft.metadata.name || `Music NFT #${nft.tokenId}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full aspect-square bg-gradient-to-br from-blue-200 to-purple-200 flex items-center justify-center rounded-t-xl">
                            <span className="text-6xl">🎵</span>
                          </div>
                        )}
                        <div className="p-4 space-y-3">
                          <div className="text-center">
                            <p className="font-mono text-sm font-bold text-blue-900">
                              {nft.metadata?.name || `Music NFT #${nft.tokenId}`}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(nft.mintedAt).toLocaleDateString()}
                            </p>
                          </div>
                          {/* Audio Player */}
                          {nft.isLoadingMetadata ? (
                            <div className="bg-white rounded-lg p-3 border border-blue-200 text-center">
                              <p className="text-xs text-gray-500">Loading audio...</p>
                            </div>
                          ) : nft.audioUrl ? (
                            <div className="bg-white rounded-lg p-2 border border-blue-200">
                              <audio
                                controls
                                preload="metadata"
                                className="w-full"
                                style={{ height: '40px' }}
                              >
                                <source
                                  src={resolveIPFS(nft.audioUrl)}
                                  type="audio/mpeg"
                                />
                                <source
                                  src={resolveIPFS(nft.audioUrl)}
                                  type="audio/wav"
                                />
                                Your browser does not support audio playback.
                              </audio>
                              <p className="text-xs text-gray-500 text-center mt-1">
                                🔊 Preview Clip
                              </p>
                            </div>
                          ) : (
                            <div className="bg-white rounded-lg p-3 border border-blue-200 text-center">
                              <p className="text-xs text-gray-500">Audio unavailable</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            {nft.txHash && (
                              <a
                                href={`https://testnet.monadscan.com/tx/${nft.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-all text-center"
                              >
                                View TX
                              </a>
                            )}
                            {nft.tokenURI && (
                              <a
                                href={resolveIPFS(nft.tokenURI)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-2 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-all text-center"
                              >
                                Metadata
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {totalMusicPages > 1 && (
                    <div className="flex justify-center gap-2 mt-6">
                      <button
                        onClick={() => setMusicPage(p => Math.max(1, p - 1))}
                        disabled={musicPage === 1}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        ← Prev
                      </button>
                      <span className="px-4 py-2 bg-gray-100 rounded-lg">
                        {musicPage} / {totalMusicPages}
                      </span>
                      <button
                        onClick={() => setMusicPage(p => Math.min(totalMusicPages, p + 1))}
                        disabled={musicPage === totalMusicPages}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Passports Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">🎫 My Travel Passports</h2>
                <span className="text-sm text-gray-500">
                  {passportNFTs.length} total | Page {passportPage} of {totalPassportPages || 1}
                </span>
              </div>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-500">Loading passports...</p>
                </div>
              ) : passportNFTs.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600 mb-3">No passports yet</p>
                  <Link
                    href="/passport"
                    className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
                  >
                    Get Your First Passport →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {paginatedPassports.map((passport, idx) => (
                      <div
                        key={passport.id || idx}
                        className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl hover:border-purple-400 transition-all shadow-sm hover:shadow-md overflow-hidden"
                      >
                        <div
                          className="w-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center p-2"
                          style={{ aspectRatio: '2/3' }}
                        >
                          <div className="w-full h-full">
                            <PassportSVG 
                              countryCode={passport.countryCode || 'XX'} 
                              tokenId={passport.tokenId} 
                            />
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="text-center">
                            <p className="font-mono text-sm font-bold text-purple-900">
                              {passport.countryCode ? `${passport.countryCode} Passport` : `Passport #${passport.tokenId}`}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Minted: {new Date(passport.mintedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {passport.txHash && (
                              <a
                                href={`https://testnet.monadscan.com/tx/${passport.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-2 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-all text-center"
                              >
                                View TX
                              </a>
                            )}
                            {passport.tokenURI && (
                              <a
                                href={resolveIPFS(passport.tokenURI)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-2 bg-pink-600 text-white text-xs rounded-lg hover:bg-pink-700 transition-all text-center"
                              >
                                Metadata
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {totalPassportPages > 1 && (
                    <div className="flex justify-center gap-2 mt-6">
                      <button
                        onClick={() => setPassportPage(p => Math.max(1, p - 1))}
                        disabled={passportPage === 1}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                      >
                        ← Prev
                      </button>
                      <span className="px-4 py-2 bg-gray-100 rounded-lg">
                        {passportPage} / {totalPassportPages}
                      </span>
                      <button
                        onClick={() => setPassportPage(p => Math.min(totalPassportPages, p + 1))}
                        disabled={passportPage === totalPassportPages}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Itineraries Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">🗺️ My Purchased Itineraries</h2>
                <span className="text-sm text-gray-500">
                  {purchasedItineraries.length} total
                </span>
              </div>
              {purchasedItineraries.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600 mb-3">No itineraries purchased yet</p>
                  <Link
                    href="/market"
                    className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all"
                  >
                    Browse Marketplace →
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {purchasedItineraries.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 hover:border-green-400 transition-all"
                    >
                      <h3 className="font-bold text-gray-900 mb-2">
                        Itinerary #{purchase.itineraryId}
                      </h3>
                      <p className="text-sm text-gray-700 mb-2">
                        {purchase.itinerary?.description || 'Adventure itinerary'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Purchased: {new Date(purchase.timestamp).toLocaleDateString()}
                      </p>
                      {purchase.txHash && (
                        <a
                          href={`https://testnet.monadscan.com/tx/${purchase.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-block px-4 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-all"
                        >
                          View Transaction
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-8 text-center">
            <button
              onClick={() => {
                loadAllData();
                loadBalances();
              }}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
            >
              {loading ? '⏳ Refreshing...' : '🔄 Refresh All Data'}
            </button>
            <p className="text-xs text-gray-500 mt-2">Powered by Envio Indexer</p>
          </div>
        </div>
      </div>
    </div>
  );
}
