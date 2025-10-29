'use client';
import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { PassportSVG } from '@/components/PassportSVG';
import Link from 'next/link';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

interface MusicMetadata {
  animation_url?: string;
  external_url?: string;
  image?: string;
  name?: string;
  description?: string;
}
interface MusicNFTWithMetadata {
  id: string;
  tokenId?: string | number;
  licenseId?: string | number;
  masterTokenId?: string | number;
  owner?: string;
  licensee?: string;
  artist?: string;
  tokenURI?: string;
  price?: string | number;
  totalSold?: number;
  active?: boolean;
  mintedAt?: string;
  purchasedAt?: string;
  expiry?: number;
  txHash: string;
  metadata?: MusicMetadata;
  audioUrl?: string;
  type: 'master' | 'license';
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
  countryName?: string;
  region?: string;
  continent?: string;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
}

async function fetchPassportCountryCode(tokenURI: string): Promise<string | null> {
  try {
    const metadataUrl = tokenURI.startsWith('ipfs://')
      ? tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/')
      : tokenURI;
    const response = await fetch(metadataUrl);
    if (!response.ok) return null;
    const metadata: PassportMetadata = await response.json();
    const countryAttr = metadata.attributes?.find(
      (attr) => attr.trait_type.toLowerCase() === 'country code'
    );
    return countryAttr ? countryAttr.value.toUpperCase() : null;
  } catch (error) {
    return null;
  }
}

export default function ProfilePage() {
  const { user, walletAddress, isMobile, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();
  const [passportNFTs, setPassportNFTs] = useState<PassportNFT[]>([]);
  const [musicNFTs, setMusicNFTs] = useState<MusicNFTWithMetadata[]>([]);
  const [createdMusic, setCreatedMusic] = useState<MusicNFTWithMetadata[]>([]);
  const [purchasedMusic, setPurchasedMusic] = useState<MusicNFTWithMetadata[]>([]);
  const [purchasedItineraries, setPurchasedItineraries] = useState<any[]>([]);
  const [balances, setBalances] = useState({ mon: '0', tours: '0' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [musicPage, setMusicPage] = useState(1);
  const [createdMusicPage, setCreatedMusicPage] = useState(1);
  const [purchasedMusicPage, setPurchasedMusicPage] = useState(1);
  const [passportPage, setPassportPage] = useState(1);
  const [queriedAddresses, setQueriedAddresses] = useState<string[]>([]);
  const [refreshMessage, setRefreshMessage] = useState<string>('');
  const ITEMS_PER_PAGE = 12;

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
        let data = await response.json();
        const safeAddr = (user as any)?.safeAddress;
        if (safeAddr && safeAddr.toLowerCase() !== walletAddress.toLowerCase()) {
          try {
            const safeResponse = await fetch('/api/get-balances', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: safeAddr }),
            });
            if (safeResponse.ok) {
              const safeData = await safeResponse.json();
              if (parseFloat(safeData.tours || '0') > parseFloat(data.tours || '0')) {
                data = safeData;
              }
            }
          } catch (err) {}
        }
        setBalances(data);
      }
    } catch (error) {}
  };

  const loadAllData = async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const addressesToQuery = [
        walletAddress.toLowerCase(),
        (user as any)?.safeAddress?.toLowerCase?.(),
        (user as any)?.smartAccountAddress?.toLowerCase?.(),
        (user as any)?.verifiedAddresses?.eth_addresses?.[0]?.toLowerCase(),
        (user as any)?.custodyAddress?.toLowerCase(),
      ]
        .filter(addr => addr && addr !== '0x0000000000000000000000000000000000000000')
        .map(addr => addr!.toLowerCase());
      const uniqueAddresses = [...new Set(addressesToQuery)].filter(a => a);
      setQueriedAddresses(uniqueAddresses);

      const query = `
        query GetUserData($addresses: [String!]!) {
          PassportNFT(where: {owner: {_in: $addresses}}, order_by: {mintedAt: desc}, limit: 100) {
            id
            tokenId
            owner
            countryCode
            countryName
            region
            continent
            tokenURI
            mintedAt
            txHash
          }
          MusicNFT(where: {artist: {_in: $addresses}}, order_by: {mintedAt: desc}, limit: 100) {
            id
            tokenId
            artist
            tokenURI
            mintedAt
            txHash
            price
            name
            imageUrl
            previewAudioUrl
            fullAudioUrl
            metadataFetched
            totalSold
            active
          }
          MusicLicense(where: {licensee: {_in: $addresses}}, order_by: {purchasedAt: desc}, limit: 100) {
            id
            licenseId
            masterTokenId
            licensee
            expiry
            active
            purchasedAt
            txHash
          }
          ItineraryPurchase(where: {buyer: {_in: $addresses}}, order_by: {timestamp: desc}, limit: 50) {
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
        body: JSON.stringify({ query, variables: { addresses: uniqueAddresses } }),
      });
      if (!response.ok) throw new Error(`Envio API returned ${response.status}`);
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0]?.message || 'GraphQL query failed');

      let passports: PassportNFT[] = result.data?.PassportNFT || [];
      const createdMusicNFTs = result.data?.MusicNFT || [];
      const purchasedLicenses = result.data?.MusicLicense || [];
      const purchases = result.data?.ItineraryPurchase || [];

      passports = await Promise.all(
        passports.map(async (passport) => {
          if (passport.countryCode) return passport;
          const countryCode = await fetchPassportCountryCode(passport.tokenURI);
          return { ...passport, countryCode: countryCode || 'XX' };
        })
      );
      setPassportNFTs(passports);

      const createdMusicWithType: MusicNFTWithMetadata[] = createdMusicNFTs.map((nft: any) => ({
        ...nft,
        type: 'master' as const,
        metadata: {
          name: nft.name,
          image: nft.imageUrl,
          animation_url: nft.previewAudioUrl,
        },
        audioUrl: nft.previewAudioUrl,
        price: (Number(nft.price) / 1e18).toFixed(6),
      }));
      setCreatedMusic(createdMusicWithType);

      const purchasedMusicWithType: MusicNFTWithMetadata[] = purchasedLicenses.map((license: any) => ({
        ...license,
        type: 'license' as const,
      }));
      setPurchasedMusic(purchasedMusicWithType);

      setMusicNFTs([...createdMusicWithType, ...purchasedMusicWithType]);
      setPurchasedItineraries(purchases);
    } catch (error: any) {
      setError(error.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const paginatedCreatedMusic = createdMusic.slice(
    (createdMusicPage - 1) * ITEMS_PER_PAGE,
    createdMusicPage * ITEMS_PER_PAGE
  );
  const paginatedPurchasedMusic = purchasedMusic.slice(
    (purchasedMusicPage - 1) * ITEMS_PER_PAGE,
    purchasedMusicPage * ITEMS_PER_PAGE
  );
  const paginatedPassports = passportNFTs.slice(
    (passportPage - 1) * ITEMS_PER_PAGE,
    passportPage * ITEMS_PER_PAGE
  );
  const totalCreatedMusicPages = Math.ceil(createdMusic.length / ITEMS_PER_PAGE);
  const totalPurchasedMusicPages = Math.ceil(purchasedMusic.length / ITEMS_PER_PAGE);
  const totalPassportPages = Math.ceil(passportNFTs.length / ITEMS_PER_PAGE);

  const copyArtistLink = () => {
    const link = `${window.location.origin}/artist/${walletAddress}`;
    navigator.clipboard.writeText(link);
    alert('Artist profile link copied!\n\nShare this with fans so they can buy your music directly.');
  };

  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">Loading...</div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (contextError || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md">
          <div className="text-6xl mb-4">Warning</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Not in Farcaster</h1>
          <p className="text-gray-600 mb-6">
            This Mini App must be opened in Warpcast or another Farcaster client.
          </p>
          <p className="text-sm text-gray-500">Error: {contextError?.message || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
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
                {user.username?.charAt(0).toUpperCase() || 'User'}
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
                Mobile Wallet Connected
              </p>
              <p className="text-blue-700 text-xs">
                {walletAddress
                  ? `Using Account Abstraction (Safe Smart Account): ${walletAddress.slice(0, 10)}...`
                  : 'Wallet not connected - some features may be limited'
                }
              </p>
              {queriedAddresses.length > 1 && (
                <p className="text-blue-600 text-xs mt-2">
                  Searching {queriedAddresses.length} addresses
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">Warning {error}</p>
              <button
                onClick={loadAllData}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {refreshMessage && (
            <div className="mb-6 p-4 bg-blue-100 border-2 border-blue-400 rounded-lg">
              <p className="text-blue-700 font-medium">{refreshMessage}</p>
            </div>
          )}

          {(createdMusic.length > 0 || purchasedMusic.length > 0) && walletAddress && (
            <div className="mb-8 p-6 bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    Your Artist Profile
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
                  View My Artist Profile
                </Link>
                <button
                  onClick={copyArtistLink}
                  className="px-6 py-3 bg-white border-2 border-purple-600 text-purple-600 rounded-lg font-bold hover:bg-purple-50 transition-all active:scale-95 touch-manipulation"
                >
                  Copy Link
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-5 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border-2 border-yellow-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1 font-medium">MON Balance</p>
                  <p className="text-2xl font-bold text-yellow-700">{balances.mon}</p>
                  <p className="text-xs text-gray-500 mt-1">Native Token</p>
                </div>
                <div className="text-3xl">Money</div>
              </div>
            </div>
            <div className="p-5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border-2 border-green-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1 font-medium">TOURS Balance</p>
                  <p className="text-2xl font-bold text-green-700">{balances.tours}</p>
                  <p className="text-xs text-gray-500 mt-1">EmpowerTours Token</p>
                </div>
                <div className="text-3xl">Ticket</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-purple-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-purple-600">{passportNFTs.length}</p>
              <p className="text-sm text-gray-600">Passports</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-blue-600">{createdMusic.length}</p>
              <p className="text-sm text-gray-600">Created</p>
            </div>
            <div className="p-4 bg-pink-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-pink-600">{purchasedMusic.length}</p>
              <p className="text-sm text-gray-600">Purchased</p>
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
              Get Passport
            </Link>
            <Link
              href="/music"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center text-sm font-medium transition-all"
            >
              Mint Music
            </Link>
            <Link
              href="/market"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center text-sm font-medium transition-all"
            >
              Browse Market
            </Link>
          </div>

          <div className="space-y-8">
            {/* Created Music */}
            {createdMusic.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Music I Created</h2>
                  <span className="text-sm text-gray-500">
                    {createdMusic.length} total | Page {createdMusicPage} of {totalCreatedMusicPages || 1}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {paginatedCreatedMusic.map((nft) => (
                    <div
                      key={nft.id}
                      className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl hover:border-blue-400 transition-all shadow-sm hover:shadow-md"
                    >
                      {nft.metadata?.image ? (
                        <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                          <img
                            src={nft.metadata.image}
                            alt={nft.metadata.name || `Music NFT #${nft.tokenId}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-full aspect-square bg-gradient-to-br from-blue-200 to-purple-200 flex items-center justify-center rounded-t-xl">
                          <span className="text-6xl">Music</span>
                        </div>
                      )}
                      <div className="p-4 space-y-3">
                        <div className="text-center">
                          <p className="font-mono text-sm font-bold text-blue-900">
                            {nft.metadata?.name || `Music NFT #${nft.tokenId}`}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {nft.mintedAt ? new Date(nft.mintedAt).toLocaleDateString() : 'Recently minted'}
                          </p>
                          {nft.price && (
                            <p className="text-xs text-green-600 font-bold mt-1">
                              {nft.price} TOURS
                            </p>
                          )}
                        </div>
                        {nft.audioUrl ? (
                          <div className="bg-white rounded-lg p-2 border border-blue-200">
                            <audio
                              controls
                              preload="metadata"
                              className="w-full"
                              style={{ height: '40px' }}
                            >
                              <source src={nft.audioUrl} type="audio/mpeg" />
                              <source src={nft.audioUrl} type="audio/wav" />
                            </audio>
                            <p className="text-xs text-gray-500 text-center mt-1">
                              Preview
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
                              href={nft.tokenURI.startsWith('ipfs://')
                                ? nft.tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/')
                                : nft.tokenURI}
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
                {totalCreatedMusicPages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    <button
                      onClick={() => setCreatedMusicPage(p => Math.max(1, p - 1))}
                      disabled={createdMusicPage === 1}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      ← Prev
                    </button>
                    <span className="px-4 py-2 bg-gray-100 rounded-lg">
                      {createdMusicPage} / {totalCreatedMusicPages}
                    </span>
                    <button
                      onClick={() => setCreatedMusicPage(p => Math.min(totalCreatedMusicPages, p + 1))}
                      disabled={createdMusicPage === totalCreatedMusicPages}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Purchased Music */}
            {purchasedMusic.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Music I Purchased</h2>
                  <span className="text-sm text-gray-500">
                    {purchasedMusic.length} total | Page {purchasedMusicPage} of {totalPurchasedMusicPages || 1}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {paginatedPurchasedMusic.map((license) => (
                    <div
                      key={license.id}
                      className="bg-gradient-to-br from-pink-50 to-rose-50 border-2 border-pink-200 rounded-xl hover:border-pink-400 transition-all shadow-sm hover:shadow-md"
                    >
                      <div className="w-full aspect-square bg-gradient-to-br from-pink-200 to-rose-200 flex items-center justify-center rounded-t-xl">
                        <span className="text-6xl">Headphones</span>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="text-center">
                          <p className="font-mono text-sm font-bold text-pink-900">
                            License #{license.licenseId}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Master #{license.masterTokenId}
                          </p>
                          {license.purchasedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              Purchased: {new Date(String(license.purchasedAt)).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-pink-200 text-center">
                          {license.active ? (
                            <>
                              <p className="text-xs text-green-600 font-bold mb-1">License Active</p>
                              {license.expiry && (
                                <p className="text-xs text-gray-600">
                                  Expires: {new Date(Number(license.expiry) * 1000).toLocaleDateString()}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-red-600 font-bold">License Expired</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {license.txHash && (
                            <a
                              href={`https://testnet.monadscan.com/tx/${license.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 px-3 py-2 bg-pink-600 text-white text-xs rounded-lg hover:bg-pink-700 transition-all text-center"
                            >
                              View TX
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {totalPurchasedMusicPages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    <button
                      onClick={() => setPurchasedMusicPage(p => Math.max(1, p - 1))}
                      disabled={purchasedMusicPage === 1}
                      className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
                    >
                      ← Prev
                    </button>
                    <span className="px-4 py-2 bg-gray-100 rounded-lg">
                      {purchasedMusicPage} / {totalPurchasedMusicPages}
                    </span>
                    <button
                      onClick={() => setPurchasedMusicPage(p => Math.min(totalPurchasedMusicPages, p + 1))}
                      disabled={purchasedMusicPage === totalPurchasedMusicPages}
                      className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Passports */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">My Travel Passports</h2>
                <span className="text-sm text-gray-500">
                  {passportNFTs.length} total | Page {passportPage} of {totalPassportPages || 1}
                </span>
              </div>
              {passportNFTs.length === 0 ? (
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
                    {paginatedPassports.map((passport) => (
                      <div
                        key={passport.id}
                        className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl hover:border-purple-400 transition-all shadow-sm hover:shadow-md overflow-hidden"
                      >
                        <div
                          className="w-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center p-2"
                          style={{ aspectRatio: '2/3' }}
                        >
                          <PassportSVG
                            countryCode={passport.countryCode || 'XX'}
                            tokenId={passport.tokenId}
                          />
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
                                href={passport.tokenURI.startsWith('ipfs://')
                                  ? passport.tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/')
                                  : passport.tokenURI}
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

            {/* Itineraries */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">My Purchased Itineraries</h2>
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
              {loading ? 'Refreshing...' : 'Refresh All Data'}
            </button>
            <p className="text-xs text-gray-500 mt-2">Powered by Envio Indexer</p>
            {queriedAddresses.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Querying {queriedAddresses.length} address{queriedAddresses.length === 1 ? '' : 'es'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
