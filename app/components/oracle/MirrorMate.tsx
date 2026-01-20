'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, Loader2, MapPin, Languages, Car, Star, Edit3, MessageCircle, User, Plane, Calendar, Clock, DollarSign, CheckCircle, XCircle, List, Camera } from 'lucide-react';
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

interface TouristProfile {
  languages: string;
  interests: string[];
  travelingTo: string;
  travelDates: string;
  groupSize: string;
  notes: string;
}

interface Booking {
  bookingId: number;
  guideFid: number;
  travelerFid: number;
  guideAddress: string;
  travelerAddress: string;
  hoursDuration: number;
  totalCost: string;
  paymentToken: string;
  createdAt: number;
  completed: boolean;
  cancelled: boolean;
  guideMarkedComplete: boolean;
  guideMarkedAt: number;
  travelerRating: number;
  autoCompleted: boolean;
  // Enriched data
  guideUsername?: string;
  guideDisplayName?: string;
  guidePfpUrl?: string;
}

type MirrorMateTab = 'discover' | 'bookings';

// Interest options for tourists
const INTEREST_OPTIONS = [
  { id: 'food', label: '🍜 Food & Cuisine' },
  { id: 'history', label: '🏛️ History & Culture' },
  { id: 'nature', label: '🌳 Nature & Outdoors' },
  { id: 'nightlife', label: '🎉 Nightlife' },
  { id: 'shopping', label: '🛍️ Shopping' },
  { id: 'art', label: '🎨 Art & Museums' },
  { id: 'adventure', label: '🧗 Adventure' },
  { id: 'photography', label: '📸 Photography' },
];

interface MirrorMateProps {
  onClose?: () => void;
  isDarkMode?: boolean;
}

type TransactionState = 'idle' | 'confirming' | 'loading' | 'success' | 'error';

export function MirrorMate({ onClose, isDarkMode = true }: MirrorMateProps) {
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

  // Tourist profile state (everyone is a tourist by default)
  const [showTouristForm, setShowTouristForm] = useState(false);
  const [touristProfile, setTouristProfile] = useState<TouristProfile>({
    languages: '',
    interests: [],
    travelingTo: '',
    travelDates: '',
    groupSize: '1',
    notes: '',
  });

  // Tab navigation
  const [activeTab, setActiveTab] = useState<MirrorMateTab>('discover');

  // Booking state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedGuideForBooking, setSelectedGuideForBooking] = useState<GuideProfile | null>(null);
  const [bookingHours, setBookingHours] = useState(2);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');

  // My Bookings state
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Completion/Rating state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedBookingForRating, setSelectedBookingForRating] = useState<Booking | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [isCompletingTour, setIsCompletingTour] = useState(false);
  const [proofIPFS, setProofIPFS] = useState('');

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

      // Build DM message with tourist profile info
      const tripDetails = [];
      if (touristProfile.travelingTo) tripDetails.push(`📍 Visiting: ${touristProfile.travelingTo}`);
      if (touristProfile.travelDates) tripDetails.push(`📅 Dates: ${touristProfile.travelDates}`);
      if (touristProfile.groupSize && touristProfile.groupSize !== '1') tripDetails.push(`👥 Group: ${touristProfile.groupSize}`);
      if (touristProfile.languages) tripDetails.push(`🗣️ Languages: ${touristProfile.languages}`);
      if (touristProfile.interests.length > 0) {
        const interestLabels = touristProfile.interests.map(id =>
          INTEREST_OPTIONS.find(o => o.id === id)?.label || id
        ).join(', ');
        tripDetails.push(`✨ Interests: ${interestLabels}`);
      }

      const tripInfo = tripDetails.length > 0 ? `\n\n${tripDetails.join('\n')}` : '';
      const notesInfo = touristProfile.notes ? `\n\n💬 ${touristProfile.notes}` : '';

      // Open Warpcast DM with the guide
      const dmMessage = encodeURIComponent(
        `Hey @${guide.username}! 👋 I just sent you a connection request on MirrorMate. I'd love to connect with you as my guide!${tripInfo}${notesInfo}\n\n🧳✨`
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

  // Open tourist profile form (for all users)
  const handleOpenTouristForm = () => {
    // Pre-fill with detected location if traveling somewhere
    setTouristProfile(prev => ({
      ...prev,
      travelingTo: prev.travelingTo || location?.city || '',
    }));
    setShowTouristForm(true);
  };

  // Save tourist profile (stored locally for now, could be sent to guide on match)
  const handleSaveTouristProfile = () => {
    // Store in localStorage for persistence
    if (user?.fid) {
      localStorage.setItem(`tourist_profile_${user.fid}`, JSON.stringify(touristProfile));
    }
    setShowTouristForm(false);
  };

  // Load tourist profile from localStorage on mount
  useEffect(() => {
    if (user?.fid) {
      const saved = localStorage.getItem(`tourist_profile_${user.fid}`);
      if (saved) {
        try {
          setTouristProfile(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load tourist profile:', e);
        }
      }
    }
  }, [user?.fid]);

  // ============================================
  // BOOKING FUNCTIONS
  // ============================================

  // Open booking modal for a specific guide
  const handleOpenBookingModal = (guide: GuideProfile) => {
    setSelectedGuideForBooking(guide);
    setBookingHours(2);
    setBookingError('');
    setShowBookingModal(true);
  };

  // Calculate total cost for booking
  const calculateBookingCost = (hours: number, hourlyRate: string): string => {
    try {
      const rateWei = BigInt(hourlyRate || '0');
      const totalWei = rateWei * BigInt(hours);
      return formatEther(totalWei);
    } catch {
      return '0';
    }
  };

  // Create a booking
  const handleCreateBooking = async () => {
    if (!walletAddress || !user?.fid || !selectedGuideForBooking) return;

    setIsBooking(true);
    setBookingError('');

    try {
      const totalCost = BigInt(selectedGuideForBooking.hourlyRateWMON || '0') * BigInt(bookingHours);

      // Use execute-delegated API to create booking
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'book_guide',
          params: {
            travelerFid: user.fid,
            guideFid: selectedGuideForBooking.fid.toString(),
            hoursDuration: bookingHours,
            paymentToken: WMON_ADDRESS,
            totalCost: totalCost.toString(),
          },
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Booking failed');
      }

      console.log('[MirrorMate] Booking created:', result);

      // Close modal and refresh bookings
      setShowBookingModal(false);
      setSelectedGuideForBooking(null);
      fetchMyBookings();

      // Open Warpcast DM to confirm with guide
      const dmMessage = encodeURIComponent(
        `Hey @${selectedGuideForBooking.username}! 🎉 I just booked you for ${bookingHours} hours on MirrorMate! Looking forward to our tour! 📍`
      );
      window.open(`https://warpcast.com/~/inbox/create/${selectedGuideForBooking.fid}?text=${dmMessage}`, '_blank');

    } catch (error: any) {
      console.error('[MirrorMate] Booking failed:', error);
      setBookingError(error.message || 'Failed to create booking');
    } finally {
      setIsBooking(false);
    }
  };

  // Fetch user's bookings
  const fetchMyBookings = async () => {
    if (!user?.fid) return;

    setLoadingBookings(true);
    try {
      // Fetch bookings from API (which queries the contract)
      const response = await fetch(`/api/tour-guide/bookings?fid=${user.fid}`);
      if (response.ok) {
        const data = await response.json();
        setMyBookings(data.bookings || []);
      }
    } catch (error) {
      console.error('[MirrorMate] Failed to fetch bookings:', error);
    } finally {
      setLoadingBookings(false);
    }
  };

  // Load bookings when tab changes to bookings
  useEffect(() => {
    if (activeTab === 'bookings' && user?.fid) {
      fetchMyBookings();
    }
  }, [activeTab, user?.fid]);

  // Guide marks tour as complete
  const handleMarkTourComplete = async (booking: Booking) => {
    if (!walletAddress || !proofIPFS) return;

    setIsCompletingTour(true);
    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'mark_tour_complete',
          params: {
            bookingId: booking.bookingId,
            proofIPFS: proofIPFS,
          },
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to mark complete');
      }

      setProofIPFS('');
      fetchMyBookings();
    } catch (error: any) {
      console.error('[MirrorMate] Mark complete failed:', error);
      setBookingError(error.message);
    } finally {
      setIsCompletingTour(false);
    }
  };

  // Tourist confirms and rates
  const handleConfirmAndRate = async () => {
    if (!walletAddress || !selectedBookingForRating) return;

    setIsCompletingTour(true);
    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'confirm_and_rate',
          params: {
            bookingId: selectedBookingForRating.bookingId,
            rating: rating * 100, // Convert to basis points (5 stars = 500)
            reviewIPFS: reviewText ? `review:${reviewText}` : '',
          },
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to confirm');
      }

      setShowRatingModal(false);
      setSelectedBookingForRating(null);
      setRating(5);
      setReviewText('');
      fetchMyBookings();
    } catch (error: any) {
      console.error('[MirrorMate] Confirm failed:', error);
      setBookingError(error.message);
    } finally {
      setIsCompletingTour(false);
    }
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
        // For updates, use execute-delegated API (Farcaster wallet)
        // Build full bio with languages and transport
        const fullBio = [
          formData.bio,
          formData.languages ? `Languages: ${formData.languages}` : '',
          formData.transport.length > 0 ? `Transport: ${formData.transport.join(', ')}` : '',
        ].filter(Boolean).join(' | ');

        // Parse hourly rate
        const hourlyRateWMON = parseFloat(formData.hourlyRate) >= 10
          ? formData.hourlyRate
          : '10';

        console.log('[MirrorMate] Updating guide via execute-delegated API');

        const response = await fetch('/api/execute-delegated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mirrormate_update',
            params: {
              hourlyRateWMON,
              hourlyRateTOURS: '100', // Default TOURS rate
              bio: fullBio,
              profileImageIPFS: user.pfpUrl || '',
              active: true,
            },
          }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Update failed');
        }

        console.log('[MirrorMate] Update successful:', data.txHash);

      } else {
        // For registration, use the API (Safe AA wallet)
        const response = await fetch('/api/mirror-mate/register-guide', {
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
      <div className={`fixed inset-0 modal-backdrop z-[9999] flex items-center justify-center ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className={`text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Loading guides...</p>
        </div>
      </div>
    );
  }

  if (noGuides || isFinished) {
    // Determine the message based on user's guide status
    const isOnlyGuide = isUserRegisteredGuide && noGuides;
    const notRegisteredNoGuides = !isUserRegisteredGuide && noGuides;

    return renderInPortal(
      <div className={`fixed inset-0 modal-backdrop z-[9999] flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
        <div className={`rounded-3xl p-8 text-center max-w-md ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-200 shadow-lg'}`}>
          <div className="text-6xl mb-4">
            {isOnlyGuide ? '🌟' : noGuides ? '🧳' : '✨'}
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {isOnlyGuide
              ? "You're a Registered Guide!"
              : noGuides
              ? 'No Guides Yet'
              : 'No More Guides'}
          </h2>
          <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {isOnlyGuide
              ? "You're one of the first guides on MirrorMate! Share the app with other travel enthusiasts to grow your network."
              : notRegisteredNoGuides
              ? "There are no registered travel guides yet. Be the first to register and help travelers explore your city!"
              : "You've seen all available guides. Check back later for more!"}
          </p>

          {/* User's guide profile card if registered */}
          {isUserRegisteredGuide && (
            <div className={`rounded-xl p-4 mb-6 ${isDarkMode ? 'bg-gradient-to-br from-cyan-500/10 to-purple-600/10 border border-cyan-500/30' : 'bg-gray-50 border border-gray-200'}`}>
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
                  <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user?.displayName || user?.username}</p>
                  <p className="text-cyan-400 text-sm">Registered Guide</p>
                </div>
                <button
                  onClick={handleOpenEditForm}
                  className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'}`}
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
              className={`w-full py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
            >
              Close
            </button>
          </div>
        </div>

        {/* Guide Registration/Edit Form Modal */}
        {showGuideForm && (
          <div className={`fixed inset-0 modal-backdrop z-[10000] flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
            <div className={`rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-200 shadow-lg'}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {isEditMode ? '✏️ Edit Profile' : '🧳 Become a Guide'}
                </h2>
                <button
                  onClick={() => { setShowGuideForm(false); setRegisterError(''); }}
                  className={isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Bio */}
                <div>
                  <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Bio *</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell travelers about yourself, your expertise, and what makes your tours special..."
                    className={`w-full px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none resize-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                    style={{
                      backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                      color: isDarkMode ? '#ffffff' : '#111827'
                    }}
                    rows={3}
                    maxLength={500}
                  />
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{formData.bio.length}/500</p>
                </div>

                {/* Location */}
                <div>
                  <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g., Tokyo, Japan"
                    className={`w-full px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                    style={{
                      backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                      color: isDarkMode ? '#ffffff' : '#111827'
                    }}
                  />
                </div>

                {/* Languages */}
                <div>
                  <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Languages Spoken</label>
                  <input
                    type="text"
                    value={formData.languages}
                    onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                    placeholder="e.g., English, Japanese, Spanish"
                    className={`w-full px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                    style={{
                      backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                      color: isDarkMode ? '#ffffff' : '#111827'
                    }}
                  />
                </div>

                {/* Transport Options */}
                <div>
                  <label className={`block text-sm mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Transport Options</label>
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
                            : isDarkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hourly Rate */}
                <div>
                  <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Hourly Rate (WMON)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formData.hourlyRate}
                      onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                      min="10"
                      max="10000"
                      className={`flex-1 px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
                      style={{
                        backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                        color: isDarkMode ? '#ffffff' : '#111827'
                      }}
                    />
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>WMON/hr</span>
                  </div>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Min: 10 WMON • For paid tour bookings</p>
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

  return renderInPortal(
    <div className={`fixed inset-0 modal-backdrop z-[9999] flex flex-col items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
      {/* Header */}
      <div className="w-full max-w-xs flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Heart className="w-4 h-4 text-cyan-400" />
          <span className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>MirrorMate</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Tourist Profile Button - available to everyone */}
          <button
            onClick={handleOpenTouristForm}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'}`}
            title="Tourist Profile"
          >
            <Plane className="w-3.5 h-3.5 text-purple-400" />
            <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Tourist</span>
          </button>
          {/* Guide Profile Button - Edit for guides, Register for non-guides */}
          <button
            onClick={isUserRegisteredGuide ? handleOpenEditForm : handleOpenRegisterForm}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'}`}
            title={isUserRegisteredGuide ? "Edit Guide Profile" : "Become a Guide"}
          >
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {isUserRegisteredGuide ? 'Guide' : 'Be Guide'}
            </span>
          </button>
        </div>
      </div>
      {/* Tab Navigation */}
      <div className="w-full max-w-xs flex gap-2 mb-3">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'discover'
              ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
              : isDarkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
          }`}
        >
          <Heart className="w-3 h-3" />
          Discover
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'bookings'
              ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
              : isDarkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
          }`}
        >
          <List className="w-3 h-3" />
          My Bookings
          {myBookings.filter(b => !b.completed && !b.cancelled).length > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {myBookings.filter(b => !b.completed && !b.cancelled).length}
            </span>
          )}
        </button>
      </div>

      {/* DISCOVER TAB */}
      {activeTab === 'discover' && (
        <>
          {/* Free skips indicator */}
          <div className={`w-full max-w-xs text-right text-[10px] mb-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Free skips today: {userStats.remainingFreeSkips}/20
          </div>

          {/* Guide Card */}
      {currentGuide && (
        <div className={`w-full max-w-xs rounded-xl overflow-hidden shadow-xl mb-2 ${isDarkMode ? 'bg-gradient-to-br from-gray-900 to-gray-800 border border-cyan-500/30' : 'bg-white border border-gray-200'}`}>
          {/* Profile Picture - Very compact */}
          <div className={`flex items-center gap-2 p-2 ${isDarkMode ? 'bg-gradient-to-br from-cyan-500/10 to-purple-600/10' : 'bg-gray-50'}`}>
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
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border border-cyan-500/50 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                🧳
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
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
                          : isDarkMode ? 'text-gray-600' : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-yellow-400 text-xs font-medium">
                  {(currentGuide.averageRating / 100).toFixed(1)}
                </span>
                <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  ({currentGuide.ratingCount} {currentGuide.ratingCount === 1 ? 'review' : 'reviews'})
                </span>
                {currentGuide.completedBookings > 0 && (
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>• {currentGuide.completedBookings} tours</span>
                )}
              </div>
            )}

            {currentGuide.bio && (
              <p className={`text-[11px] mb-2 line-clamp-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{currentGuide.bio}</p>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              {currentGuide.location && (
                <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${isDarkMode ? 'text-gray-400 bg-gray-800' : 'text-gray-600 bg-gray-100'}`}>
                  <MapPin className="w-3 h-3" />
                  <span>{currentGuide.location}</span>
                </div>
              )}
              {currentGuide.languages && (
                <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${isDarkMode ? 'text-gray-400 bg-gray-800' : 'text-gray-600 bg-gray-100'}`}>
                  <Languages className="w-3 h-3" />
                  <span>{currentGuide.languages}</span>
                </div>
              )}
              {currentGuide.transport && (
                <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${isDarkMode ? 'text-gray-400 bg-gray-800' : 'text-gray-600 bg-gray-100'}`}>
                  <Car className="w-3 h-3" />
                  <span>{currentGuide.transport}</span>
                </div>
              )}
            </div>

            {/* Hourly Rate & Book Now */}
            {currentGuide.hourlyRateWMON && BigInt(currentGuide.hourlyRateWMON) > 0n && (
              <div className={`mt-3 pt-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {formatEther(BigInt(currentGuide.hourlyRateWMON))} WMON
                    </span>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>/hr</span>
                  </div>
                  <button
                    onClick={() => handleOpenBookingModal(currentGuide)}
                    className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold rounded-lg hover:from-green-400 hover:to-emerald-500 transition-all flex items-center gap-1"
                  >
                    <Calendar className="w-3 h-3" />
                    Book Now
                  </button>
                </div>
              </div>
            )}
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
        </>
      )}

      {/* BOOKINGS TAB */}
      {activeTab === 'bookings' && (
        <div className="w-full max-w-xs flex-1 overflow-y-auto">
          {loadingBookings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
            </div>
          ) : myBookings.length === 0 ? (
            <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No bookings yet</p>
              <p className="text-sm mt-1">Book a guide to get started!</p>
              <button
                onClick={() => setActiveTab('discover')}
                className="mt-4 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-bold rounded-lg"
              >
                Find Guides
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myBookings.map((booking) => {
                const isGuide = user?.fid === booking.guideFid;
                const isPending = !booking.completed && !booking.cancelled && !booking.guideMarkedComplete;
                const isAwaitingConfirm = booking.guideMarkedComplete && !booking.completed && !booking.cancelled;
                const isComplete = booking.completed;
                const isCancelled = booking.cancelled;

                return (
                  <div
                    key={booking.bookingId}
                    className={`rounded-xl p-3 ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200 shadow-sm'}`}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      {booking.guidePfpUrl ? (
                        <img src={booking.guidePfpUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>🧳</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {isGuide ? 'Tourist Booking' : (booking.guideDisplayName || booking.guideUsername || 'Guide')}
                        </p>
                        <p className="text-[10px] text-cyan-400">
                          @{isGuide ? `FID ${booking.travelerFid}` : (booking.guideUsername || 'unknown')}
                        </p>
                      </div>
                      {/* Status Badge */}
                      <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isCancelled ? 'bg-red-500/20 text-red-400' :
                        isComplete ? 'bg-green-500/20 text-green-400' :
                        isAwaitingConfirm ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {isCancelled ? 'Cancelled' :
                         isComplete ? 'Completed' :
                         isAwaitingConfirm ? 'Awaiting Confirm' :
                         'Active'}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex items-center gap-3 text-xs mb-2">
                      <div className={`flex items-center gap-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <Clock className="w-3 h-3" />
                        {booking.hoursDuration}h
                      </div>
                      <div className={`flex items-center gap-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <DollarSign className="w-3 h-3" />
                        {formatEther(BigInt(booking.totalCost))} WMON
                      </div>
                    </div>

                    {/* Actions based on role and status */}
                    {isPending && isGuide && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="IPFS proof URL (photo/video)"
                          value={proofIPFS}
                          onChange={(e) => setProofIPFS(e.target.value)}
                          className={`w-full px-2 py-1.5 rounded-lg text-xs border ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300'}`}
                        />
                        <button
                          onClick={() => handleMarkTourComplete(booking)}
                          disabled={!proofIPFS || isCompletingTour}
                          className="w-full py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {isCompletingTour ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                          Mark Tour Complete
                        </button>
                      </div>
                    )}

                    {isAwaitingConfirm && !isGuide && (
                      <button
                        onClick={() => {
                          setSelectedBookingForRating(booking);
                          setShowRatingModal(true);
                        }}
                        className="w-full py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1"
                      >
                        <Star className="w-3 h-3" />
                        Confirm & Rate
                      </button>
                    )}

                    {isComplete && booking.travelerRating > 0 && (
                      <div className="flex items-center gap-1">
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Your rating:</span>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3 h-3 ${star <= Math.round(booking.travelerRating / 100) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500'}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Guide Registration/Edit Form Modal */}
      {showGuideForm && (
        <div className={`fixed inset-0 modal-backdrop z-[10000] flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
          <div className={`rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-200 shadow-lg'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {isEditMode ? '✏️ Edit Profile' : '🧳 Become a Guide'}
              </h2>
              <button
                onClick={() => { setShowGuideForm(false); setRegisterError(''); }}
                className={isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Bio */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Bio *</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell travelers about yourself, your expertise, and what makes your tours special..."
                  className={`w-full px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none resize-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                  rows={3}
                  maxLength={500}
                />
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{formData.bio.length}/500</p>
              </div>

              {/* Location */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Tokyo, Japan"
                  className={`w-full px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                />
              </div>

              {/* Languages */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Languages Spoken</label>
                <input
                  type="text"
                  value={formData.languages}
                  onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                  placeholder="e.g., English, Japanese, Spanish"
                  className={`w-full px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                />
              </div>

              {/* Transport Options */}
              <div>
                <label className={`block text-sm mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Transport Options</label>
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
                          : isDarkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hourly Rate */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Hourly Rate (WMON)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                    min="10"
                    max="10000"
                    className={`flex-1 px-3 py-2 rounded-lg focus:border-cyan-500 focus:outline-none border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
                    style={{
                      backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                      color: isDarkMode ? '#ffffff' : '#111827'
                    }}
                  />
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>WMON/hr</span>
                </div>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Min: 10 WMON • For paid tour bookings</p>
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

      {/* Tourist Profile Form Modal */}
      {showTouristForm && (
        <div className={`fixed inset-0 modal-backdrop z-[10000] flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
          <div className={`rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-gray-900 border border-purple-500/30' : 'bg-white border border-gray-200 shadow-lg'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                <Plane className="w-5 h-5 text-purple-400" />
                Tourist Profile
              </h2>
              <button
                onClick={() => setShowTouristForm(false)}
                className={isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Tell guides about your trip so they can better assist you!
            </p>

            <div className="space-y-4">
              {/* Traveling To */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Where are you traveling?</label>
                <input
                  type="text"
                  value={touristProfile.travelingTo}
                  onChange={(e) => setTouristProfile({ ...touristProfile, travelingTo: e.target.value })}
                  placeholder="e.g., Tokyo, Japan"
                  className={`w-full px-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                />
              </div>

              {/* Travel Dates */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>When are you traveling?</label>
                <input
                  type="text"
                  value={touristProfile.travelDates}
                  onChange={(e) => setTouristProfile({ ...touristProfile, travelDates: e.target.value })}
                  placeholder="e.g., March 15-22, 2026"
                  className={`w-full px-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                />
              </div>

              {/* Group Size */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Group Size</label>
                <select
                  value={touristProfile.groupSize}
                  onChange={(e) => setTouristProfile({ ...touristProfile, groupSize: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                >
                  <option value="1">Solo traveler</option>
                  <option value="2">Couple (2)</option>
                  <option value="3-4">Small group (3-4)</option>
                  <option value="5-8">Medium group (5-8)</option>
                  <option value="9+">Large group (9+)</option>
                </select>
              </div>

              {/* Languages */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Languages you speak</label>
                <input
                  type="text"
                  value={touristProfile.languages}
                  onChange={(e) => setTouristProfile({ ...touristProfile, languages: e.target.value })}
                  placeholder="e.g., English, Spanish"
                  className={`w-full px-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                />
              </div>

              {/* Interests */}
              <div>
                <label className={`block text-sm mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>What interests you?</label>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        const newInterests = touristProfile.interests.includes(option.id)
                          ? touristProfile.interests.filter(i => i !== option.id)
                          : [...touristProfile.interests, option.id];
                        setTouristProfile({ ...touristProfile, interests: newInterests });
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        touristProfile.interests.includes(option.id)
                          ? 'bg-purple-500 text-white'
                          : isDarkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Additional notes for guides</label>
                <textarea
                  value={touristProfile.notes}
                  onChange={(e) => setTouristProfile({ ...touristProfile, notes: e.target.value })}
                  placeholder="Any special requests, accessibility needs, or things you'd like to experience..."
                  className={`w-full px-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none resize-none border ${isDarkMode ? 'border-gray-700 placeholder-gray-500' : 'border-gray-300 placeholder-gray-400'}`}
                  style={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                    color: isDarkMode ? '#ffffff' : '#111827'
                  }}
                  rows={3}
                  maxLength={500}
                />
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{touristProfile.notes.length}/500</p>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveTouristProfile}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold hover:from-purple-400 hover:to-pink-400 transition-all flex items-center justify-center gap-2"
              >
                Save Tourist Profile
              </button>

              <p className={`text-xs text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Your profile info will be shared with guides when you connect
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && selectedGuideForBooking && (
        <div className={`fixed inset-0 modal-backdrop z-[10000] flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
          <div className={`rounded-2xl p-6 max-w-md w-full ${isDarkMode ? 'bg-gray-900 border border-green-500/30' : 'bg-white border border-gray-200 shadow-lg'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                <Calendar className="w-5 h-5 text-green-400" />
                Book Guide
              </h2>
              <button
                onClick={() => { setShowBookingModal(false); setSelectedGuideForBooking(null); setBookingError(''); }}
                className={isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Guide Info */}
            <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
              {selectedGuideForBooking.pfpUrl ? (
                <img src={selectedGuideForBooking.pfpUrl} alt="" className="w-12 h-12 rounded-full" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-xl">🧳</div>
              )}
              <div>
                <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedGuideForBooking.displayName}</p>
                <p className="text-cyan-400 text-sm">@{selectedGuideForBooking.username}</p>
              </div>
            </div>

            {/* Hours Selection */}
            <div className="mb-4">
              <label className={`block text-sm mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tour Duration</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBookingHours(Math.max(1, bookingHours - 1))}
                  className={`w-10 h-10 rounded-lg font-bold text-xl ${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'}`}
                >
                  -
                </button>
                <div className={`flex-1 text-center py-2 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <span className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{bookingHours}</span>
                  <span className={`text-sm ml-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>hours</span>
                </div>
                <button
                  onClick={() => setBookingHours(Math.min(24, bookingHours + 1))}
                  className={`w-10 h-10 rounded-lg font-bold text-xl ${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'}`}
                >
                  +
                </button>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className={`p-4 rounded-xl mb-4 ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-100 border border-gray-200'}`}>
              <div className="flex justify-between mb-2">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Hourly Rate</span>
                <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{formatEther(BigInt(selectedGuideForBooking.hourlyRateWMON || '0'))} WMON</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Duration</span>
                <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>× {bookingHours} hours</span>
              </div>
              <div className={`border-t pt-2 mt-2 flex justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
                <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total</span>
                <span className="font-bold text-green-400">
                  {calculateBookingCost(bookingHours, selectedGuideForBooking.hourlyRateWMON || '0')} WMON
                </span>
              </div>
            </div>

            <p className={`text-xs mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              90% goes to the guide • 10% platform fee
            </p>

            {bookingError && (
              <p className="text-red-400 text-sm mb-4">{bookingError}</p>
            )}

            <button
              onClick={handleCreateBooking}
              disabled={isBooking}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:from-green-400 hover:to-emerald-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isBooking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  Pay & Book
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && selectedBookingForRating && (
        <div className={`fixed inset-0 modal-backdrop z-[10000] flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
          <div className={`rounded-2xl p-6 max-w-md w-full ${isDarkMode ? 'bg-gray-900 border border-yellow-500/30' : 'bg-white border border-gray-200 shadow-lg'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                <Star className="w-5 h-5 text-yellow-400" />
                Rate Your Tour
              </h2>
              <button
                onClick={() => { setShowRatingModal(false); setSelectedBookingForRating(null); }}
                className={isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              How was your experience with this guide?
            </p>

            {/* Star Rating */}
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : isDarkMode ? 'text-gray-600' : 'text-gray-300'}`}
                  />
                </button>
              ))}
            </div>

            {/* Review Text */}
            <div className="mb-4">
              <label className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Review (optional)</label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your experience..."
                className={`w-full px-3 py-2 rounded-lg focus:border-yellow-500 focus:outline-none resize-none border ${isDarkMode ? 'border-gray-700 bg-gray-800 text-white placeholder-gray-500' : 'border-gray-300 bg-gray-50 placeholder-gray-400'}`}
                rows={3}
                maxLength={280}
              />
            </div>

            <button
              onClick={handleConfirmAndRate}
              disabled={isCompletingTour}
              className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-bold hover:from-yellow-400 hover:to-orange-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isCompletingTour ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Confirm & Submit Rating
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
