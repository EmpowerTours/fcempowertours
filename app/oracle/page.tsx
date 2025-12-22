'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Send, Sparkles, X, Globe, Loader2, Music2 } from 'lucide-react';
import { CrystalBall, OracleState } from '@/app/components/oracle/CrystalBall';
import { MusicPlaylist } from '@/app/components/oracle/MusicPlaylist';
import { MusicSubscriptionModal } from '@/app/components/oracle/MusicSubscriptionModal';
import { MirrorMate } from '@/app/components/oracle/MirrorMate';
import { Tetris } from '@/app/components/oracle/Tetris';
import { TicTacToe } from '@/app/components/oracle/TicTacToe';
import { CreateNFTModal } from '@/app/components/oracle/CreateNFTModal';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
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
}

export default function OraclePage() {
  const router = useRouter();
  const { user, walletAddress } = useFarcasterContext();

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
  const [activeGame, setActiveGame] = useState<'TETRIS' | 'TICTACTOE' | 'MIRROR' | null>(null);
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showCreateNFTModal, setShowCreateNFTModal] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<{ message: string; estimatedCost: string } | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string>('');

  // Fetch NFT list
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        const response = await fetch('/api/envio/get-nfts');
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

  // Detect user location
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          console.log('[Oracle] Location detected:', position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.log('[Oracle] Geolocation error:', error.message);
        }
      );
    }
  }, []);

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

  const handleConsult = async () => {
    console.log('[Oracle] handleConsult START');
    if (!input.trim() || isThinking) return;

    const userMessage = input.trim();
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
          userLocation,
        }),
      });

      console.log('[Oracle] API response received');
      const data = await response.json();
      console.log('[Oracle] Full API response data:', JSON.stringify(data, null, 2));

      // Handle payment required for Maps query
      if (data.requiresPayment) {
        console.log('[Oracle] Payment required for Maps query');
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
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: `${action.message}\n\nOpening NFT creation studio...`,
              action
            }]);
            setTimeout(() => {
              setShowCreateNFTModal(true);
            }, 500);
            break;

          case 'game':
            console.log('[Oracle] GAME case triggered');
            console.log('[Oracle] Game action received:', action);
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: `${action.message}\n\nLaunching ${action.game}...`,
              action
            }]);
            // Launch the game
            if (action.game) {
              const gameType = action.game as 'TETRIS' | 'TICTACTOE' | 'MIRROR';
              console.log('[Oracle] Setting activeGame to:', gameType);
              setTimeout(() => {
                console.log('[Oracle] Timeout fired, activating game:', gameType);
                setActiveGame(gameType);
              }, 1000);
            } else {
              console.error('[Oracle] action.game is missing!', action);
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
    // If it's a music NFT, replace entire playlist with just this NFT and show player
    if (nft.type === 'MUSIC') {
      console.log('[OraclePage] Replacing playlist with single NFT');
      setClickedMusicNFTs([nft]);
      setShowMusicPlayer(true);
    } else {
      // For ART and EXPERIENCE, show modal
      console.log('[OraclePage] Showing modal for', nft.type, 'NFT');
      setSelectedNFT(nft);
    }
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
    setPaymentRequired(null);
    setIsThinking(true);

    try {
      const response = await fetch('/api/oracle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: pendingMessage,
          userAddress: walletAddress,
          userFid: user?.fid,
          userLocation,
          confirmPayment: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const { action, mapsSources, mapsWidgetToken, paymentTxHash } = data;

        let responseMessage = action.message;
        if (paymentTxHash) {
          responseMessage += `\n\n💳 Payment: 2 MON collected\n🔗 https://testnet.monadscan.com/tx/${paymentTxHash}`;
        }

        setMessages(prev => [...prev, {
          role: 'oracle',
          content: responseMessage,
          action,
          mapsSources,
          mapsWidgetToken
        }]);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('[Oracle] Payment confirmation failed:', error);
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
    const hasActiveOverlay = activeGame !== null || showMusicPlayer || messages.length > 0;

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

                  {/* Google Maps Sources */}
                  {msg.mapsSources && msg.mapsSources.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs text-gray-400 font-semibold">📍 Powered by Google Maps</div>
                      {msg.mapsSources.map((source, i) => (
                        <a
                          key={i}
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-black/40 rounded-lg p-2 hover:bg-black/60 transition-colors border border-cyan-500/20"
                        >
                          <div className="text-sm text-cyan-400 hover:text-cyan-300">
                            {source.title}
                          </div>
                          {source.placeId && (
                            <div className="text-xs text-gray-500 mt-1">
                              Place ID: {source.placeId}
                            </div>
                          )}
                        </a>
                      ))}
                      <div className="text-xs text-gray-500 italic mt-2">
                        Results provided by Google Maps Platform
                      </div>
                    </div>
                  )}

                  {/* Google Maps Contextual Widget */}
                  {msg.mapsWidgetToken && (
                    <div className="mt-4">
                      <div className="text-xs text-gray-400 mb-2 flex items-center gap-2">
                        <span>🗺️</span>
                        <span>Interactive Map (Powered by Google Maps)</span>
                      </div>
                      {/* Google Maps Contextual Widget using context token */}
                      <div
                        id={`maps-widget-${msg.mapsWidgetToken.substring(0, 8)}`}
                        className="w-full h-[300px] bg-gray-900/40 rounded-lg border border-cyan-500/20 flex items-center justify-center"
                      >
                        {/* Widget will be rendered here using Google Maps JavaScript API */}
                        <div className="text-center text-gray-500">
                          <div className="text-4xl mb-2">🗺️</div>
                          <div className="text-sm">Google Maps Widget</div>
                          <div className="text-xs mt-1">Context: {msg.mapsWidgetToken.substring(0, 16)}...</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Note: Full widget integration requires Google Maps JavaScript API
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
                onClick={handleConsult}
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
              <button
                onClick={() => setShowSubscriptionModal(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 hover:from-cyan-500/30 hover:to-purple-600/30 border border-cyan-500/30 rounded-lg text-xs text-cyan-400 font-semibold transition-all flex items-center gap-1"
              >
                <Music2 className="w-3 h-3" />
                Subscribe
              </button>
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
                    <div className="p-3">
                      <p className="text-white text-sm font-semibold truncate">{nft.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">{nft.type}</span>
                        {nft.type === 'MUSIC' && !isPlaying && (
                          <span className="text-xs text-cyan-400">🎵 Click to play</span>
                        )}
                        {isPlaying && (
                          <span className="text-xs text-cyan-400 animate-pulse">Now Playing</span>
                        )}
                        {nft.price !== '0' && nft.type !== 'MUSIC' && (
                          <span className="text-xs text-gray-400">{nft.price} MON</span>
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
              {selectedNFT.price && selectedNFT.price !== '0' && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Price</span>
                  <span className="text-white font-bold">{selectedNFT.price} MON</span>
                </div>
              )}
              <button
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold hover:from-cyan-400 hover:to-purple-500 transition-all"
                onClick={() => {
                  setInput(`Buy ${selectedNFT.type} NFT #${selectedNFT.tokenId}`);
                  closeNFTModal();
                }}
              >
                Ask Oracle to Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Music Player - Centered Modal Overlay (not fixed to screen edges) */}
      {showMusicPlayer && clickedMusicNFTs.length > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[94%] max-w-2xl pointer-events-auto animate-fadeIn">
          <MusicPlaylist
            userAddress={walletAddress ?? undefined}
            clickedNFTs={clickedMusicNFTs}
            onPlayingChange={(nftId, isPlaying) => {
              console.log('[OraclePage] onPlayingChange:', nftId, isPlaying);
              setPlayingNFTId(isPlaying ? nftId : null);
              if (isPlaying && nftId) {
                const tokenId = nftId.replace('music-', '');
                setPlayingTokenId(tokenId);
              } else {
                setPlayingTokenId(null);
              }
            }}
            onClose={() => setShowMusicPlayer(false)}
          />
        </div>
      )}

      {/* MirrorMate Game - Centered Modal Overlay */}
      {activeGame === 'MIRROR' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[94%] max-w-2xl pointer-events-auto animate-fadeIn">
          <div className="bg-black/95 backdrop-blur-xl border border-cyan-500/30 rounded-3xl p-6 shadow-2xl">
            <MirrorMate onClose={() => setActiveGame(null)} />
          </div>
        </div>
      )}

      {/* Tetris Game - Centered Modal Overlay */}
      {activeGame === 'TETRIS' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[94%] max-w-lg pointer-events-auto animate-fadeIn">
          <div className="bg-black/95 backdrop-blur-xl border border-cyan-500/30 rounded-3xl p-6 shadow-2xl">
            <Tetris onClose={() => setActiveGame(null)} />
          </div>
        </div>
      )}

      {/* TicTacToe Game - Centered Modal Overlay */}
      {activeGame === 'TICTACTOE' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[94%] max-w-lg pointer-events-auto animate-fadeIn">
          <div className="bg-black/95 backdrop-blur-xl border border-cyan-500/30 rounded-3xl p-6 shadow-2xl">
            <TicTacToe onClose={() => setActiveGame(null)} />
          </div>
        </div>
      )}

      {/* Music Subscription Modal - Centered Overlay */}
      {showSubscriptionModal && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[94%] max-w-lg pointer-events-auto animate-fadeIn">
          <MusicSubscriptionModal
            userAddress={walletAddress ?? undefined}
            onClose={() => setShowSubscriptionModal(false)}
          />
        </div>
      )}

      {/* Create NFT Modal */}
      {showCreateNFTModal && (
        <CreateNFTModal onClose={() => setShowCreateNFTModal(false)} />
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
    </>
  );
}
