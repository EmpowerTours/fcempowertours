'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { PassportSVG } from '@/components/PassportSVG';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

export default function ProfilePage() {
  const { ready, authenticated, user, login } = usePrivy();

  // Get wallet address from Privy
  const getWalletAddress = () => {
    if (!user) return null;
    if (user.wallet?.address) return user.wallet.address;
    if (user.linkedAccounts && user.linkedAccounts.length > 0) {
      const walletAccount = user.linkedAccounts.find(
        (acc: any) => acc.type === 'wallet' || acc.address
      );
      if (walletAccount && 'address' in walletAccount) {
        return (walletAccount as any).address;
      }
    }
    return null;
  };

  const walletAddress = getWalletAddress();
  const farcasterUsername = user?.farcaster?.username;
  const farcasterFid = user?.farcaster?.fid;
  const farcasterPfp = (user?.farcaster as any)?.pfpUrl || user?.farcaster?.pfp;

  const [passportNFTs, setPassportNFTs] = useState<any[]>([]);
  const [musicNFTs, setMusicNFTs] = useState<any[]>([]);
  const [purchasedItineraries, setPurchasedItineraries] = useState<any[]>([]);
  const [balances, setBalances] = useState({ mon: '0', tours: '0' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          PassportNFT(where: {owner: {_eq: $address}}, order_by: {mintedAt: desc}, limit: 10) {
            id
            tokenId
            owner
            countryCode
            mintedAt
            txHash
          }
          MusicNFT(where: {owner: {_eq: $address}}, order_by: {mintedAt: desc}, limit: 10) {
            id
            tokenId
            owner
            tokenURI
            mintedAt
            txHash
          }
          ItineraryPurchase(where: {buyer: {_eq: $address}}, order_by: {timestamp: desc}, limit: 10) {
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

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md">
          <div className="text-6xl mb-4">👤</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Your Profile</h1>
          <p className="text-gray-600 mb-6">Sign in with Farcaster to view your NFTs and profile</p>
          <button
            onClick={login}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
          >
            Sign in with Farcaster
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Profile Header */}
          <div className="text-center mb-8">
            {farcasterPfp ? (
              <img
                src={farcasterPfp}
                alt={farcasterUsername || 'Profile'}
                className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-purple-200 shadow-lg object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                {farcasterUsername?.charAt(0).toUpperCase() || '👤'}
              </div>
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {farcasterUsername ? `@${farcasterUsername}` : 'Your Profile'}
            </h1>
            <p className="text-gray-600 font-mono text-sm">
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </p>
            {farcasterFid && (
              <p className="text-gray-500 text-sm mt-1">Farcaster FID: {farcasterFid}</p>
            )}
          </div>

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
            {/* Passport NFTs Section with SVG */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">🎫 Travel Passports</h2>
                <span className="text-sm text-gray-500">Last 10</span>
              </div>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-500">Loading...</p>
                </div>
              ) : passportNFTs.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600 mb-3">No passport NFTs yet</p>
                  <a
                    href="/passport"
                    className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
                  >
                    Mint Your First Passport →
                  </a>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {passportNFTs.map((nft, idx) => (
                    <div
                      key={nft.id || idx}
                      className="p-4 bg-purple-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 transition-all cursor-pointer"
                    >
                      <PassportSVG
                        countryCode={nft.countryCode || 'XX'}
                        tokenId={nft.tokenId}
                        className="w-full mb-3"
                      />
                      <p className="font-mono text-xs text-purple-900 text-center">#{nft.tokenId}</p>
                      {nft.countryCode && (
                        <p className="text-xs text-purple-700 text-center mt-1">{nft.countryCode}</p>
                      )}
                      {nft.txHash && (
                        <a
                          href={`https://testnet.monadexplorer.com/tx/${nft.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block text-center text-xs text-purple-600 hover:underline"
                        >
                          View TX →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Music NFTs Section with Audio */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">🎵 Music Collection</h2>
                <span className="text-sm text-gray-500">Last 10</span>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {musicNFTs.map((nft, idx) => (
                    <div
                      key={nft.id || idx}
                      className="group bg-blue-50 border-2 border-blue-200 rounded-lg hover:border-blue-400 transition-all overflow-hidden"
                    >
                      <div className="w-full h-32 bg-gradient-to-br from-blue-200 to-purple-200 flex items-center justify-center">
                        <span className="text-4xl">🎵</span>
                      </div>
                      <div className="p-2">
                        <p className="font-mono text-xs text-blue-900 text-center font-bold">
                          #{nft.tokenId}
                        </p>
                        {nft.tokenURI && (
                          <audio controls className="w-full mt-2" style={{ height: '32px' }}>
                            <source
                              src={nft.tokenURI.replace('ipfs://', PINATA_GATEWAY)}
                              type="audio/mpeg"
                            />
                          </audio>
                        )}
                        {nft.txHash && (
                          <a
                            href={`https://testnet.monadexplorer.com/tx/${nft.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 block text-center text-xs text-blue-600 hover:underline"
                          >
                            View TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Itineraries Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">🗺️ Purchased Itineraries</h2>
                <span className="text-sm text-gray-500">Last 10</span>
              </div>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : purchasedItineraries.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600 mb-3">No purchased itineraries yet</p>
                  <a
                    href="/market"
                    className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all"
                  >
                    Browse Itineraries →
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchasedItineraries.map((purchase, idx) => (
                    <div
                      key={purchase.id || idx}
                      className="p-4 bg-green-50 border-2 border-green-200 rounded-lg hover:border-green-400 transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-green-900">
                            🗺️ Itinerary #{purchase.itineraryId}
                          </p>
                          {purchase.itinerary?.description && (
                            <p className="text-sm text-green-800 mt-1">
                              {purchase.itinerary.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-green-700">
                            {purchase.itinerary?.price && (
                              <>
                                <span>
                                  Price: {(Number(purchase.itinerary.price) / 1e18).toFixed(2)} TOURS
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span>{new Date(purchase.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {purchase.txHash && (
                          <a
                            href={`https://testnet.monadexplorer.com/tx/${purchase.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-4 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-all"
                          >
                            View TX →
                          </a>
                        )}
                      </div>
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
