'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, Loader2, MapPin, Languages, Car, Star, Edit3, MessageCircle } from 'lucide-react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, formatEther, type Abi } from 'viem';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useGeolocation } from '@/lib/useGeolocation';

// Transport options
const TRANSPORT_OPTIONS = [
  { id: 'walking', label: '🚶 Walking Tours' },
  { id: 'car', label: '🚗 Car/Driver' },
  { id: 'public', label: '🚇 Public Transit' },
  { id: 'bike', label: '🚴 Bicycle' },
  { id: 'boat', label: '⛵ Boat/Water' },
];

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
  averageRating: number;
  ratingCount: number;
  totalBookings: number;
  completedBookings: number;
  hourlyRateWMON: string;
}

interface GuideFormData {
  bio: string;
  languages: string;
  transport: string[];
  hourlyRate: string;
  location: string;
}

interface MirrorMateProps {
  onClose?: () => void;
}

type TransactionState = 'idle' | 'confirming' | 'loading' | 'success' | 'error';

export function MirrorMate({ onClose }: MirrorMateProps) {
  console.log('[MirrorMate] Component mounted');
  const { user, walletAddress } = useFarcasterContext();
  const { location } = useGeolocation();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  console.log('[MirrorMate] publicClient:', !!publicClient, 'user:', !!user, 'walletAddress:', walletAddress);

  const [mounted, setMounted] = useState(false);
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

  // Guide registration/edit form state
  const [showGuideForm, setShowGuideForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<GuideFormData>({
    bio: '',
    languages: '',
    transport: [],
    hourlyRate: '10',
    location: '',
  });

  // Hold-to-match gesture state
  const holdTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const holdProgressRef = React.useRef<NodeJS.Timeout | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const HOLD_DURATION = 600; // ms to hold for match

  // Hold-to-match gesture handlers
  const handleHoldStart = () => {
    if (txState !== 'idle') return;

    setIsHolding(true);
    setHoldProgress(0);

    // Progress animation (update every 20ms for smooth visual)
    let progress = 0;
    holdProgressRef.current = setInterval(() => {
      progress += (20 / HOLD_DURATION) * 100;
      setHoldProgress(Math.min(progress, 100));
    }, 20);

    // Trigger match after hold duration
    holdTimerRef.current = setTimeout(() => {
      setIsHolding(false);
      setHoldProgress(0);
      if (holdProgressRef.current) clearInterval(holdProgressRef.current);
      handleMatch();
    }, HOLD_DURATION);
  };

  const handleHoldEnd = () => {
    setIsHolding(false);
    setHoldProgress(0);

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdProgressRef.current) {
      clearInterval(holdProgressRef.current);
      holdProgressRef.current = null;
    }
  };

  // For portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper to wrap content in portal
  const renderInPortal = (content: React.ReactNode) => {
    if (!mounted) return null;
    return createPortal(content, document.body);
  };

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

        // Helper to parse date string or timestamp to BigInt
        const parseTimestamp = (value: any): bigint => {
          if (!value) return BigInt(0);
          // If it's already a number, use it directly
          if (typeof value === 'number') return BigInt(Math.floor(value));
          // If it's a string that looks like a date (contains '-' or 'T'), parse it
          if (typeof value === 'string' && (value.includes('-') || value.includes('T'))) {
            const date = new Date(value);
            return BigInt(Math.floor(date.getTime() / 1000)); // Convert to seconds
          }
          // Otherwise try to convert directly
          try {
            return BigInt(value);
          } catch {
            return BigInt(0);
          }
        };

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
          registeredAt: parseTimestamp(g.registeredAt),
          lastUpdated: parseTimestamp(g.lastUpdated),
          exists: true,
          averageRating: Number(g.averageRating || 0),
          ratingCount: g.ratingCount || 0,
          totalBookings: g.totalBookings || 0,
          completedBookings: g.completedBookings || 0,
          hourlyRateWMON: g.hourlyRateWMON || '0',
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
        // Inline ABI for stats functions
        const statsAbi = [
          {
            name: 'getDailySkipCount',
            type: 'function',
            inputs: [{ name: 'fid', type: 'uint256' }],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view'
          },
          {
            name: 'getRemainingFreeSkips',
            type: 'function',
            inputs: [{ name: 'fid', type: 'uint256' }],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view'
          }
        ] as const;

        const [skipCount, freeSkips] = await Promise.all([
          publicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: statsAbi,
            functionName: 'getDailySkipCount',
            args: [BigInt(user.fid)],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: statsAbi,
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
    if (!walletAddress || !user || !user.fid || currentIndex >= guides.length) return;

    const guide = guides[currentIndex];
    setTxState('loading');

    try {
      // Use execute-delegated API with User Safe
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'mirrormate_skip',
          params: {
            travelerFid: user.fid,
            guideFid: guide.fid.toString(),
          },
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Skip failed');
      }

      console.log('[MirrorMate] Skip TX:', result.txHash);
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
    if (!walletAddress || !user || !user.fid || currentIndex >= guides.length) return;

    const guide = guides[currentIndex];
    setTxState('loading');

    try {
      // Use execute-delegated API with User Safe
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'mirrormate_connect',
          params: {
            travelerFid: user.fid,
            guideFid: guide.fid.toString(),
            meetupType: 'meetup',
            message: `Hi! I'd love to connect with you as my guide in ${guide.location || 'your city'}!`,
          },
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Connection failed');
      }

      console.log('[MirrorMate] Connect TX:', result.txHash);
      setTxState('success');

      // Open Warpcast DM with the guide
      const dmMessage = encodeURIComponent(
        `Hey @${guide.username}! 👋 I just sent you a connection request on MirrorMate. I'd love to connect with you as my guide in ${guide.location || 'your city'}! 🧳✨`
      );
      const warpcastDmUrl = `https://warpcast.com/~/inbox/create/${guide.fid}?text=${dmMessage}`;

      // Open in new tab/window
      window.open(warpcastDmUrl, '_blank');

      // Move to next guide
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setTxState('idle');
      }, 1500);
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
  const [isUserRegisteredGuide, setIsUserRegisteredGuide] = useState(false);

  // Check if current user is already a registered guide
  useEffect(() => {
    const checkUserGuideStatus = async () => {
      console.log('[MirrorMate] Checking guide status...', {
        hasPublicClient: !!publicClient,
        userFid: user?.fid,
        registryAddress: REGISTRY_ADDRESS,
      });

      if (!publicClient || !user?.fid) {
        console.log('[MirrorMate] Missing publicClient or user.fid');
        return;
      }

      if (!REGISTRY_ADDRESS) {
        console.error('[MirrorMate] REGISTRY_ADDRESS is not set!');
        return;
      }

      try {
        // Simple inline ABI for just the isRegisteredGuide function
        const isRegisteredAbi = [{
          name: 'isRegisteredGuide',
          type: 'function',
          inputs: [{ name: 'fid', type: 'uint256' }],
          outputs: [{ type: 'bool' }],
          stateMutability: 'view'
        }] as const;

        console.log('[MirrorMate] Calling isRegisteredGuide for FID:', user.fid);
        const isRegistered = await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: isRegisteredAbi,
          functionName: 'isRegisteredGuide',
          args: [BigInt(user.fid)],
        });

        console.log('[MirrorMate] User guide status:', isRegistered);
        setIsUserRegisteredGuide(isRegistered as boolean);
      } catch (error) {
        console.error('[MirrorMate] Failed to check user guide status:', error);
      }
    };

    checkUserGuideStatus();
  }, [publicClient, user?.fid]);

  // Filter out current user from guides list (but keep original for edit form)
  const filteredGuides = user?.fid
    ? guides.filter(g => Number(g.fid) !== user.fid)
    : guides;

  // Get current user's guide data (before filtering)
  const currentUserGuideData = user?.fid
    ? guides.find(g => Number(g.fid) === user.fid)
    : null;

  const currentGuide = filteredGuides[currentIndex];
  const isFinished = currentIndex >= filteredGuides.length;
  const noGuides = !loading && filteredGuides.length === 0;

  // Open registration form (instead of registering directly)
  const handleOpenRegisterForm = () => {
    if (!user || !user.fid) {
      setRegisterError('Please connect your Farcaster account');
      return;
    }
    // Pre-fill form with detected location
    setFormData({
      bio: '',
      languages: '',
      transport: [],
      hourlyRate: '10',
      location: location?.city || '',
    });
    setIsEditMode(false);
    setShowGuideForm(true);
  };

  // Open edit form for existing guides
  const handleOpenEditForm = async () => {
    console.log('[MirrorMate] Edit button clicked', {
      currentUserGuideData,
      userFid: user?.fid,
      hasPublicClient: !!publicClient,
      registryAddress: REGISTRY_ADDRESS,
    });

    // If we have guide data from Envio, use it
    if (currentUserGuideData) {
      setFormData({
        bio: currentUserGuideData.bio || '',
        languages: currentUserGuideData.languages || '',
        transport: currentUserGuideData.transport ? currentUserGuideData.transport.split(',').map(t => t.trim()) : [],
        hourlyRate: currentUserGuideData.hourlyRateWMON ? formatEther(BigInt(currentUserGuideData.hourlyRateWMON)) : '10',
        location: currentUserGuideData.location || location?.city || '',
      });
      setIsEditMode(true);
      setShowGuideForm(true);
      return;
    }

    // Fetch guide data directly from contract if Envio doesn't have it
    if (user?.fid && publicClient && REGISTRY_ADDRESS) {
      try {
        console.log('[MirrorMate] Fetching guide data from contract for FID:', user.fid);

        // ABI matching actual TourGuide struct in contract
        const guidesAbi = [{
          name: 'guides',
          type: 'function',
          inputs: [{ name: 'guideFid', type: 'uint256' }],
          outputs: [
            { name: 'guideFid', type: 'uint256' },           // 0
            { name: 'guideAddress', type: 'address' },        // 1
            { name: 'passportTokenId', type: 'uint256' },     // 2
            { name: 'countries', type: 'string[]' },          // 3
            { name: 'hourlyRateWMON', type: 'uint256' },      // 4
            { name: 'hourlyRateTOURS', type: 'uint256' },     // 5
            { name: 'bio', type: 'string' },                  // 6
            { name: 'profileImageIPFS', type: 'string' },     // 7
            { name: 'registeredAt', type: 'uint256' },        // 8
            { name: 'totalBookings', type: 'uint256' },       // 9
            { name: 'totalCompletedTours', type: 'uint256' }, // 10
            { name: 'cancellationCount', type: 'uint256' },   // 11
            { name: 'totalEarningsWMON', type: 'uint256' },   // 12
            { name: 'totalEarningsTOURS', type: 'uint256' },  // 13
            { name: 'active', type: 'bool' },                 // 14
            { name: 'averageRating', type: 'uint256' },       // 15
            { name: 'ratingCount', type: 'uint256' },         // 16
            { name: 'suspended', type: 'bool' },              // 17
          ],
          stateMutability: 'view'
        }] as const;

        const guideData = await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: guidesAbi,
          functionName: 'guides',
          args: [BigInt(user.fid)],
        }) as any;

        console.log('[MirrorMate] Contract guide data:', guideData);

        // Extract data from correct indices
        const bioText = guideData[6] || '';  // bio is at index 6
        const hourlyRateWMON = guideData[4]; // hourlyRateWMON is at index 4
        const countries = guideData[3] || []; // countries array at index 3

        // Parse bio for languages/transport info (format: "Bio | Languages: X | Transport: Y")
        const bioParts = bioText.split(' | ');
        const mainBio = bioParts[0] || '';
        const languagesMatch = bioText.match(/Languages:\s*([^|]+)/);
        const transportMatch = bioText.match(/Transport:\s*([^|]+)/);

        setFormData({
          bio: mainBio.trim(),
          languages: languagesMatch ? languagesMatch[1].trim() : '',
          transport: transportMatch ? transportMatch[1].trim().split(',').map((t: string) => t.trim()) : [],
          hourlyRate: hourlyRateWMON ? formatEther(hourlyRateWMON) : '10',
          location: countries.length > 0 ? countries[0] : (location?.city || ''),
        });
      } catch (error) {
        console.error('[MirrorMate] Failed to fetch guide data from contract:', error);
        setFormData({
          bio: '',
          languages: '',
          transport: [],
          hourlyRate: '10',
          location: location?.city || '',
        });
      }
    } else {
      // Default form data
      setFormData({
        bio: '',
        languages: '',
        transport: [],
        hourlyRate: '10',
        location: location?.city || '',
      });
    }

    setIsEditMode(true);
    setShowGuideForm(true);
  };

  // Handle form submission (register or update)
  const handleFormSubmit = async () => {
    if (!user || !user.fid) {
      setRegisterError('Please connect your Farcaster account');
      return;
    }

    if (!formData.bio.trim()) {
      setRegisterError('Please enter a bio');
      return;
    }

    console.log('[MirrorMate] Submitting guide form:', { isEditMode, formData });
    setIsRegistering(true);
    setRegisterError('');

    try {
      if (isEditMode) {
        // For updates, call contract directly with user's wallet (requires msg.sender = guide address)
        if (!walletClient || !publicClient) {
          throw new Error('Wallet not connected. Please connect your wallet to update profile.');
        }

        // Build full bio with languages and transport
        const fullBio = [
          formData.bio,
          formData.languages ? `Languages: ${formData.languages}` : '',
          formData.transport.length > 0 ? `Transport: ${formData.transport.join(', ')}` : '',
        ].filter(Boolean).join(' | ');

        // Parse hourly rate
        const hourlyRateWMON = parseFloat(formData.hourlyRate) >= 10
          ? parseEther(formData.hourlyRate)
          : parseEther('10');

        // Update guide ABI
        const updateGuideAbi = [{
          name: 'updateGuide',
          type: 'function',
          inputs: [
            { name: 'hourlyRateWMON', type: 'uint256' },
            { name: 'hourlyRateTOURS', type: 'uint256' },
            { name: 'bio', type: 'string' },
            { name: 'profileImageIPFS', type: 'string' },
            { name: 'active', type: 'bool' },
          ],
          outputs: [],
          stateMutability: 'nonpayable'
        }] as const;

        const txHash = await walletClient.writeContract({
          address: REGISTRY_ADDRESS,
          abi: updateGuideAbi,
          functionName: 'updateGuide',
          args: [
            hourlyRateWMON,
            0n, // TOURS rate
            fullBio,
            user.pfpUrl || '',
            true, // active
          ],
        });

        console.log('[MirrorMate] Update transaction sent:', txHash);

        // Wait for confirmation
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log('[MirrorMate] Update confirmed');

      } else {
        // For registration, use the API (Safe AA wallet)
        const response = await fetch('/api/mirrormate/register-guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fid: user.fid,
            username: user.username || '',
            displayName: user.displayName || user.username || '',
            pfpUrl: user.pfpUrl || '',
            location: formData.location || location?.city || '',
            walletAddress: walletAddress || '',
            countryCode: location?.country || '',
            bio: formData.bio,
            languages: formData.languages,
            transport: formData.transport.join(', '),
            hourlyRate: formData.hourlyRate,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Registration failed');
        }

        console.log('[MirrorMate] Registration successful:', data.txHash);
      }

      setShowGuideForm(false);

      // Wait a moment for blockchain to update, then refresh
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('[MirrorMate] Form submission failed:', error);
      setRegisterError(error.message || 'Operation failed');
      setIsRegistering(false);
    }
  };

  if (loading) {
    return renderInPortal(
      <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading guides...</p>
        </div>
      </div>
    );
  }

  if (noGuides || isFinished) {
    // Determine the message based on user's guide status
    const isOnlyGuide = isUserRegisteredGuide && noGuides;
    const notRegisteredNoGuides = !isUserRegisteredGuide && noGuides;

    return renderInPortal(
      <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <div className="bg-gray-900 border border-cyan-500/30 rounded-3xl p-8 text-center max-w-md">
          <div className="text-6xl mb-4">
            {isOnlyGuide ? '🌟' : noGuides ? '🧳' : '✨'}
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {isOnlyGuide
              ? "You're a Registered Guide!"
              : noGuides
              ? 'No Guides Yet'
              : 'No More Guides'}
          </h2>
          <p className="text-gray-400 mb-6">
            {isOnlyGuide
              ? "You're one of the first guides on MirrorMate! Share the app with other travel enthusiasts to grow your network."
              : notRegisteredNoGuides
              ? "There are no registered travel guides yet. Be the first to register and help travelers explore your city!"
              : "You've seen all available guides. Check back later for more!"}
          </p>

          {/* User's guide profile card if registered */}
          {isUserRegisteredGuide && (
            <div className="bg-gradient-to-br from-cyan-500/10 to-purple-600/10 border border-cyan-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                {user?.pfpUrl ? (
                  <img
                    src={user.pfpUrl}
                    alt=""
                    className="rounded-full border-2 border-cyan-400 object-cover"
                    style={{
                      width: '40px',
                      height: '40px',
                      minWidth: '40px',
                      minHeight: '40px',
                      maxWidth: '40px',
                      maxHeight: '40px',
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-xl">🧳</div>
                )}
                <div className="text-left flex-1">
                  <p className="text-white font-bold">{user?.displayName || user?.username}</p>
                  <p className="text-cyan-400 text-sm">Registered Guide</p>
                </div>
                <button
                  onClick={handleOpenEditForm}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Edit Profile"
                >
                  <Edit3 className="w-4 h-4 text-cyan-400" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {notRegisteredNoGuides && (
              <>
                <button
                  onClick={handleOpenRegisterForm}
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
            {/* Keep Exploring button - only show when there are guides to browse again */}
            {isFinished && filteredGuides.length > 0 && (
              <button
                onClick={() => setCurrentIndex(0)}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-purple-500 transition-all"
              >
                Keep Exploring
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isRegistering}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return renderInPortal(
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Header */}
      <div className="w-full max-w-xs flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Heart className="w-4 h-4 text-cyan-400" />
          <span className="text-white font-bold text-sm">MirrorMate</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit Profile Button - shown when user is a registered guide */}
          {isUserRegisteredGuide && (
            <button
              onClick={handleOpenEditForm}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              title="Edit Profile"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            </button>
          )}
          <div className="text-right text-[10px] text-gray-400">
            <p>Free skips: {userStats.remainingFreeSkips}/20</p>
          </div>
        </div>
      </div>

      {/* Guide Card */}
      {currentGuide && (
        <div className="w-full max-w-xs bg-gradient-to-br from-gray-900 to-gray-800 border border-cyan-500/30 rounded-xl overflow-hidden shadow-xl mb-2">
          {/* Profile Picture - Very compact */}
          <div className="flex items-center gap-2 p-2 bg-gradient-to-br from-cyan-500/10 to-purple-600/10">
            {currentGuide.pfpUrl ? (
              <img
                src={currentGuide.pfpUrl}
                alt={currentGuide.displayName}
                className="rounded-full object-cover border border-cyan-500/50"
                style={{
                  width: '40px',
                  height: '40px',
                  minWidth: '40px',
                  minHeight: '40px',
                  maxWidth: '40px',
                  maxHeight: '40px',
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg border border-cyan-500/50">
                🧳
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-white truncate">
                {currentGuide.displayName || currentGuide.username}
              </h3>
              <p className="text-cyan-400 text-[10px]">@{currentGuide.username}</p>
            </div>
            {/* Transaction State Indicator */}
            {txState !== 'idle' && (
              <div className="flex items-center">
                {txState === 'confirming' && <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />}
                {txState === 'loading' && <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />}
                {txState === 'success' && <span className="text-xl">✅</span>}
              </div>
            )}
            {/* Nearby badge */}
            {Array.isArray(nearbyFids) && nearbyFids.includes(Number(currentGuide.fid)) && (
              <div className="flex items-center gap-1 bg-green-500/20 border border-green-500 rounded-full px-2 py-0.5">
                <MapPin className="w-3 h-3 text-green-400" />
                <span className="text-[10px] text-green-400 font-bold">NEARBY</span>
              </div>
            )}
          </div>

          {/* Guide Details */}
          <div className="px-3 pb-3">
            {/* Rating Display */}
            {currentGuide.ratingCount > 0 && (
              <div className="flex items-center gap-1 mb-2">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3 h-3 ${
                        star <= Math.round(currentGuide.averageRating / 100)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-600'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-yellow-400 text-xs font-medium">
                  {(currentGuide.averageRating / 100).toFixed(1)}
                </span>
                <span className="text-gray-500 text-xs">
                  ({currentGuide.ratingCount} {currentGuide.ratingCount === 1 ? 'review' : 'reviews'})
                </span>
                {currentGuide.completedBookings > 0 && (
                  <span className="text-gray-500 text-xs">• {currentGuide.completedBookings} tours</span>
                )}
              </div>
            )}

            {currentGuide.bio && (
              <p className="text-gray-300 text-[11px] mb-2 line-clamp-2">{currentGuide.bio}</p>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              {currentGuide.location && (
                <div className="flex items-center gap-1 text-gray-400 bg-gray-800 rounded-full px-2 py-0.5">
                  <MapPin className="w-3 h-3" />
                  <span>{currentGuide.location}</span>
                </div>
              )}
              {currentGuide.languages && (
                <div className="flex items-center gap-1 text-gray-400 bg-gray-800 rounded-full px-2 py-0.5">
                  <Languages className="w-3 h-3" />
                  <span>{currentGuide.languages}</span>
                </div>
              )}
              {currentGuide.transport && (
                <div className="flex items-center gap-1 text-gray-400 bg-gray-800 rounded-full px-2 py-0.5">
                  <Car className="w-3 h-3" />
                  <span>{currentGuide.transport}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="w-full max-w-xs flex items-center justify-center gap-3">
        {/* Skip Button */}
        <button
          onClick={handleSkip}
          disabled={txState !== 'idle'}
          className="w-12 h-12 bg-red-500/20 hover:bg-red-500/30 disabled:bg-gray-700 disabled:cursor-not-allowed border-2 border-red-500 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-105 active:scale-95"
        >
          <X className="w-5 h-5 text-red-500" />
        </button>

        {/* Match Button (Hold to Connect) */}
        <div className="relative">
          <button
            onMouseDown={handleHoldStart}
            onMouseUp={handleHoldEnd}
            onMouseLeave={handleHoldEnd}
            onTouchStart={handleHoldStart}
            onTouchEnd={handleHoldEnd}
            disabled={txState !== 'idle'}
            className={`w-14 h-14 bg-gradient-to-br from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all shadow-xl ${isHolding ? 'scale-110' : 'hover:scale-105'} active:scale-95 select-none`}
          >
            <Heart className={`w-6 h-6 text-white fill-current transition-transform ${isHolding ? 'scale-125' : ''}`} />
          </button>
          {/* Hold Progress Ring */}
          {isHolding && (
            <svg className="absolute inset-0 w-14 h-14 -rotate-90 pointer-events-none" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r="26"
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="3"
              />
              <circle
                cx="28"
                cy="28"
                r="26"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeDasharray={`${(holdProgress / 100) * 163.36} 163.36`}
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-gray-500 text-[10px] mt-2 text-center max-w-xs">
        Tap to skip • Hold to connect
      </p>

      {/* Guide Registration/Edit Form Modal */}
      {showGuideForm && (
        <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-gray-900 border border-cyan-500/30 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                {isEditMode ? '✏️ Edit Profile' : '🧳 Become a Guide'}
              </h2>
              <button
                onClick={() => { setShowGuideForm(false); setRegisterError(''); }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Bio */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bio *</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell travelers about yourself, your expertise, and what makes your tours special..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none resize-none"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-gray-500 mt-1">{formData.bio.length}/500</p>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Tokyo, Japan"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* Languages */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Languages Spoken</label>
                <input
                  type="text"
                  value={formData.languages}
                  onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                  placeholder="e.g., English, Japanese, Spanish"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* Transport Options */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Transport Options</label>
                <div className="flex flex-wrap gap-2">
                  {TRANSPORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        const newTransport = formData.transport.includes(option.id)
                          ? formData.transport.filter(t => t !== option.id)
                          : [...formData.transport, option.id];
                        setFormData({ ...formData, transport: newTransport });
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        formData.transport.includes(option.id)
                          ? 'bg-cyan-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hourly Rate */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Hourly Rate (WMON)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                    min="10"
                    max="10000"
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-gray-400">WMON/hr</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Min: 10 WMON • For paid tour bookings</p>
              </div>

              {/* Error Message */}
              {registerError && (
                <p className="text-red-400 text-sm">{registerError}</p>
              )}

              {/* Submit Button */}
              <button
                onClick={handleFormSubmit}
                disabled={isRegistering || !formData.bio.trim()}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isEditMode ? 'Updating...' : 'Registering...'}
                  </>
                ) : (
                  isEditMode ? 'Update Profile' : 'Register as Guide'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
