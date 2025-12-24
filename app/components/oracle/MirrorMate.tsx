'use client';

import React, { useState, useEffect } from 'react';
import { X, Heart, Loader2, MapPin, Languages, Car } from 'lucide-react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, formatEther, type Abi } from 'viem';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

// Contract addresses
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as `0x${string}`;
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as `0x${string}`;

interface GuideProfile {
  fid: bigint;
  username: string;
  displayName: string;
  pfpUrl: string;
  isGuide: boolean;
  bio: string;
  location: string;
  languages: string;
  transport: string;
  registeredAt: bigint;
  lastUpdated: bigint;
  exists: boolean;
}

interface MirrorMateProps {
  onClose?: () => void;
}

type TransactionState = 'idle' | 'confirming' | 'loading' | 'success' | 'error';

export function MirrorMate({ onClose }: MirrorMateProps) {
  console.log('[MirrorMate] Component mounted');
  const { user, walletAddress } = useFarcasterContext();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  console.log('[MirrorMate] publicClient:', !!publicClient, 'user:', !!user, 'walletAddress:', walletAddress);

  const [guides, setGuides] = useState<GuideProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txState, setTxState] = useState<TransactionState>('idle');
  const [txError, setTxError] = useState<string>('');
  const [userStats, setUserStats] = useState<{ skipCount: number; remainingFreeSkips: number }>({
    skipCount: 0,
    remainingFreeSkips: 20, // TourGuideRegistry has 20 free skips per day
  });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyFids, setNearbyFids] = useState<number[]>([]);

  // Detect user location
  useEffect(() => {
    const detectLocation = () => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            console.log('[MirrorMate] User location detected:', location);
            setUserLocation(location);
          },
          (error) => {
            console.log('[MirrorMate] Geolocation error:', error.message);
            // Continue without location - will show all guides
          }
        );
      }
    };

    detectLocation();
  }, []);

  // Fetch nearby Farcaster users by location
  useEffect(() => {
    const fetchNearbyUsers = async () => {
      if (!userLocation) return;

      try {
        console.log('[MirrorMate] Fetching nearby Farcaster users...');
        const response = await fetch(
          `/api/neynar/users-by-location?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&limit=100`
        );
        const data = await response.json();

        if (data.success && data.users) {
          const fids = data.users.map((u: any) => u.fid);
          console.log('[MirrorMate] Found nearby Farcaster users:', fids.length);
          setNearbyFids(fids);
        }
      } catch (error) {
        console.error('[MirrorMate] Failed to fetch nearby users:', error);
      }
    };

    fetchNearbyUsers();
  }, [userLocation]);

  // Fetch guides from Envio indexer (TourGuideRegistry doesn't have getAllGuides function)
  useEffect(() => {
    console.log('[MirrorMate] fetchGuides useEffect triggered');
    const fetchGuides = async () => {
      try {
        console.log('[MirrorMate] Starting guide fetch from Envio...');
        setLoading(true);

        // Fetch guides from Envio GraphQL endpoint
        const response = await fetch('/api/envio/get-guides');
        const data = await response.json();

        if (!data.success || !data.guides) {
          console.log('[MirrorMate] No guides found');
          setGuides([]);
          setLoading(false);
          return;
        }

        console.log('[MirrorMate] Fetched guides from Envio:', data.guides.length);

        // Transform Envio data to GuideProfile format
        const transformedGuides: GuideProfile[] = data.guides.map((g: any) => ({
          fid: BigInt(g.fid),
          username: g.username || 'unknown',
          displayName: g.displayName || g.username || 'Unknown Guide',
          pfpUrl: g.pfpUrl || '',
          isGuide: true,
          bio: g.bio || '',
          location: g.location || '',
          languages: g.languages || '',
          transport: g.transport || '',
          registeredAt: BigInt(g.registeredAt || 0),
          lastUpdated: BigInt(g.lastUpdated || 0),
          exists: true,
        }));

        // Sort guides: nearby first, then others
        const sortedGuides = transformedGuides.sort((a, b) => {
          const nearbyFidsArray = Array.isArray(nearbyFids) ? nearbyFids : [];
          const aIsNearby = nearbyFidsArray.includes(Number(a.fid));
          const bIsNearby = nearbyFidsArray.includes(Number(b.fid));

          if (aIsNearby && !bIsNearby) return -1;
          if (!aIsNearby && bIsNearby) return 1;
          return 0;
        });

        console.log('[MirrorMate] Valid guides after filtering:', sortedGuides.length);
        setGuides(sortedGuides);
      } catch (error) {
        console.error('Failed to fetch guides:', error);
        setGuides([]); // Set empty array on error
      } finally {
        setLoading(false);
      }
    };

    fetchGuides();
  }, [nearbyFids]);

  // Fetch user stats from TourGuideRegistry
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!publicClient || !user || !user.fid) return;

      try {
        const registryAbiModule = await import('@/lib/abis/TourGuideRegistry.json');
        const registryAbi = registryAbiModule.default || registryAbiModule;

        const [skipCount, freeSkips] = await Promise.all([
          publicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: registryAbi as any,
            functionName: 'getDailySkipCount',
            args: [BigInt(user.fid)],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: registryAbi as any,
            functionName: 'getRemainingFreeSkips',
            args: [BigInt(user.fid)],
          }) as Promise<bigint>,
        ]);

        setUserStats({
          skipCount: Number(skipCount),
          remainingFreeSkips: Number(freeSkips),
        });
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
      }
    };

    fetchUserStats();
  }, [publicClient, user]);

  const handleSkip = async () => {
    if (!walletClient || !walletAddress || !user || !user.fid || currentIndex >= guides.length) return;

    const guide = guides[currentIndex];
    setTxState('confirming');

    try {
      const registryAbiModule = await import('@/lib/abis/TourGuideRegistry.json');
      const registryAbi = registryAbiModule.default || registryAbiModule;

      // Check if user needs to pay (after 20 free skips)
      const needsPayment = userStats.remainingFreeSkips === 0;

      if (needsPayment) {
        // Approve 5 WMON for paid skip
        const { default: erc20Abi } = await import('@/lib/abis/ERC20.json');

        setTxState('confirming');
        const approveTx = await walletClient.writeContract({
          address: WMON_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [REGISTRY_ADDRESS, parseEther('5')], // 5 WMON per skip
        });

        setTxState('loading');
        await publicClient!.waitForTransactionReceipt({ hash: approveTx });
      }

      setTxState('confirming');
      const skipTx = await walletClient.writeContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi as any,
        functionName: 'skipGuide',
        args: [BigInt(user.fid), guide.fid],
      });

      setTxState('loading');
      await publicClient!.waitForTransactionReceipt({ hash: skipTx });

      setTxState('success');

      // Update stats
      setUserStats((prev) => ({
        skipCount: prev.skipCount + 1,
        remainingFreeSkips: Math.max(0, prev.remainingFreeSkips - 1),
      }));

      // Move to next guide
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setTxState('idle');
      }, 500);
    } catch (error: any) {
      console.error('Skip failed:', error);
      setTxError(error.message || 'Skip failed');
      setTxState('error');
      setTimeout(() => setTxState('idle'), 2000);
    }
  };

  const handleMatch = async () => {
    if (!walletClient || !walletAddress || !user || !user.fid || currentIndex >= guides.length) return;

    const guide = guides[currentIndex];
    setTxState('confirming');

    try {
      const registryAbiModule = await import('@/lib/abis/TourGuideRegistry.json');
      const registryAbi = registryAbiModule.default || registryAbiModule;

      // Check if user needs to pay (after 5 free connections per day)
      // We'll approve 10 WMON just in case (contract will only charge if needed)
      const { default: erc20Abi } = await import('@/lib/abis/ERC20.json');

      setTxState('confirming');
      const approveTx = await walletClient.writeContract({
        address: WMON_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [REGISTRY_ADDRESS, parseEther('10')], // 10 WMON per paid connection
      });

      setTxState('loading');
      await publicClient!.waitForTransactionReceipt({ hash: approveTx });

      // Request connection (free or paid based on daily limit)
      setTxState('confirming');
      const connectionTx = await walletClient.writeContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi as any,
        functionName: 'requestConnection',
        args: [
          BigInt(user.fid),
          guide.fid,
          'meetup', // meetupType: coffee, advice, trial, etc.
          `Hi! I'd love to connect with you as my guide in ${guide.location || 'your city'}!`,
        ],
      });

      setTxState('loading');
      await publicClient!.waitForTransactionReceipt({ hash: connectionTx });

      setTxState('success');

      // Move to next guide
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setTxState('idle');
      }, 1000);
    } catch (error: any) {
      console.error('Connection request failed:', error);
      setTxError(error.message || 'Connection failed');
      setTxState('error');
      setTimeout(() => setTxState('idle'), 2000);
    }
  };

  // Fetch guide's verified address from Neynar
  const fetchGuideVerifiedAddress = async (fid: number): Promise<`0x${string}`> => {
    try {
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: {
          'accept': 'application/json',
          'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
        },
      });

      const data = await response.json();
      const userData = data.users?.[0];

      if (userData?.verified_addresses?.eth_addresses?.[0]) {
        return userData.verified_addresses.eth_addresses[0] as `0x${string}`;
      }

      throw new Error('No verified address found for guide');
    } catch (error) {
      console.error('Failed to fetch verified address:', error);
      throw error;
    }
  };

  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const currentGuide = guides[currentIndex];
  const isFinished = currentIndex >= guides.length;
  const noGuides = !loading && guides.length === 0;

  const handleRegisterAsGuide = async () => {
    if (!user || !user.fid) {
      setRegisterError('Please connect your Farcaster account');
      return;
    }

    console.log('[MirrorMate] Starting guide registration for FID:', user.fid);
    setIsRegistering(true);
    setRegisterError('');

    try {
      // Register via backend API (delegated transaction through Safe)
      const response = await fetch('/api/mirrormate/register-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: user.fid,
          username: user.username || '',
          displayName: user.displayName || user.username || '',
          pfpUrl: user.pfpUrl || '',
          location: user.location?.city || '',
          walletAddress: walletAddress || '',
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      console.log('[MirrorMate] Registration successful:', data.txHash);

      // Wait a moment for blockchain to update, then refresh
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('[MirrorMate] Registration failed:', error);
      setRegisterError(error.message || 'Registration failed');
      setIsRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading guides...</p>
        </div>
      </div>
    );
  }

  if (noGuides || isFinished) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-cyan-500/30 rounded-3xl p-8 text-center max-w-md">
          <div className="text-6xl mb-4">{noGuides ? '🧳' : '✨'}</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {noGuides ? 'No Guides Registered' : 'No More Guides'}
          </h2>
          <p className="text-gray-400 mb-6">
            {noGuides
              ? "There are no registered travel guides yet. Want to be a guide and help travelers explore your city?"
              : "You've seen all available guides. Check back later for more!"}
          </p>
          <div className="space-y-3">
            {noGuides && (
              <>
                <button
                  onClick={handleRegisterAsGuide}
                  disabled={isRegistering}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    'Register as a Guide'
                  )}
                </button>
                {registerError && (
                  <p className="text-red-400 text-sm">{registerError}</p>
                )}
              </>
            )}
            <button
              onClick={onClose}
              disabled={isRegistering}
              className={`w-full py-3 ${noGuides ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500'} text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Heart className="w-6 h-6 text-cyan-400" />
          <span className="text-white font-bold text-lg">MirrorMate</span>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Free skips: {userStats.remainingFreeSkips}/20</p>
          <p className="text-xs text-gray-400">Today's skips: {userStats.skipCount}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Guide Card */}
      {currentGuide && (
        <div className="w-full max-w-md bg-gradient-to-br from-gray-900 to-gray-800 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-2xl mb-6">
          {/* Profile Picture */}
          <div className="relative h-80 bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
            {currentGuide.pfpUrl ? (
              <img
                src={currentGuide.pfpUrl}
                alt={currentGuide.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-8xl">
                🧳
              </div>
            )}
            {/* Transaction Overlay */}
            {txState !== 'idle' && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                <div className="text-center">
                  {txState === 'confirming' && (
                    <>
                      <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-2" />
                      <p className="text-white">Confirm in wallet...</p>
                    </>
                  )}
                  {txState === 'loading' && (
                    <>
                      <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-2" />
                      <p className="text-white">Processing...</p>
                    </>
                  )}
                  {txState === 'success' && (
                    <>
                      <div className="text-6xl mb-2">✅</div>
                      <p className="text-white">Success!</p>
                    </>
                  )}
                  {txState === 'error' && (
                    <>
                      <div className="text-6xl mb-2">❌</div>
                      <p className="text-white">Failed</p>
                      <p className="text-red-400 text-sm mt-1">{txError}</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Guide Info */}
          <div className="p-6">
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-1">
                  {currentGuide.displayName || currentGuide.username}
                </h3>
                <p className="text-cyan-400 text-sm mb-3">@{currentGuide.username}</p>
              </div>
              {Array.isArray(nearbyFids) && nearbyFids.includes(Number(currentGuide.fid)) && (
                <div className="flex items-center gap-1 bg-green-500/20 border border-green-500 rounded-full px-2 py-1">
                  <MapPin className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-green-400 font-bold">NEARBY</span>
                </div>
              )}
            </div>

            {currentGuide.bio && (
              <p className="text-gray-300 text-sm mb-4">{currentGuide.bio}</p>
            )}

            <div className="space-y-2">
              {currentGuide.location && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <MapPin className="w-4 h-4" />
                  <span>{currentGuide.location}</span>
                </div>
              )}
              {currentGuide.languages && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Languages className="w-4 h-4" />
                  <span>{currentGuide.languages}</span>
                </div>
              )}
              {currentGuide.transport && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Car className="w-4 h-4" />
                  <span>{currentGuide.transport}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="w-full max-w-md flex items-center justify-center gap-6">
        {/* Skip Button */}
        <button
          onClick={handleSkip}
          disabled={txState !== 'idle'}
          className="w-20 h-20 bg-red-500/20 hover:bg-red-500/30 disabled:bg-gray-700 disabled:cursor-not-allowed border-2 border-red-500 rounded-full flex flex-col items-center justify-center transition-all shadow-lg hover:scale-110 active:scale-95"
        >
          <X className="w-8 h-8 text-red-500" />
          <span className="text-xs text-red-500 mt-1">
            {userStats.remainingFreeSkips > 0 ? 'Free' : '5 WMON'}
          </span>
        </button>

        {/* Match Button (Request Connection) */}
        <button
          onClick={handleMatch}
          disabled={txState !== 'idle'}
          className="w-24 h-24 bg-gradient-to-br from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-full flex flex-col items-center justify-center transition-all shadow-2xl hover:scale-110 active:scale-95"
        >
          <Heart className="w-10 h-10 text-white fill-current" />
          <span className="text-xs text-white mt-1 font-bold">Connect</span>
        </button>
      </div>

      {/* Instructions */}
      <p className="text-gray-500 text-sm mt-6 text-center max-w-md">
        Skip to see next guide • Connect to request meeting with guide
      </p>
    </div>
  );
}
