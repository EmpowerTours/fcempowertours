'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Send, Sparkles, X, Globe, Loader2, Music2, User, Vote, Home, MapPin, CheckCircle2, Coins } from 'lucide-react';
import { CrystalBall, OracleState } from '@/app/components/oracle/CrystalBall';
import { MusicSubscriptionModal } from '@/app/components/oracle/MusicSubscriptionModal';
import { MirrorMate } from '@/app/components/oracle/MirrorMate';
import { CreateNFTModal } from '@/app/components/oracle/CreateNFTModal';
import { PassportMintModal } from '@/app/components/oracle/PassportMintModal';
import { MapsResultsModal } from '@/app/components/oracle/MapsResultsModal';
import { ProfileModal } from '@/app/components/oracle/ProfileModal';
import { DAOModal } from '@/app/components/oracle/DAOModal';
import { LandsModal } from '@/app/components/oracle/LandsModal';
import { MusicPlaylist } from '@/app/components/oracle/MusicPlaylist';
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
}

export default function OraclePage() {
  const router = useRouter();
  const { user, walletAddress } = useFarcasterContext();
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
  const [showDAOModal, setShowDAOModal] = useState(false);
  const [showLandsModal, setShowLandsModal] = useState(false);
  const [itineraryCreating, setItineraryCreating] = useState(false);
  const [itineraryNotification, setItineraryNotification] = useState<{
    type: 'creating' | 'created' | 'recommended';
    title?: string;
    txHash?: string;
    price?: string;
  } | null>(null);

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

      // Handle payment required for Maps query
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

          case 'execute':
            console.log('[Oracle] EXECUTE case triggered');
            let executeMessage = action.message;
            if (txHash) {
              executeMessage += `\n\n✅ Transaction executed!\n🔗 ${explorer}`;
            }
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: executeMessage,
              action
            }]);
            break;

          case 'concierge':
            console.log('[Oracle] CONCIERGE case triggered');
            let conciergeMessage = action.message;
            if (requestId) {
              conciergeMessage += `\n\n✅ Service request created!\n📝 Request ID: ${requestId}\n🔗 ${explorer}`;
            }
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: conciergeMessage,
              action
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
    console.log('[OraclePage] handleNFTClick called with:', nft);
    // For music NFTs, set them in clickedMusicNFTs for the player
    if (nft.type === 'MUSIC') {
      console.log('[OraclePage] Setting music NFT for player');
      setClickedMusicNFTs([nft]);
    }
    // Show modal for all NFT types
    console.log('[OraclePage] Showing modal for', nft.type, 'NFT');
    setSelectedNFT(nft);
  }, []);

  // Debug: Log clickedMusicNFTs changes
  useEffect(() => {
    console.log('[OraclePage] clickedMusicNFTs updated, count:', clickedMusicNFTs.length, clickedMusicNFTs);
  }, [clickedMusicNFTs]);

  const closeNFTModal = () => {
    setSelectedNFT(null);
  };

  const handleConfirmPayment = async () => {
    if (!pendingMessage) return;

    console.log('[Oracle] Confirming payment for Maps query');
    const queryMessage = pendingMessage;
    setPaymentRequired(null);
    setIsThinking(true);
    setItineraryNotification({ type: 'creating' }); // Show creating indicator

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
            // Found an existing itinerary
            setItineraryNotification({
              type: 'recommended',
              title: itineraryData.title,
              price: itineraryData.price
            });
          } else if (itineraryData.created) {
            // Created a new itinerary
            setItineraryNotification({
              type: 'created',
              txHash: itineraryTxHash
            });
          }
          // Auto-dismiss after 5 seconds
          setTimeout(() => setItineraryNotification(null), 5000);
        } else {
          setItineraryNotification(null);
        }

        // Add a brief confirmation message with data to reopen modal
        setMessages(prev => [...prev, {
          role: 'oracle',
          content: `🗺️ Found ${mapsSources?.length || 0} places for "${queryMessage}"`,
          action,
          mapsSources,
          mapsWidgetToken,
          mapsQuery: queryMessage,
          mapsPaymentTxHash: paymentTxHash
        }]);

        // Show the Maps Results Modal if we have sources
        if (mapsSources && mapsSources.length > 0) {
          console.log('[Oracle] Showing Maps results modal:', {
            sourcesCount: mapsSources.length,
            query: queryMessage,
            hasWidgetToken: !!mapsWidgetToken
          });
          setMapsResultsData({
            sources: mapsSources,
            widgetToken: mapsWidgetToken,
            query: queryMessage,
            paymentTxHash
          });
          setShowMapsResults(true);
        } else {
          console.log('[Oracle] No Maps sources returned, showing fallback message');
          // Fallback to inline message if no sources
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
      console.error('[Oracle] Payment confirmation failed:', error);
      setItineraryNotification(null);
      setMessages(prev => [...prev, {
        role: 'oracle',
        content: `❌ Payment failed: ${error.message}`
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
      content: '❌ Maps query cancelled. Ask me anything else!'
    }]);
  };

  // Dynamic Crystal Ball classes based on state
  // When overlay is active (game, music, etc), Earth shrinks and blurs to background
  const getCrystalBallClasses = () => {
    const hasActiveOverlay = activeGame !== null || messages.length > 0;

    if (hasActiveOverlay) {
      // Earth recedes: shrinks, moves up, fades, blurs
      return 'scale-60 -translate-y-24 opacity-40 blur-[4px] grayscale-[50%]';
    }
    // Earth is full size and clear (home state)
    return 'scale-100 translate-y-0 opacity-100 blur-0 grayscale-0';
  };

  return (
    <>
      <div className="relative w-screen bg-black text-white overflow-hidden font-sans" style={{ height: '100dvh' }}>
        {/* Header */}
        <div className="absolute top-6 left-6 z-50 flex items-center">
          <Globe className="text-cyan-400 w-12 h-12 animate-[spin_60s_linear_infinite]" />
          <div className="ml-3">
            <span className="font-sans font-bold text-xl tracking-[0.2em]">EMPOWERTOURS</span>
            <div className="text-xs text-gray-400">Global Guide Oracle</div>
          </div>
        </div>

        <main className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-24 pb-40 overflow-y-auto">
        {/* Crystal Ball - Shrinks and moves up when content loads */}
        <div className={`transition-all duration-700 ease-in-out ${getCrystalBallClasses()}`}>
          <CrystalBall state={oracleState} onNFTClick={handleNFTClick} />
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
                      ? 'bg-cyan-500 text-black'
                      : 'bg-gray-900/80 backdrop-blur-lg border border-cyan-500/20 text-white'
                  }`}
                >
                  {msg.role === 'oracle' && (
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs text-cyan-400 font-semibold">Oracle</span>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>

                  {/* Google Maps Sources - Show "View Places" button */}
                  {msg.mapsSources && msg.mapsSources.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          setMapsResultsData({
                            sources: msg.mapsSources!,
                            widgetToken: msg.mapsWidgetToken,
                            query: msg.mapsQuery || 'Places',
                            paymentTxHash: msg.mapsPaymentTxHash
                          });
                          setShowMapsResults(true);
                        }}
                        className="w-full py-2 px-4 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 hover:from-cyan-500/30 hover:to-purple-600/30 border border-cyan-500/30 rounded-lg text-sm text-cyan-400 font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        <span>📍</span>
                        View {msg.mapsSources.length} Places
                      </button>
                      <div className="text-xs text-gray-500 text-center mt-1">
                        Powered by Google Maps
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-gray-900/80 backdrop-blur-lg border border-cyan-500/20 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-sm text-cyan-400">Oracle is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input Field - Below planet */}
        <div className="w-full max-w-2xl px-6 mt-8">
          <div className="bg-black/90 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleConsult()}
                placeholder="Ask the Oracle anything..."
                className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
                disabled={isThinking}
              />
              <button
                onClick={() => handleConsult()}
                disabled={isThinking || !input.trim()}
                className="w-10 h-10 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all"
              >
                <Send className="w-5 h-5 text-black" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Try: "Create NFT", "Find restaurants near me", "Play Tetris"
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSubscriptionModal(true)}
                  className="px-3 py-1.5 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 hover:from-cyan-500/30 hover:to-purple-600/30 border border-cyan-500/30 rounded-lg text-xs text-cyan-400 font-semibold transition-all flex items-center gap-1"
                >
                  <Music2 className="w-3 h-3" />
                  {hasSubscription ? 'Subscribed ✓' : 'Subscribe'}
                </button>
                {walletAddress && (
                  <>
                    <button
                      onClick={() => setShowLandsModal(true)}
                      className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-600/20 hover:from-amber-500/30 hover:to-orange-600/30 border border-amber-500/30 rounded-lg text-xs text-amber-400 font-semibold transition-all flex items-center gap-1"
                    >
                      <Home className="w-3 h-3" />
                      Lands
                    </button>
                    <button
                      onClick={() => setShowDAOModal(true)}
                      className="px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-600/20 hover:from-indigo-500/30 hover:to-purple-600/30 border border-indigo-500/30 rounded-lg text-xs text-indigo-400 font-semibold transition-all flex items-center gap-1"
                    >
                      <Vote className="w-3 h-3" />
                      DAO
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[OraclePage] Profile button clicked!');
                        setShowProfileModal(true);
                      }}
                      className="px-3 py-1.5 bg-gradient-to-r from-purple-500/20 to-pink-600/20 hover:from-purple-500/30 hover:to-pink-600/30 border border-purple-500/30 rounded-lg text-xs text-purple-400 font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      type="button"
                    >
                      <User className="w-3 h-3" />
                      Profile
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* NFT List - Easy access to all NFTs */}
        {!loadingNFTs && nftList.length > 0 && (
          <div className="w-full max-w-4xl px-6 mt-8 mb-16">
            <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Available NFTs
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {nftList.map((nft) => {
                const isPlaying = playingTokenId === nft.tokenId;
                return (
                  <div
                    key={nft.id}
                    className={`bg-gray-900/80 backdrop-blur-lg border rounded-xl overflow-hidden transition-all cursor-pointer group ${
                      isPlaying ? 'border-cyan-500 shadow-lg shadow-cyan-500/50' : 'border-cyan-500/20 hover:border-cyan-500/50'
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
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
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
                      <p className="text-white text-xs font-semibold truncate">{nft.name}</p>
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

      {/* NFT Modal */}
      {selectedNFT && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={closeNFTModal}>
          <div className="bg-gray-900 border border-cyan-500/30 rounded-3xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedNFT.name}</h2>
                <p className="text-cyan-400 text-sm">{selectedNFT.type} NFT</p>
              </div>
              <button onClick={closeNFTModal} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="w-full h-64 bg-gradient-to-br from-cyan-500/20 to-purple-600/20 rounded-2xl overflow-hidden mb-4">
              <img src={selectedNFT.imageUrl} alt={selectedNFT.name} className="w-full h-full object-cover" />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Type</span>
                <span className="text-white font-bold">{selectedNFT.type}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Token ID</span>
                <span className="text-white">#{selectedNFT.tokenId}</span>
              </div>
              {selectedNFT.price && selectedNFT.price !== '0' && selectedNFT.price !== '0.00' && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Price</span>
                  <span className="text-white font-bold">{selectedNFT.price} WMON</span>
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
        </div>
      )}

      </div>

      {/* MirrorMate Game */}
      {activeGame === 'MIRROR' && (
        <MirrorMate onClose={() => setActiveGame(null)} />
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
        <CreateNFTModal onClose={() => setShowCreateNFTModal(false)} />
      )}

      {/* Passport Mint Modal */}
      {showPassportMintModal && (
        <PassportMintModal onClose={() => setShowPassportMintModal(false)} />
      )}

      {/* Maps Results Modal */}
      {showMapsResults && mapsResultsData && (
        <MapsResultsModal
          sources={mapsResultsData.sources}
          widgetToken={mapsResultsData.widgetToken}
          query={mapsResultsData.query}
          paymentTxHash={mapsResultsData.paymentTxHash}
          onClose={() => {
            setShowMapsResults(false);
            setMapsResultsData(null);
          }}
        />
      )}

      {/* Payment Confirmation Dialog */}
      {paymentRequired && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={handleCancelPayment}>
          <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl shadow-cyan-500/20 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">🗺️</div>
              <h2 className="text-2xl font-bold text-white mb-2">Google Maps Query</h2>
              <p className="text-gray-400 text-sm">{paymentRequired.message}</p>
            </div>

            <div className="bg-black/40 border border-cyan-500/30 rounded-2xl p-4 mb-6">
              {/* User Disclosure: Maps data usage */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 text-lg">ℹ️</span>
                  <div className="flex-1">
                    <p className="text-xs text-blue-300 font-semibold mb-1">Google Maps Data</p>
                    <p className="text-xs text-gray-300">
                      This query will use real-time location data from Google Maps to provide personalized recommendations based on your location.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Service Cost</span>
                <span className="text-white font-bold">{paymentRequired.estimatedCost} MON</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Google Maps + AI</span>
                <span className="text-gray-500 text-xs">~$0.028 per query</span>
              </div>
              <div className="border-t border-gray-700 mt-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 text-sm font-semibold">Total</span>
                  <span className="text-cyan-400 font-bold text-lg">{paymentRequired.estimatedCost} MON</span>
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
                    Processing...
                  </>
                ) : (
                  <>
                    💳 Confirm & Pay {paymentRequired.estimatedCost} MON
                  </>
                )}
              </button>
              <button
                onClick={handleCancelPayment}
                disabled={isThinking}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              This query requires real-time location data from Google Maps. Payment ensures access to premium location services.
            </p>
          </div>
        </div>
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
            onClose={() => {
              console.log('[OraclePage] ProfileModal onClose called');
              setShowProfileModal(false);
            }}
          />
        </>
      )}

      {/* DAO Modal */}
      {showDAOModal && (
        <DAOModal
          userAddress={walletAddress ?? undefined}
          onClose={() => setShowDAOModal(false)}
        />
      )}

      {/* Lands Modal */}
      {showLandsModal && (
        <LandsModal onClose={() => setShowLandsModal(false)} />
      )}

      {/* Itinerary Smart Contract Notification */}
      {itineraryNotification && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-fadeIn">
          <div className={`px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md flex items-center gap-3 ${
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

      {/* Music Playlist Player */}
      <MusicPlaylist
        userAddress={walletAddress ?? undefined}
        userFid={user?.fid}
        clickedNFTs={clickedMusicNFTs}
        isSubscriber={hasSubscription}
        onPlayingChange={(nftId, isPlaying) => {
          setPlayingNFTId(isPlaying ? nftId : null);
          // Find the tokenId for this NFT
          const nft = nftList.find(n => n.id === nftId);
          setPlayingTokenId(isPlaying && nft ? nft.tokenId : null);
        }}
      />
    </>
  );
}
