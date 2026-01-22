'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Send, Sparkles, X, Globe, Loader2, Music2, User, MapPin, CheckCircle2, Coins, BarChart3, Radio, Calendar, Wallet, Copy, ExternalLink, Plus, Sun, Moon } from 'lucide-react';
import { CrystalBall, OracleState } from '@/app/components/oracle/CrystalBall';
import { MusicSubscriptionModal } from '@/app/components/oracle/MusicSubscriptionModal';
import { MirrorMate } from '@/app/components/oracle/MirrorMate';
import { CreateNFTModal } from '@/app/components/oracle/CreateNFTModal';
import { PassportMintModal } from '@/app/components/oracle/PassportMintModal';
import { MapsResultsModal } from '@/app/components/oracle/MapsResultsModal';
import { ProfileModal } from '@/app/components/oracle/ProfileModal';
import { DashboardModal } from '@/app/components/oracle/DashboardModal';
import { UserProfileModal } from '@/app/components/oracle/UserProfileModal';
import { MusicPlaylist } from '@/app/components/oracle/MusicPlaylist';
import { LiveRadioModal } from '@/app/components/oracle/LiveRadioModal';
import { EventOracle } from '@/app/components/oracle/EventOracle';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useGeolocation } from '@/lib/useGeolocation';
import { useRouter } from 'next/navigation';

interface NFTObject {
  id: string;
  type: 'ART' | 'MUSIC' | 'EXPERIENCE';
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
  tokenURI?: string;
  artistUsername?: string;
}

interface MapsSource {
  uri: string;
  title: string;
  placeId?: string;
}

interface Message {
  role: 'user' | 'oracle';
  content: string;
  action?: any;
  mapsSources?: MapsSource[];
  mapsWidgetToken?: string;
  mapsQuery?: string;
  mapsPaymentTxHash?: string;
  txHash?: string;
  explorerUrl?: string;
}

export default function OraclePage() {
  const router = useRouter();
  const { user, walletAddress, sendTransaction } = useFarcasterContext();
  const { location: geoLocation, loading: geoLoading } = useGeolocation();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [oracleState, setOracleState] = useState<OracleState>(OracleState.IDLE);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState<NFTObject | null>(null);
  const [clickedMusicNFTs, setClickedMusicNFTs] = useState<NFTObject[]>([]);
  const [nftList, setNftList] = useState<NFTObject[]>([]);
  const [loadingNFTs, setLoadingNFTs] = useState(true);
  const [playingNFTId, setPlayingNFTId] = useState<string | null>(null);
  const [playingTokenId, setPlayingTokenId] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<'MIRROR' | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showCreateNFTModal, setShowCreateNFTModal] = useState(false);
  const [showPassportMintModal, setShowPassportMintModal] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState<{ message: string; estimatedCost: string } | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string>('');
  const [showMapsResults, setShowMapsResults] = useState(false);
  const [mapsResultsData, setMapsResultsData] = useState<{
    sources: MapsSource[];
    widgetToken?: string;
    query: string;
    paymentTxHash?: string;
  } | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [hasPurchasedMusic, setHasPurchasedMusic] = useState(false);
  const [ownedMusicNFTs, setOwnedMusicNFTs] = useState<NFTObject[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRadioModal, setShowRadioModal] = useState(false);
  const [showEventOracleModal, setShowEventOracleModal] = useState(false);
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [viewingUserAddress, setViewingUserAddress] = useState<string | null>(null);
  const [userProfileSource, setUserProfileSource] = useState<'dashboard' | 'profile' | null>(null);
  const [itineraryCreating, setItineraryCreating] = useState(false);
  const [itineraryNotification, setItineraryNotification] = useState<{
    type: 'creating' | 'created' | 'recommended';
    title?: string;
    txHash?: string;
    price?: string;
  } | null>(null);
  // User Safe balance and deposit modal
  const [userSafeBalance, setUserSafeBalance] = useState<{ wmonBalance: string; monBalance: string } | null>(null);
  const [userSafeAddress, setUserSafeAddress] = useState<string | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [depositSuccess, setDepositSuccess] = useState('');

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Portal mount state for modals
  const [portalMounted, setPortalMounted] = useState(false);
  useEffect(() => {
    setPortalMounted(true);
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Helper to close all modals before opening a new one
  const closeAllModals = useCallback(() => {
    setShowProfileModal(false);
    setShowRadioModal(false);
    setShowEventOracleModal(false);
    setShowDashboardModal(false);
    setShowUserProfileModal(false);
    setShowDepositModal(false);
    setShowSubscriptionModal(false);
    setShowCreateNFTModal(false);
    setShowPassportMintModal(false);
    setShowMapsResults(false);
    setSelectedNFT(null);
    setPaymentRequired(null);
  }, []);

  // Fetch NFT list
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        // Add cache-busting to ensure fresh data after burns
        const response = await fetch('/api/envio/get-nfts', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          }
        });
        const data = await response.json();
        if (data.success && data.nfts.length > 0) {
          setNftList(data.nfts);
        }
      } catch (error) {
        console.error('Failed to fetch NFT list:', error);
      } finally {
        setLoadingNFTs(false);
      }
    };
    fetchNFTs();
  }, []);

  // Debug: Log wallet address changes
  useEffect(() => {
    console.log('[OraclePage] walletAddress changed:', walletAddress);
    console.log('[OraclePage] user:', user);
  }, [walletAddress, user]);

  // Debug: Log activeGame state changes
  useEffect(() => {
    console.log('[OraclePage] activeGame state changed to:', activeGame);
  }, [activeGame]);

  // Debug: Log showCreateNFTModal state changes
  useEffect(() => {
    console.log('[OraclePage] showCreateNFTModal state changed to:', showCreateNFTModal);
  }, [showCreateNFTModal]);

  // Debug: Log showProfileModal state changes
  useEffect(() => {
    console.log('[OraclePage] showProfileModal state changed to:', showProfileModal);
  }, [showProfileModal]);

  // Log geolocation status (from useGeolocation hook with IP fallback)
  useEffect(() => {
    if (!geoLoading && geoLocation) {
      console.log('[Oracle] Location available:', {
        city: geoLocation.city,
        country: geoLocation.country,
        lat: geoLocation.latitude,
        lng: geoLocation.longitude
      });
    }
  }, [geoLocation, geoLoading]);

  // Fetch user safe balance and address
  useEffect(() => {
    const fetchUserSafeBalance = async () => {
      if (!walletAddress) return;
      try {
        const response = await fetch(`/api/user-safe?address=${walletAddress}`);
        const data = await response.json();
        if (data.success) {
          setUserSafeBalance({
            wmonBalance: data.wmonBalance || '0',
            monBalance: data.balance || '0',
          });
          setUserSafeAddress(data.safeAddress || null);
        }
      } catch (error) {
        console.error('[Oracle] Failed to fetch user safe balance:', error);
      }
    };
    fetchUserSafeBalance();
    // Refresh every 30 seconds
    const interval = setInterval(fetchUserSafeBalance, 30000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  // Check subscription status and owned music
  useEffect(() => {
    if (!walletAddress) return;

    const checkMusicAccess = async () => {
      try {
        // Check subscription status
        const subResponse = await fetch(`/api/music/check-subscription?address=${walletAddress}`);
        const subData = await subResponse.json();
        if (subData.success) {
          setHasSubscription(subData.hasSubscription);
          console.log('[Oracle] Subscription status:', subData.hasSubscription);
        }

        // Check owned music NFTs
        const musicResponse = await fetch(`/api/music/get-user-licenses?address=${walletAddress}`);
        const musicData = await musicResponse.json();
        if (musicData.success && musicData.songs?.length > 0) {
          setHasPurchasedMusic(true);
          // Convert songs to NFTObject format
          const musicNFTs: NFTObject[] = musicData.songs.map((song: any) => ({
            id: song.id,
            type: 'MUSIC' as const,
            tokenId: song.tokenId,
            name: song.title,
            imageUrl: song.imageUrl,
            price: '0',
            contractAddress: song.contractAddress || '',
          }));
          setOwnedMusicNFTs(musicNFTs);
          console.log('[Oracle] Owned music NFTs:', musicNFTs.length);
        }
      } catch (error) {
        console.error('[Oracle] Failed to check music access:', error);
      }
    };

    checkMusicAccess();
  }, [walletAddress]);

  // State machine: Map thinking/response state to visual OracleState
  useEffect(() => {
    if (isThinking) {
      setOracleState(OracleState.PROCESSING); // Fast spin animation
    } else if (messages.length > 0) {
      setOracleState(OracleState.SPEAKING); // Slow spin with content
    } else {
      setOracleState(OracleState.IDLE); // Default state
    }
  }, [isThinking, messages]);

  const handleConsult = async (directMessage?: string) => {
    console.log('[Oracle] handleConsult START');
    const messageToSend = directMessage || input.trim();
    if (!messageToSend || isThinking) return;

    const userMessage = messageToSend;
    console.log('[Oracle] User message:', userMessage);
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Trigger PROCESSING state (fast spin)
    setIsThinking(true);

    try {
      console.log('[Oracle] Sending API request...');
      const response = await fetch('/api/oracle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          userAddress: walletAddress,
          userFid: user?.fid,
          userLocation: geoLocation ? {
            latitude: geoLocation.latitude,
            longitude: geoLocation.longitude,
            city: geoLocation.city,
            country: geoLocation.country
          } : null,
        }),
      });

      console.log('[Oracle] API response received');
      const data = await response.json();
      console.log('[Oracle] Full API response data:', JSON.stringify(data, null, 2));

      // Handle payment required for Maps query - show confirmation dialog
      if (data.requiresPayment) {
        console.log('[Oracle] Payment required for Maps query:', {
          message: data.message,
          estimatedCost: data.estimatedCost,
          userMessage
        });
        setPendingMessage(userMessage);
        setPaymentRequired({
          message: data.message,
          estimatedCost: data.estimatedCost,
        });
        setIsThinking(false);
        return;
      }

      if (data.success) {
        const { action, txHash, explorer, mapsSources, mapsWidgetToken, requestId } = data;
        console.log('[Oracle] Action type:', action.type);
        console.log('[Oracle] Full action object:', JSON.stringify(action, null, 2));

        // Handle different action types
        switch (action.type) {
          case 'navigate':
            console.log('[Oracle] NAVIGATE case triggered');
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: `${action.message}\n\nNavigating to ${action.destination}...`,
              action
            }]);
            setTimeout(() => router.push(action.destination), 1500);
            break;

          case 'create_nft':
            console.log('[Oracle] CREATE_NFT case triggered');
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: `${action.message}\n\nOpening NFT creation studio...`,
              action
            }]);
            setTimeout(() => {
              console.log('[Oracle] Setting showCreateNFTModal to true');
              setShowCreateNFTModal(true);
            }, 500);
            break;

          case 'mint_passport':
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: `${action.message}\n\nOpening passport minting...`,
              action
            }]);
            setTimeout(() => {
              setShowPassportMintModal(true);
            }, 500);
            break;

          case 'game':
            console.log('[Oracle] GAME case triggered');
            console.log('[Oracle] Game action received:', action);
            // Only support MirrorMate now
            if (action.game === 'MIRROR') {
              setMessages(prev => [...prev, {
                role: 'oracle',
                content: `${action.message}\n\nLaunching MirrorMate...`,
                action
              }]);
              setTimeout(() => {
                setActiveGame('MIRROR');
              }, 1000);
            } else {
              setMessages(prev => [...prev, {
                role: 'oracle',
                content: `Sorry, that game is not available right now. Try asking for MirrorMate!`,
                action
              }]);
            }
            break;

          case 'withdraw':
            console.log('[Oracle] WITHDRAW case triggered');
            let withdrawMessage = action.message;
            if (txHash) {
              withdrawMessage += `\n\n✅ Withdrawal complete!`;
            }
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: withdrawMessage,
              action,
              txHash,
              explorerUrl: explorer
            }]);
            break;

          case 'execute':
            console.log('[Oracle] EXECUTE case triggered');
            let executeMessage = action.message;
            if (txHash) {
              // Don't include full URL - just indicate success
              executeMessage += `\n\n✅ Transaction executed!`;
            }
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: executeMessage,
              action,
              txHash,
              explorerUrl: explorer
            }]);
            break;

          case 'chat':
          default:
            console.log('[Oracle] CHAT/DEFAULT case triggered');
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: action.message,
              action,
              mapsSources,
              mapsWidgetToken
            }]);
            break;
        }
      } else {
        console.error('[Oracle] API returned success: false', data);
        throw new Error(data.error);
      }

    } catch (error: any) {
      console.error('[Oracle] Error in handleConsult:', error);
      setMessages(prev => [...prev, {
        role: 'oracle',
        content: `❌ Error: ${error.message}`
      }]);
    } finally {
      // Turn off PROCESSING state (slow spin with response)
      setIsThinking(false);
    }
  };

  const handleNFTClick = useCallback((nft: NFTObject) => {
    console.log('[OraclePage] handleNFTClick called with:', JSON.stringify(nft, null, 2));
    console.log('[OraclePage] NFT type:', nft.type, '| Is ART?:', nft.type === 'ART', '| Is MUSIC?:', nft.type === 'MUSIC');
    if (nft.type === 'MUSIC') {
      // For music NFTs, open the music player (not the modal)
      console.log('[OraclePage] Setting music NFT for player');
      setSelectedNFT(null); // Close any open modal
      setClickedMusicNFTs([nft]);
    } else {
      // For ART and other NFTs, show the modal
      console.log('[OraclePage] Showing modal for', nft.type, 'NFT - setting selectedNFT');
      setClickedMusicNFTs([]); // Close music player
      setSelectedNFT(nft);
      console.log('[OraclePage] selectedNFT should now be set');
    }
  }, []);

  // Debug: Log clickedMusicNFTs changes
  useEffect(() => {
    console.log('[OraclePage] clickedMusicNFTs updated, count:', clickedMusicNFTs.length, clickedMusicNFTs);
  }, [clickedMusicNFTs]);

  // Debug: Log selectedNFT changes
  useEffect(() => {
    console.log('[OraclePage] selectedNFT updated:', selectedNFT ? JSON.stringify(selectedNFT, null, 2) : 'null');
  }, [selectedNFT]);

  const closeNFTModal = () => {
    setSelectedNFT(null);
  };

  // Handle Maps payment confirmation - charges via user safe delegation
  const handleConfirmPayment = async () => {
    if (!pendingMessage) return;

    console.log('[Oracle] Confirming payment for Maps query via delegation');
    const queryMessage = pendingMessage;
    setPaymentRequired(null);
    setIsThinking(true);
    setItineraryNotification({ type: 'creating' });

    try {
      const response = await fetch('/api/oracle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryMessage,
          userAddress: walletAddress,
          userFid: user?.fid,
          userLocation: geoLocation ? {
            latitude: geoLocation.latitude,
            longitude: geoLocation.longitude,
            city: geoLocation.city,
            country: geoLocation.country
          } : null,
          confirmPayment: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const { action, mapsSources, mapsWidgetToken, paymentTxHash, itineraryData, itineraryTxHash } = data;

        // Handle itinerary creation notification
        if (itineraryData) {
          if (itineraryData.exists) {
            setItineraryNotification({
              type: 'recommended',
              title: itineraryData.title,
              price: itineraryData.price
            });
          } else if (itineraryData.created) {
            setItineraryNotification({
              type: 'created',
              txHash: itineraryTxHash
            });
          }
          setTimeout(() => setItineraryNotification(null), 5000);
        } else {
          setItineraryNotification(null);
        }

        // Add message with Maps data
        setMessages(prev => [...prev, {
          role: 'oracle',
          content: `🗺️ Found ${mapsSources?.length || 0} places for "${queryMessage}"`,
          action,
          mapsSources,
          mapsWidgetToken,
          mapsQuery: queryMessage,
          mapsPaymentTxHash: paymentTxHash
        }]);

        // Show the Maps Results Modal
        if (mapsSources && mapsSources.length > 0) {
          setMapsResultsData({
            sources: mapsSources,
            widgetToken: mapsWidgetToken,
            query: queryMessage,
            paymentTxHash
          });
          setShowMapsResults(true);
        } else {
          setMessages(prev => [...prev, {
            role: 'oracle',
            content: action.message || 'No places found for your query.',
            action
          }]);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('[Oracle] Payment failed:', error);
      setItineraryNotification(null);
      setMessages(prev => [...prev, {
        role: 'oracle',
        content: `❌ Payment failed: ${error.message}. Please ensure your Safe has sufficient WMON balance.`
      }]);
    } finally {
      setIsThinking(false);
      setPendingMessage('');
    }
  };

  const handleCancelPayment = () => {
    setPaymentRequired(null);
    setPendingMessage('');
    setMessages(prev => [...prev, {
      role: 'oracle',
      content: '❌ Maps query cancelled.'
    }]);
  };

  // Handle deposit to user safe
  const handleDeposit = async () => {
    if (!userSafeAddress || !depositAmount || !sendTransaction) {
      setDepositError('Missing required information');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError('Please enter a valid amount');
      return;
    }

    setDepositLoading(true);
    setDepositError('');
    setDepositSuccess('');

    try {
      // Convert amount to wei (hex)
      const amountInWei = BigInt(Math.floor(amount * 1e18));
      console.log('[Oracle] Depositing', amount, 'MON to Safe:', userSafeAddress);

      // Send transaction using Farcaster wallet
      const result = await sendTransaction({
        to: userSafeAddress,
        value: '0x' + amountInWei.toString(16),
        chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '10143'),
      });

      const txHash = result?.transactionHash || result;
      console.log('[Oracle] Deposit transaction sent:', txHash);
      setDepositSuccess(`Deposited ${amount} MON! TX: ${typeof txHash === 'string' ? txHash.slice(0, 10) : ''}...`);
      setDepositAmount('');

      // Refresh balance after a delay
      setTimeout(async () => {
        const response = await fetch(`/api/user-safe?address=${walletAddress}`);
        const data = await response.json();
        if (data.success) {
          setUserSafeBalance({
            wmonBalance: data.wmonBalance || '0',
            monBalance: data.balance || '0',
          });
        }
      }, 3000);
    } catch (error: any) {
      console.error('[Oracle] Deposit failed:', error);
      setDepositError(error.message || 'Deposit failed');
    } finally {
      setDepositLoading(false);
    }
  };

  // Copy safe address to clipboard
  const handleCopyAddress = () => {
    if (userSafeAddress) {
      navigator.clipboard.writeText(userSafeAddress);
    }
  };

  // Dynamic Crystal Ball classes based on state
  // When any modal/overlay is active, Earth shrinks and blurs to background
  const getCrystalBallClasses = () => {
    const hasActiveOverlay =
      activeGame !== null ||
      messages.length > 0 ||
      showProfileModal ||
      showDashboardModal ||
      showRadioModal ||
      showEventOracleModal ||
      showDepositModal ||
      showSubscriptionModal ||
      showCreateNFTModal ||
      showPassportMintModal ||
      showMapsResults ||
      showUserProfileModal ||
      selectedNFT !== null;

    if (hasActiveOverlay) {
      // Earth recedes: shrinks, moves up, fades, blurs
      return 'scale-50 -translate-y-16 opacity-30 blur-[6px] grayscale-[60%]';
    }
    // Earth is full size and clear (home state)
    return 'scale-100 translate-y-0 opacity-100 blur-0 grayscale-0';
  };

  return (
    <>
      <div className={`relative w-screen overflow-hidden font-sans ${isDarkMode ? 'bg-black text-white' : 'bg-white text-gray-900'}`} style={{ height: '100dvh' }}>
        {/* Header Bar - Full width with items on each end */}
        <header className={`fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-4 ${isDarkMode ? 'bg-black/70' : 'bg-white/70'} backdrop-blur-sm`} style={{ width: '100%', maxWidth: '100%', display: 'flex' }}>
          {/* Logo Left */}
          <div className="flex items-center flex-shrink-0">
            <Globe className={`w-7 h-7 animate-[spin_60s_linear_infinite] ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <div className="ml-2">
              <span className={`font-bold text-sm tracking-wide ${isDarkMode ? 'text-cyan-400' : 'text-gray-800'}`}>EMPOWERTOURS</span>
              <div className={`text-[9px] ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Oracle Guide</div>
            </div>
          </div>

          {/* Spacer - pushes right content to far right */}
          <div style={{ flexGrow: 1 }}></div>

          {/* User Info + Toggle Right */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* User Info */}
            {user && walletAddress && (
              <div className={`flex items-center gap-2 rounded-full px-2 py-1 ${isDarkMode ? 'bg-gray-800/80' : 'bg-gray-100/80 border border-gray-200'}`}>
                {user.pfpUrl ? (
                  <img
                    src={user.pfpUrl}
                    alt={user.username || 'User'}
                    className="rounded-full object-cover border border-cyan-500/50"
                    style={{ width: '24px', height: '24px', minWidth: '24px', maxWidth: '24px', minHeight: '24px', maxHeight: '24px' }}
                  />
                ) : (
                  <div
                    className="rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ width: '24px', height: '24px', minWidth: '24px', maxWidth: '24px' }}
                  >
                    {user.username?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="text-right">
                  {user.username && (
                    <div className={`text-[11px] font-medium ${isDarkMode ? 'text-cyan-400' : 'text-gray-800'}`}>@{user.username}</div>
                  )}
                  <div className={`text-[9px] font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                  </div>
                </div>
              </div>
            )}

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-full transition-all ${isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700 text-yellow-400' : 'bg-gray-100/80 hover:bg-gray-200 text-gray-700 border border-gray-200'}`}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-16 pb-40 overflow-y-auto">
        {/* Crystal Ball - Shrinks and moves up when content loads */}
        <div className={`transition-all duration-700 ease-in-out ${getCrystalBallClasses()}`}>
          <CrystalBall state={oracleState} onNFTClick={handleNFTClick} isDarkMode={isDarkMode} />
        </div>

        {/* Messages Container */}
        {messages.length > 0 && (
          <div className="w-full max-w-2xl px-6 mt-8 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-cyan-500 text-white'
                      : isDarkMode
                        ? 'bg-gray-800 border border-gray-700 text-white'
                        : 'bg-gray-100 border border-gray-300 text-gray-900'
                  }`}
                >
                  {msg.role === 'oracle' && (
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-cyan-500" />
                      <span className="text-xs text-cyan-500 font-semibold">Oracle</span>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>

                  {/* Transaction Link - Show clickable "View TX" button */}
                  {msg.explorerUrl && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          // Open in external browser using Farcaster SDK or window.open
                          if (typeof window !== 'undefined' && (window as any).farcaster?.openUrl) {
                            (window as any).farcaster.openUrl(msg.explorerUrl);
                          } else {
                            window.open(msg.explorerUrl, '_blank', 'noopener,noreferrer');
                          }
                        }}
                        className="w-full py-2 px-4 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm text-white font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Transaction
                        {msg.txHash && (
                          <span className="text-emerald-200 text-xs">
                            ({msg.txHash.slice(0, 6)}...{msg.txHash.slice(-4)})
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Google Maps Sources - Show "View Places" button */}
                  {msg.mapsSources && msg.mapsSources.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          closeAllModals();
                          setMapsResultsData({
                            sources: msg.mapsSources!,
                            widgetToken: msg.mapsWidgetToken,
                            query: msg.mapsQuery || 'Places',
                            paymentTxHash: msg.mapsPaymentTxHash
                          });
                          setShowMapsResults(true);
                        }}
                        className="w-full py-2 px-4 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-sm text-white font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        <MapPin className="w-4 h-4" />
                        View {msg.mapsSources.length} Places
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-100 border border-gray-300'}`}>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-cyan-500 animate-spin" />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Oracle is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input Field - Sleek floating design */}
        <div className="w-full max-w-xl px-6 mt-8">
          <div className={`relative rounded-full p-1 ${isDarkMode ? 'bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20' : 'bg-gradient-to-r from-cyan-200/50 via-purple-200/50 to-cyan-200/50'}`}>
            <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${isDarkMode ? 'bg-black/80' : 'bg-white/90'}`}>
              <Sparkles className={`w-4 h-4 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleConsult()}
                placeholder="Ask the Oracle..."
                className={`flex-1 bg-transparent outline-none text-sm ${isDarkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
                style={{ color: isDarkMode ? '#ffffff' : '#111827' }}
                disabled={isThinking}
              />
              <button
                onClick={() => handleConsult()}
                disabled={isThinking || !input.trim()}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isThinking || !input.trim()
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400'
                }`}
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Quick Actions - Minimal floating pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button
              onClick={() => { closeAllModals(); setShowProfileModal(true); }}
              className={`group flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all hover:scale-105 ${isDarkMode ? 'text-gray-400 hover:text-purple-400 hover:bg-purple-500/10' : 'text-gray-500 hover:text-purple-600 hover:bg-purple-50'}`}
            >
              <User className="w-3.5 h-3.5" />
              Profile
            </button>
            <button
              onClick={() => { closeAllModals(); setShowDashboardModal(true); }}
              className={`group flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all hover:scale-105 ${isDarkMode ? 'text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10' : 'text-gray-500 hover:text-cyan-600 hover:bg-cyan-50'}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <button
              onClick={() => { closeAllModals(); setShowRadioModal(true); }}
              className={`group flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all hover:scale-105 ${isDarkMode ? 'text-gray-400 hover:text-pink-400 hover:bg-pink-500/10' : 'text-gray-500 hover:text-pink-600 hover:bg-pink-50'}`}
            >
              <Radio className="w-3.5 h-3.5" />
              Radio
            </button>
            <button
              onClick={() => { closeAllModals(); setShowCreateNFTModal(true); }}
              className={`group flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all hover:scale-105 ${isDarkMode ? 'text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50'}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Create NFT
            </button>
          </div>

        </div>

        {/* NFT List - Easy access to all NFTs */}
        {!loadingNFTs && nftList.length > 0 && (
          <div className="w-full max-w-4xl px-6 mt-8 mb-16">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
              <Sparkles className="w-5 h-5" />
              Available NFTs
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {nftList.map((nft) => {
                const isPlaying = playingTokenId === nft.tokenId;
                return (
                  <div
                    key={nft.id}
                    className={`rounded-xl overflow-hidden transition-all cursor-pointer group ${
                      isDarkMode
                        ? `bg-gray-800 border ${isPlaying ? 'border-cyan-500 shadow-lg shadow-cyan-500/50' : 'border-gray-700 hover:border-gray-600'}`
                        : `bg-white border ${isPlaying ? 'border-cyan-500 shadow-lg shadow-cyan-500/30' : 'border-gray-300 hover:border-gray-400'}`
                    }`}
                    onClick={() => handleNFTClick(nft)}
                  >
                    <div className="aspect-square bg-gradient-to-br from-cyan-500/20 to-purple-600/20 overflow-hidden relative">
                      {nft.imageUrl ? (
                        <img
                          src={nft.imageUrl}
                          alt={nft.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">
                          {nft.type === 'MUSIC' ? '🎵' : nft.type === 'ART' ? '🎨' : '✈️'}
                        </div>
                      )}
                      {/* Animated Sound Wave Overlay for Playing Music */}
                      {isPlaying && nft.type === 'MUSIC' && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="flex gap-1 items-end h-10">
                            <div className="w-1.5 bg-cyan-400 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '30%', animationDelay: '0s' }}></div>
                            <div className="w-1.5 bg-cyan-400 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '80%', animationDelay: '0.1s' }}></div>
                            <div className="w-1.5 bg-cyan-400 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '50%', animationDelay: '0.2s' }}></div>
                            <div className="w-1.5 bg-cyan-400 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '70%', animationDelay: '0.3s' }}></div>
                            <div className="w-1.5 bg-cyan-400 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '40%', animationDelay: '0.4s' }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold truncate text-white">{nft.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-gray-400">{nft.type}</span>
                        {isPlaying && (
                          <span className="text-[10px] text-cyan-400 animate-pulse">Playing</span>
                        )}
                      </div>
                      {/* Price and Buy Button */}
                      <div className="flex items-center justify-between mt-2 gap-1">
                        {nft.price !== '0' && nft.price !== '0.00' ? (
                          <>
                            <span className="text-[10px] text-green-400 font-bold">{nft.price} WMON</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConsult(`Buy ${nft.type} NFT #${nft.tokenId}`);
                              }}
                              className="px-2 py-1 bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-[10px] rounded-lg font-bold hover:from-cyan-400 hover:to-purple-500 transition-all"
                            >
                              Buy
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-500">Free to play</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* NFT Modal - Different layouts for ART vs MUSIC */}
      {selectedNFT && portalMounted && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10000, backgroundColor: isDarkMode ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)' }} onClick={closeNFTModal}>
          {selectedNFT.type === 'ART' ? (
            /* Art NFT - Full screen art viewer with visible card */
            <div className={`relative max-w-3xl w-full rounded-2xl overflow-hidden ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
              {/* Close button */}
              <button onClick={closeNFTModal} className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-colors ${isDarkMode ? 'bg-black/50 hover:bg-black/70 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
                <X className="w-6 h-6" />
              </button>

              {/* Art image */}
              <div className={`w-full flex items-center justify-center min-h-[200px] ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                {selectedNFT.imageUrl ? (
                  <img src={selectedNFT.imageUrl} alt={selectedNFT.name} className="w-full h-auto max-h-[70vh] object-contain" />
                ) : (
                  <div className={`text-6xl p-12 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>🎨</div>
                )}
              </div>

              {/* Info section */}
              <div className={`p-6 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                <div className="flex items-end justify-between gap-4">
                  <div className="flex-1">
                    <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedNFT.name}</h2>
                    <p className="text-cyan-500 text-sm">Art NFT #{selectedNFT.tokenId}</p>
                    {selectedNFT.artistUsername && (
                      <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>by @{selectedNFT.artistUsername}</p>
                    )}
                    {selectedNFT.price && selectedNFT.price !== '0' && selectedNFT.price !== '0.00' && (
                      <p className={`font-bold mt-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedNFT.price} WMON</p>
                    )}
                  </div>
                  <button
                    className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-purple-500 transition-all shadow-lg whitespace-nowrap"
                    onClick={() => {
                      closeNFTModal();
                      handleConsult(`Buy ART NFT #${selectedNFT.tokenId}`);
                    }}
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Music/Other NFT - Standard purchase modal */
            <div className={`rounded-3xl max-w-md w-full p-6 ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-200 shadow-lg'}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedNFT.name}</h2>
                  <p className="text-cyan-500 text-sm">{selectedNFT.type} NFT</p>
                </div>
                <button onClick={closeNFTModal} className={`${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="w-full h-64 bg-gradient-to-br from-cyan-500/20 to-purple-600/20 rounded-2xl overflow-hidden mb-4">
                <img src={selectedNFT.imageUrl} alt={selectedNFT.name} className="w-full h-full object-cover" />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Type</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedNFT.type}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Token ID</span>
                  <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>#{selectedNFT.tokenId}</span>
                </div>
                {selectedNFT.price && selectedNFT.price !== '0' && selectedNFT.price !== '0.00' && (
                  <div className="flex justify-between items-center">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Price</span>
                    <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedNFT.price} WMON</span>
                  </div>
                )}
                <button
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-purple-500 transition-all"
                  onClick={() => {
                    closeNFTModal();
                    handleConsult(`Buy ${selectedNFT.type} NFT #${selectedNFT.tokenId}`);
                  }}
                >
                  Buy Now
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      </div>

      {/* MirrorMate Game */}
      {activeGame === 'MIRROR' && (
        <MirrorMate onClose={() => setActiveGame(null)} isDarkMode={isDarkMode} />
      )}


      {/* Music Subscription Modal - Centered Overlay */}
      {showSubscriptionModal && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[94%] max-w-lg pointer-events-auto animate-fadeIn">
          <MusicSubscriptionModal
            userAddress={walletAddress ?? undefined}
            userFid={user?.fid}
            onClose={() => setShowSubscriptionModal(false)}
          />
        </div>
      )}

      {/* Create NFT Modal */}
      {showCreateNFTModal && (
        <CreateNFTModal onClose={() => setShowCreateNFTModal(false)} isDarkMode={isDarkMode} />
      )}

      {/* Passport Mint Modal */}
      {showPassportMintModal && (
        <PassportMintModal onClose={() => setShowPassportMintModal(false)} />
      )}

      {/* Maps Results Modal */}
      {showMapsResults && mapsResultsData && portalMounted && createPortal(
        <MapsResultsModal
          sources={mapsResultsData.sources}
          widgetToken={mapsResultsData.widgetToken}
          query={mapsResultsData.query}
          paymentTxHash={mapsResultsData.paymentTxHash}
          onClose={() => {
            setShowMapsResults(false);
            setMapsResultsData(null);
          }}
        />,
        document.body
      )}

      {/* Payment Confirmation Dialog - Shows cost before charging via delegation */}
      {paymentRequired && portalMounted && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10001, backgroundColor: isDarkMode ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)' }} onClick={handleCancelPayment}>
          <div className={`rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fadeIn ${isDarkMode ? 'bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 shadow-cyan-500/20' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">🗺️</div>
              <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Google Maps Search</h2>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{paymentRequired.message}</p>
            </div>

            <div className={`rounded-2xl p-4 mb-6 ${isDarkMode ? 'bg-gray-800 border border-cyan-500/30' : 'bg-gray-50 border border-gray-200'}`}>
              <div className={`rounded-lg p-3 mb-3 ${isDarkMode ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 text-lg">ℹ️</span>
                  <div className="flex-1">
                    <p className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>Real-time Location Data</p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      This query uses Google Maps to find nearby places based on your location.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Service Cost</span>
                <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{paymentRequired.estimatedCost} WMON</span>
              </div>
              <div className={`border-t mt-2 pt-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-cyan-500 text-sm font-semibold">Total (from Safe)</span>
                  <span className="text-cyan-500 font-bold text-lg">{paymentRequired.estimatedCost} WMON</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleConfirmPayment}
                disabled={isThinking}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isThinking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    ✅ Confirm & Search ({paymentRequired.estimatedCost} WMON)
                  </>
                )}
              </button>
              <button
                onClick={handleCancelPayment}
                disabled={isThinking}
                className={`w-full py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
              >
                Cancel
              </button>
            </div>

            <p className={`text-xs text-center mt-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Payment will be deducted from your Safe wallet via delegation.
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <>
          {console.log('[OraclePage] Rendering ProfileModal, walletAddress:', walletAddress)}
          <ProfileModal
            walletAddress={walletAddress || ''}
            userFid={user?.fid}
            username={user?.username}
            pfpUrl={user?.pfpUrl}
            isDarkMode={isDarkMode}
            onClose={() => {
              console.log('[OraclePage] ProfileModal onClose called');
              setShowProfileModal(false);
            }}
            onViewUserProfile={(address) => {
              setShowProfileModal(false);
              setViewingUserAddress(address);
              setUserProfileSource('profile');
              setShowUserProfileModal(true);
            }}
          />
        </>
      )}

      {/* Live Radio Modal */}
      {showRadioModal && (
        <LiveRadioModal onClose={() => setShowRadioModal(false)} isDarkMode={isDarkMode} />
      )}

      {/* Event Oracle Modal */}
      {showEventOracleModal && (
        <EventOracle
          isOpen={showEventOracleModal}
          onClose={() => setShowEventOracleModal(false)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div
          className={`fixed inset-0 flex items-center justify-center p-4 z-[100] ${isDarkMode ? 'bg-black' : 'bg-white'}`}
          onClick={() => setShowDepositModal(false)}
        >
          <div
            className={`rounded-2xl max-w-sm w-full p-6 ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200 shadow-lg'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Deposit to Safe</h3>
                  <p className="text-xs text-gray-400">Fund your User Safe</p>
                </div>
              </div>
              <button onClick={() => setShowDepositModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Safe Address */}
            {userSafeAddress && (
              <div className="mb-4 p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-xs text-gray-400 mb-1">Safe Address</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-cyan-400 font-mono break-all">
                    {userSafeAddress}
                  </code>
                  <button
                    onClick={handleCopyAddress}
                    className="shrink-0 p-1 hover:bg-gray-700 rounded transition-all"
                    title="Copy address"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </div>
            )}

            {/* Current Balance */}
            <div className="mb-4 p-3 bg-gray-800 rounded-xl border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Current Balance</p>
              <p className="text-lg font-bold text-white">
                {userSafeBalance ? parseFloat(userSafeBalance.monBalance).toFixed(4) : '0'} MON
              </p>
            </div>

            {/* Deposit Amount Input */}
            <div className="mb-4">
              <label className="text-xs text-gray-400 mb-1 block">Deposit Amount (MON)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* Quick Amounts */}
            <div className="flex gap-2 mb-4">
              {[1, 5, 10, 25].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setDepositAmount(amt.toString())}
                  className="flex-1 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-xs text-cyan-400 font-medium transition-all"
                >
                  {amt} MON
                </button>
              ))}
            </div>

            {/* Error/Success Messages */}
            {depositError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-xs text-red-400">{depositError}</p>
              </div>
            )}
            {depositSuccess && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                <p className="text-xs text-green-400">{depositSuccess}</p>
              </div>
            )}

            {/* Deposit Button */}
            <button
              onClick={handleDeposit}
              disabled={depositLoading || !depositAmount}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {depositLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Depositing...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Deposit via Farcaster Wallet
                </>
              )}
            </button>

            <p className="mt-3 text-[10px] text-gray-500 text-center">
              Deposits go directly to your User Safe for gasless transactions
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Modal */}
      {showDashboardModal && (
        <DashboardModal
          onClose={() => setShowDashboardModal(false)}
          isDarkMode={isDarkMode}
          onViewProfile={(address) => {
            setViewingUserAddress(address);
            setUserProfileSource('dashboard');
            setShowUserProfileModal(true);
            setShowDashboardModal(false);
          }}
        />
      )}

      {/* User Profile Modal - for viewing other users */}
      {showUserProfileModal && viewingUserAddress && (
        <UserProfileModal
          walletAddress={viewingUserAddress}
          buyerAddress={walletAddress || undefined}
          buyerFid={user?.fid}
          isDarkMode={isDarkMode}
          onClose={() => {
            setShowUserProfileModal(false);
            setViewingUserAddress(null);
            setUserProfileSource(null);
          }}
          onBack={() => {
            setShowUserProfileModal(false);
            setViewingUserAddress(null);
            if (userProfileSource === 'dashboard') {
              setShowDashboardModal(true);
            } else if (userProfileSource === 'profile') {
              setShowProfileModal(true);
            }
            setUserProfileSource(null);
          }}
        />
      )}

      {/* Itinerary Smart Contract Notification */}
      {itineraryNotification && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-fadeIn">
          <div className={`px-4 py-3 rounded-xl border shadow-xl  flex items-center gap-3 ${
            itineraryNotification.type === 'creating'
              ? 'bg-blue-500/20 border-blue-500/50'
              : itineraryNotification.type === 'created'
              ? 'bg-green-500/20 border-green-500/50'
              : 'bg-purple-500/20 border-purple-500/50'
          }`}>
            {itineraryNotification.type === 'creating' ? (
              <>
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                <div>
                  <p className="text-blue-400 text-sm font-semibold">Creating Itinerary</p>
                  <p className="text-xs text-gray-400">Smart contract interaction in progress...</p>
                </div>
              </>
            ) : itineraryNotification.type === 'created' ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-green-400 text-sm font-semibold">Itinerary Created!</p>
                  <p className="text-xs text-gray-400">You'll earn 70% from sales</p>
                </div>
                {itineraryNotification.txHash && (
                  <a
                    href={`https://testnet.monadscan.com/tx/${itineraryNotification.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-400 hover:underline ml-2"
                  >
                    View TX
                  </a>
                )}
              </>
            ) : (
              <>
                <MapPin className="w-5 h-5 text-purple-400" />
                <div>
                  <p className="text-purple-400 text-sm font-semibold">Recommended Itinerary</p>
                  <p className="text-xs text-gray-400">
                    "{itineraryNotification.title}" - {itineraryNotification.price} WMON
                  </p>
                </div>
              </>
            )}
            <button
              onClick={() => setItineraryNotification(null)}
              className="ml-2 text-gray-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Music Playlist Player - positioned at bottom center */}
      <MusicPlaylist
        userAddress={walletAddress ?? undefined}
        userFid={user?.fid}
        clickedNFTs={clickedMusicNFTs}
        isSubscriber={hasSubscription}
        onPlayingChange={(nftId, isPlaying) => {
          setPlayingNFTId(isPlaying ? nftId : null);
          const nft = nftList.find(n => n.id === nftId);
          setPlayingTokenId(isPlaying && nft ? nft.tokenId : null);
        }}
        onClose={() => setClickedMusicNFTs([])}
      />
    </>
  );
}
