'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { PassportSVG } from '@/components/PassportSVG';
import Link from 'next/link';
import PageTransition, { FadeIn, ScaleIn } from '@/app/components/animations/PageTransition';
import AnimatedLoader from '@/app/components/animations/AnimatedLoader';
import { AnimatedStatCard } from '@/app/components/animations/AnimatedCard';
import PassportStakingModal from '@/app/components/PassportStakingModal';

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
  isStaked?: boolean;
  stakedAt?: string;
  staker?: string;
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
  const [balances, setBalances] = useState({ mon: '0', tours: '0', wmon: '0' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [musicPage, setMusicPage] = useState(1);
  const [createdMusicPage, setCreatedMusicPage] = useState(1);
  const [purchasedMusicPage, setPurchasedMusicPage] = useState(1);
  const [passportPage, setPassportPage] = useState(1);
  const [queriedAddresses, setQueriedAddresses] = useState<string[]>([]);
  const [refreshMessage, setRefreshMessage] = useState<string>('');
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});
  const [audioLoading, setAudioLoading] = useState<Record<string, boolean>>({}); // ✅ ADDED
  const [stakingNFT, setStakingNFT] = useState<string | null>(null);
  const [stakingError, setStakingError] = useState<string | null>(null);
  const [stakingSuccess, setStakingSuccess] = useState<string | null>(null);
  const [stakingInfo, setStakingInfo] = useState<Record<string, any>>({});
  const [pendingRewards, setPendingRewards] = useState<Record<string, string>>({});
  const [passportStakingModal, setPassportStakingModal] = useState<{ isOpen: boolean; passport: PassportNFT | null }>({
    isOpen: false,
    passport: null,
  });
  const ITEMS_PER_PAGE = 12;

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
    if (walletAddress) {
      loadAllData();
      loadBalances();
    }
  }, [walletAddress]);

  const handleAudioError = (id: string, audioUrl: string, error: any) => {
    console.error(`Audio failed to load for ${id}:`, {
      url: audioUrl,
      error: error.currentTarget?.error,
      networkState: error.currentTarget?.networkState,
      readyState: error.currentTarget?.readyState
    });
    setAudioErrors(prev => ({
      ...prev,
      [id]: 'Failed to load audio'
    }));
    setAudioLoading(prev => ({
      ...prev,
      [id]: false
    }));
  };

  const handleAudioLoaded = (id: string, audioUrl?: string) => {
    console.log(`Audio loaded successfully for ${id}:`, {
      url: audioUrl,
      duration: 'loaded'
    });
    setAudioErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[id];
      return newErrors;
    });
    setAudioLoading(prev => ({
      ...prev,
      [id]: false
    }));
  };

  const handleAudioCanPlay = (id: string) => {
    console.log(`Audio can play for ${id}`);
    setAudioLoading(prev => ({
      ...prev,
      [id]: false
    }));
  };

  const handleAudioLoadStart = (id: string) => {
    setAudioLoading(prev => ({
      ...prev,
      [id]: true
    }));
  };

  const handleBurnMusic = async (tokenId: string | number, name?: string) => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }

    // Redirect to dedicated burn page with Privy wallet integration
    const params = new URLSearchParams({
      tokenId: tokenId.toString(),
      from: walletAddress,
    });

    if (name) {
      params.append('name', name);
    }

    window.location.href = `/burn-music?${params.toString()}`;
  };

  const handleStakeMusic = async (tokenId: string | number) => {
    if (!walletAddress) {
      setStakingError('Please connect your wallet first');
      return;
    }

    setStakingNFT(tokenId.toString());
    setStakingError(null);
    setStakingSuccess(null);

    try {
      // Use delegation system for gasless staking
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'stake_music',
          params: {
            tokenId: tokenId.toString(),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to stake music NFT');
      }

      setStakingSuccess(`Music NFT #${tokenId} has been staked!`);

      // Reload data to refresh staking status
      await loadAllData();

      setTimeout(() => setStakingSuccess(null), 5000);
    } catch (error: any) {
      console.error('Stake error:', error);
      setStakingError(error.message || 'Failed to stake music NFT');
    } finally {
      setStakingNFT(null);
    }
  };

  const handleUnstakeMusic = async (tokenId: string | number) => {
    if (!walletAddress) {
      setStakingError('Please connect your wallet first');
      return;
    }

    setStakingNFT(tokenId.toString());
    setStakingError(null);
    setStakingSuccess(null);

    try {
      // Use delegation system for gasless unstaking
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'unstake_music',
          params: {
            tokenId: tokenId.toString(),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to unstake music NFT');
      }

      setStakingSuccess(`Music NFT #${tokenId} unstaked and rewards claimed!`);

      // Reload data to refresh staking status and balance
      await loadAllData();
      await loadBalances();

      setTimeout(() => setStakingSuccess(null), 5000);
    } catch (error: any) {
      console.error('Unstake error:', error);
      setStakingError(error.message || 'Failed to unstake music NFT');
    } finally {
      setStakingNFT(null);
    }
  };

  const handleClaimRewards = async (tokenId: string | number) => {
    // Rewards are automatically claimed when you unstake
    setStakingError('Rewards are automatically claimed when you unstake your NFT. Use "Unstake NFT" to withdraw your stake and claim rewards.');
    setTimeout(() => setStakingError(null), 5000);
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
          MusicNFT(where: {artist: {_in: $addresses}, isBurned: {_eq: false}}, order_by: {mintedAt: desc}, limit: 100) {
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
            isStaked
            stakedAt
            staker
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

      // Created Music with IPFS resolution
      const createdMusicWithType: MusicNFTWithMetadata[] = createdMusicNFTs.map((nft: any) => ({
        ...nft,
        type: 'master' as const,
        metadata: {
          name: nft.name,
          image: resolveIPFS(nft.imageUrl),
          animation_url: resolveIPFS(nft.previewAudioUrl),
        },
        audioUrl: resolveIPFS(nft.previewAudioUrl),
        price: (Number(nft.price) / 1e18).toFixed(6),
      }));
      setCreatedMusic(createdMusicWithType);

      // Fetch master token details for purchased licenses
      const masterTokenIds = purchasedLicenses.map((l: any) => l.masterTokenId).filter((id: any) => id);
      let masterTokensMap = new Map<string, any>();
      if (masterTokenIds.length > 0) {
        const masterQuery = `
          query GetMasterTokens($tokenIds: [String!]!) {
            MusicNFT(where: {tokenId: {_in: $tokenIds}, isBurned: {_eq: false}}) {
              id
              tokenId
              artist
              name
              imageUrl
              previewAudioUrl
              fullAudioUrl
              price
            }
          }
        `;
        try {
          const masterResponse = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: masterQuery,
              variables: { tokenIds: masterTokenIds.map(String) }
            }),
          });
          if (masterResponse.ok) {
            const masterResult = await masterResponse.json();
            const masterTokens = masterResult.data?.MusicNFT || [];
            masterTokens.forEach((token: any) => {
              masterTokensMap.set(String(token.tokenId), token);
            });
          }
        } catch (err) {
          console.error('Failed to fetch master tokens:', err);
        }
      }

      // Purchased Music with IPFS resolution
      const purchasedMusicWithType: MusicNFTWithMetadata[] = purchasedLicenses.map((license: any) => {
        const masterToken = masterTokensMap.get(String(license.masterTokenId));
        return {
          ...license,
          type: 'license' as const,
          metadata: masterToken ? {
            name: masterToken.name,
            image: resolveIPFS(masterToken.imageUrl),
            animation_url: resolveIPFS(masterToken.fullAudioUrl),
          } : undefined,
          audioUrl: resolveIPFS(masterToken?.fullAudioUrl || ''),
          artist: masterToken?.artist,
          price: masterToken ? (Number(masterToken.price) / 1e18).toFixed(6) : undefined,
        };
      });
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
          <div className="animate-spin text-4xl mb-4">🎵</div>
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
          <p className="text-sm text-gray-500">Error: {contextError?.message || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <PageTransition className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="bg-white rounded-2xl shadow-xl p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <ScaleIn delay={0.2}>
              {user?.pfpUrl ? (
                <motion.img
                  src={user.pfpUrl}
                  alt={user.username || 'Profile'}
                  className="rounded-full mx-auto mb-4 border-2 border-purple-200 shadow-lg ring-4 ring-purple-100"
                  style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                />
              ) : (
                <motion.div
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 mx-auto mb-4 flex items-center justify-center text-white text-2xl font-bold shadow-lg ring-4 ring-purple-100"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  {user.username?.charAt(0).toUpperCase() || 'U'}
                </motion.div>
              )}
            </ScaleIn>
            <motion.h1
              className="text-3xl font-bold text-gray-900 mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {user.username ? `@${user.username}` : 'Your Profile'}
            </motion.h1>
            <FadeIn delay={0.4}>
              <p className="text-gray-600 font-mono text-sm">
                {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
              </p>
              {user.fid && (
                <p className="text-gray-500 text-sm mt-1">Farcaster FID: {user.fid}</p>
              )}
            </FadeIn>
          </div>

          {isMobile && (
            <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <p className="text-blue-900 text-sm font-medium mb-1">
                📱 Mobile Wallet Connected
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
              <p className="text-red-700 font-medium">⚠️ {error}</p>
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


          {/* Staking Success Message */}
          {stakingSuccess && (
            <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
              <p className="text-blue-700 font-medium">✅ {stakingSuccess}</p>
            </div>
          )}

          {/* Staking Error Message */}
          {stakingError && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">❌ {stakingError}</p>
            </div>
          )}

          {(createdMusic.length > 0 || purchasedMusic.length > 0) && walletAddress && (
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
                  View My Artist Profile
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

          <div className="grid grid-cols-3 gap-4 mb-8">
            <motion.div
              className="p-5 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border-2 border-yellow-200 shadow-sm"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.03, y: -5 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1 font-medium">MON Balance</p>
                  <motion.p
                    className="text-2xl font-bold text-yellow-700"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.7, type: 'spring', stiffness: 200 }}
                  >
                    {balances.mon}
                  </motion.p>
                  <div className="mt-2 space-y-0.5">
                    <p className="text-xs text-gray-500">
                      💳 Wallet: {(balances as any).monWallet || '0.0000'}
                    </p>
                    <p className="text-xs text-gray-500">
                      🔒 Safe: {(balances as any).monSafe || '0.0000'}
                    </p>
                  </div>
                </div>
                <motion.div
                  className="text-3xl"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  💰
                </motion.div>
              </div>
            </motion.div>
            <motion.div
              className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border-2 border-blue-200 shadow-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              whileHover={{ scale: 1.03, y: -5 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1 font-medium">WMON Balance</p>
                  <motion.p
                    className="text-2xl font-bold text-blue-700"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.75, type: 'spring', stiffness: 200 }}
                  >
                    {balances.wmon}
                  </motion.p>
                  <p className="text-xs text-gray-500 mt-1">Wrapped MON</p>
                </div>
                <motion.div
                  className="text-3xl"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                >
                  🔷
                </motion.div>
              </div>
            </motion.div>
            <motion.div
              className="p-5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border-2 border-green-200 shadow-sm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.03, y: -5 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1 font-medium">TOURS Balance</p>
                  <motion.p
                    className="text-2xl font-bold text-green-700"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8, type: 'spring', stiffness: 200 }}
                  >
                    {balances.tours}
                  </motion.p>
                  <p className="text-xs text-gray-500 mt-1">EmpowerTours Token</p>
                </div>
                <motion.div
                  className="text-3xl"
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  🎫
                </motion.div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-8">
            <AnimatedStatCard
              value={passportNFTs.length}
              label="Passports"
              color="purple"
              delay={0.9}
            />
            <AnimatedStatCard
              value={createdMusic.length}
              label="Created"
              color="blue"
              delay={1.0}
            />
            <AnimatedStatCard
              value={purchasedMusic.length}
              label="Purchased"
              color="pink"
              delay={1.1}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ scale: 1.05 }}
              className="bg-green-50 text-green-600 rounded-lg p-4 text-center cursor-default"
            >
              <motion.p
                className="text-3xl font-bold"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 1.4, type: 'spring', stiffness: 200 }}
              >
                {purchasedItineraries.length}
              </motion.p>
              <p className="text-sm text-gray-600 mt-1">Itineraries</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-8">
            <Link
              href="/passport"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center text-sm font-medium transition-all"
            >
              Get Passport
            </Link>
            <Link
              href="/nft"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center text-sm font-medium transition-all"
            >
              Mint NFT
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
                  <h2 className="text-xl font-bold text-gray-900">🎵 Music I Created</h2>
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
                          <span className="text-6xl">🎵</span>
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
                            {audioLoading[`created_feed-${nft.id}`] && (
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
                              onLoadStart={() => handleAudioLoadStart(`created_feed-${nft.id}`)}
                              onError={(e) => handleAudioError(`created_feed-${nft.id}`, nft.audioUrl || '', e)}
                              onLoadedMetadata={() => handleAudioLoaded(`created_feed-${nft.id}`, nft.audioUrl)}
                              onCanPlay={() => handleAudioCanPlay(`created_feed-${nft.id}`)}
                            >
                              <source src={nft.audioUrl} type="audio/mpeg" />
                              <source src={nft.audioUrl} type="audio/mp3" />
                              <source src={nft.audioUrl} type="audio/wav" />
                              <source src={nft.audioUrl} type="audio/ogg" />
                              Your browser does not support audio playback.
                            </audio>
                            {audioErrors[`created_feed-${nft.id}`] ? (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-red-500 text-center">
                                  ⚠️ {audioErrors[`created_feed-${nft.id}`]}
                                </p>
                                <button
                                  onClick={() => window.open(nft.audioUrl, '_blank')}
                                  className="w-full text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  Open Audio in New Tab
                                </button>
                                <p className="text-xs text-gray-400 text-center break-all">
                                  {nft.audioUrl}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 text-center mt-1">
                                🎧 Preview
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="bg-white rounded-lg p-3 border border-blue-200 text-center">
                            <p className="text-xs text-gray-500">Audio unavailable</p>
                          </div>
                        )}
                        <div className="space-y-2">
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
                          {/* Staking Status */}
                          {nft.isStaked && (
                            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-2">
                              <p className="text-xs text-green-200 text-center font-bold">
                                📌 Currently Staked
                              </p>
                              {nft.stakedAt && (
                                <p className="text-xs text-green-300 text-center mt-1">
                                  Since: {new Date(parseInt(nft.stakedAt) * 1000).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          )}
                          {/* Staking Buttons */}
                          <div className="space-y-2">
                            {nft.isStaked ? (
                              <>
                                <button
                                  onClick={() => nft.tokenId && handleClaimRewards(nft.tokenId)}
                                  disabled={stakingNFT === nft.tokenId?.toString()}
                                  className="w-full px-3 py-3 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed touch-manipulation"
                                  style={{ minHeight: '48px' }}
                                >
                                  {stakingNFT === nft.tokenId?.toString() ? '⏳ Claiming...' : '💰 Claim Rewards'}
                                </button>
                                <button
                                  onClick={() => nft.tokenId && handleUnstakeMusic(nft.tokenId)}
                                  disabled={stakingNFT === nft.tokenId?.toString()}
                                  className="w-full px-3 py-3 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed touch-manipulation"
                                  style={{ minHeight: '48px' }}
                                >
                                  {stakingNFT === nft.tokenId?.toString() ? '⏳ Unstaking...' : '📤 Unstake NFT'}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => nft.tokenId && handleStakeMusic(nft.tokenId)}
                                disabled={stakingNFT === nft.tokenId?.toString()}
                                className="w-full px-3 py-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed touch-manipulation"
                                style={{ minHeight: '48px' }}
                              >
                                {stakingNFT === nft.tokenId?.toString() ? '⏳ Staking...' : '📌 Stake NFT'}
                              </button>
                            )}
                            {/* Delete Button */}
                            <button
                              onClick={() => nft.tokenId && handleBurnMusic(nft.tokenId, nft.metadata?.name)}
                              disabled={nft.isStaked}
                              className="w-full px-3 py-3 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed touch-manipulation"
                              style={{ minHeight: '48px' }}
                              title={nft.isStaked ? 'Unstake before burning' : ''}
                            >
                              🗑️ Delete NFT
                            </button>
                          </div>
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
                  <h2 className="text-xl font-bold text-gray-900">🎧 Music I Purchased</h2>
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
                      {license.metadata?.image ? (
                        <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                          <img
                            src={license.metadata.image}
                            alt={license.metadata.name || `License #${license.licenseId}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-full aspect-square bg-gradient-to-br from-pink-200 to-rose-200 flex items-center justify-center rounded-t-xl">
                          <span className="text-6xl">🎧</span>
                        </div>
                      )}
                      <div className="p-4 space-y-3">
                        <div className="text-center">
                          <p className="font-mono text-sm font-bold text-pink-900">
                            {license.metadata?.name || `License #${license.licenseId}`}
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
                        {license.audioUrl ? (
                          <div className="bg-white rounded-lg p-2 border border-pink-200">
                            {audioLoading[`purchased_feed-${license.id}`] && (
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
                              onLoadStart={() => handleAudioLoadStart(`purchased_feed-${license.id}`)}
                              onError={(e) => handleAudioError(`purchased_feed-${license.id}`, license.audioUrl || '', e)}
                              onLoadedMetadata={() => handleAudioLoaded(`purchased_feed-${license.id}`, license.audioUrl)}
                              onCanPlay={() => handleAudioCanPlay(`purchased_feed-${license.id}`)}
                            >
                              <source src={license.audioUrl} type="audio/mpeg" />
                              <source src={license.audioUrl} type="audio/mp3" />
                              <source src={license.audioUrl} type="audio/wav" />
                              <source src={license.audioUrl} type="audio/ogg" />
                              Your browser does not support audio playback.
                            </audio>
                            {audioErrors[`purchased_feed-${license.id}`] ? (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-red-500 text-center">
                                  ⚠️ {audioErrors[`purchased_feed-${license.id}`]}
                                </p>
                                <button
                                  onClick={() => window.open(license.audioUrl, '_blank')}
                                  className="w-full text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  Open Audio in New Tab
                                </button>
                                <p className="text-xs text-gray-400 text-center break-all">
                                  {license.audioUrl}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 text-center mt-1">
                                🎵 Full Track
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="bg-white rounded-lg p-3 border border-pink-200 text-center">
                            <p className="text-xs text-gray-500">Audio unavailable</p>
                            <p className="text-xs text-gray-400 mt-1">Master token not found</p>
                          </div>
                        )}
                        <div className="bg-white rounded-lg p-3 border border-pink-200 text-center">
                          {license.active ? (
                            <>
                              <p className="text-xs text-green-600 font-bold mb-1">✅ License Active</p>
                              {license.expiry && (
                                <p className="text-xs text-gray-600">
                                  Expires: {new Date(Number(license.expiry) * 1000).toLocaleDateString()}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-red-600 font-bold">❌ License Expired</p>
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
                <h2 className="text-xl font-bold text-gray-900">🛂 My Travel Passports</h2>
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
                                href={resolveIPFS(passport.tokenURI)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-2 bg-pink-600 text-white text-xs rounded-lg hover:bg-pink-700 transition-all text-center"
                              >
                                Metadata
                              </a>
                            )}
                          </div>
                          {/* Passport Staking Button */}
                          <button
                            onClick={() => setPassportStakingModal({ isOpen: true, passport })}
                            className="w-full px-3 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white text-xs font-bold rounded-lg hover:from-green-700 hover:to-blue-700 transition-all"
                          >
                            💰 Stake MON for Yield
                          </button>
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
            <motion.button
              onClick={() => {
                loadAllData();
                loadBalances();
              }}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      ⏳
                    </motion.span>
                    Refreshing...
                  </motion.span>
                ) : (
                  <motion.span
                    key="refresh"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    🔄 Refresh All Data
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
            <p className="text-xs text-gray-500 mt-2">Powered by Envio Indexer</p>
            {queriedAddresses.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Querying {queriedAddresses.length} address{queriedAddresses.length === 1 ? '' : 'es'}
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Passport Staking Modal */}
      {passportStakingModal.passport && walletAddress && (
        <PassportStakingModal
          isOpen={passportStakingModal.isOpen}
          onClose={() => setPassportStakingModal({ isOpen: false, passport: null })}
          passportTokenId={passportStakingModal.passport.tokenId}
          passportCountryCode={passportStakingModal.passport.countryCode}
          passportCountryName={passportStakingModal.passport.countryName}
          walletAddress={walletAddress}
        />
      )}
    </PageTransition>
  );
}
