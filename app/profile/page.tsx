'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { PassportSVG } from '@/components/PassportSVG';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

export default function ProfilePage() {
  const { user, walletAddress, isMobile, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();

  const [passportNFTs, setPassportNFTs] = useState<any[]>([]);
  const [musicNFTs, setMusicNFTs] = useState<any[]>([]);
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

      const passports = result.data?.PassportNFT || [];
      const music = result.data?.MusicNFT || [];
      const purchases = result.data?.ItineraryPurchase || [];

      console.log('✅ Loaded from Envio:', {
        passports: passports.length,
        music: music.length,
        purchases: purchases.length
      });

      setPassportNFTs(passports);
      setMusicNFTs(music);
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

  // Copy artist profile link to clipboard
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

          {/* Mobile Wallet Status */}
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

          {/* Artist Profile Link - NEW */}
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
                <a
                  href={`/artist/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-pink-700 text-center transition-all active:scale-95 touch-manipulation"
                >
                  👀 View My Artist Profile
                </a>
                <button
                  onClick={copyArtistLink}
                  className="px-6 py-3 bg-white border-2 border-purple-600 text-purple-600 rounded-lg font-bold hover:bg-purple-50 transition-all active:scale-95 touch-manipulation"
                >
                  📋 Copy Link
                </button>
              </div>
            </div>
          )}

          {/* Token Balances */}
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

          {/* NFT Stats */}
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

          {/* Quick Actions */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <a
              href="/passport"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center text-sm font-medium transition-all"
            >
              🎫 Get Passport
            </a>
            <a
              href="/music"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center text-sm font-medium transition-all"
            >
              🎵 Mint Music
            </a>
            <a
              href="/market"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center text-sm font-medium transition-all"
            >
              🛒 Browse Market
            </a>
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
                  <a
                    href="/music"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                  >
                    Mint Your First Track →
                  </a>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {paginatedMusic.map((nft, idx) => (
                      <div
                        key={nft.id || idx}
                        className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl hover:border-blue-400 transition-all shadow-sm hover:shadow-md"
                      >
                        <div className="w-full aspect-square bg-gradient-to-br from-blue-200 to-purple-200 flex items-center justify-center rounded-t-xl">
                          <span className="text-6xl">🎵</span>
                        </div>
                        
                        <div className="p-4 space-y-3">
                          <div className="text-center">
                            <p className="font-mono text-sm font-bold text-blue-900">
                              Music NFT #{nft.tokenId}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(nft.mintedAt).toLocaleDateString()}
                            </p>
                          </div>

                          {nft.tokenURI && (
                            <div className="bg-white rounded-lg p-2 border border-blue-200">
                              <audio
                                controls
                                preload="metadata"
                                className="w-full"
                                style={{ height: '40px' }}
                              >
                                <source
                                  src={nft.tokenURI.startsWith('ipfs://') 
                                    ? nft.tokenURI.replace('ipfs://', PINATA_GATEWAY)
                                    : nft.tokenURI}
                                  type="audio/mpeg"
                                />
                              </audio>
                            </div>
                          )}

                          <div className="flex gap-2">
                            {nft.txHash && (
                              <a
                                href={`https://testnet.monadexplorer.com/tx/${nft.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-all text-center"
                              >
                                View TX
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

            {/* Passports Section - Same pagination logic */}
            {/* ... (keep existing passport code) ... */}

            {/* Itineraries Section */}
            {/* ... (keep existing itineraries code) ... */}
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
