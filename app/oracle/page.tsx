'use client';

import React, { useState, useEffect } from 'react';
import { Send, Sparkles, X, Globe, Loader2 } from 'lucide-react';
import { CrystalBall, OracleState } from '@/app/components/oracle/CrystalBall';
import { MusicPlaylist } from '@/app/components/oracle/MusicPlaylist';
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

interface Message {
  role: 'user' | 'oracle';
  content: string;
  action?: any;
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

  // Debug: Log wallet address changes
  useEffect(() => {
    console.log('[OraclePage] walletAddress changed:', walletAddress);
    console.log('[OraclePage] user:', user);
  }, [walletAddress, user]);

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
    if (!input.trim() || isThinking) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Trigger PROCESSING state (fast spin)
    setIsThinking(true);

    try {
      const response = await fetch('/api/oracle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          userAddress: walletAddress,
          userFid: user?.fid,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const { action, txHash, explorer } = data;

        // Handle different action types
        switch (action.type) {
          case 'navigate':
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: `${action.message}\n\nNavigating to ${action.destination}...`,
              action
            }]);
            setTimeout(() => router.push(action.destination), 1500);
            break;

          case 'game':
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: `${action.message}\n\nLaunching ${action.game}...`,
              action
            }]);
            // Actually launch the game
            if (action.game) {
              setTimeout(() => {
                setOracleState(OracleState.GAMING);
                // Navigate to game or trigger game launch
                if (action.game === 'MIRROR') {
                  router.push('/mirror-mate');
                } else if (action.game === 'TETRIS') {
                  // Trigger Tetris game (implement based on your game system)
                  console.log('Launching Tetris game');
                } else if (action.game === 'TICTACTOE') {
                  // Trigger TicTacToe game
                  console.log('Launching TicTacToe game');
                }
              }, 1500);
            }
            break;

          case 'execute':
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

          case 'chat':
          default:
            setMessages(prev => [...prev, {
              role: 'oracle',
              content: action.message,
              action
            }]);
            break;
        }
      } else {
        throw new Error(data.error);
      }

    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'oracle',
        content: `❌ Error: ${error.message}`
      }]);
    } finally {
      // Turn off PROCESSING state (slow spin with response)
      setIsThinking(false);
    }
  };

  const handleNFTClick = (nft: NFTObject) => {
    console.log('[OraclePage] handleNFTClick called with:', nft);
    // If it's a music NFT, add to music player instead of showing modal
    if (nft.type === 'MUSIC') {
      console.log('[OraclePage] Adding music NFT to player');
      setClickedMusicNFTs(prev => {
        // Avoid duplicates
        if (prev.some(n => n.tokenId === nft.tokenId)) {
          console.log('[OraclePage] NFT already in list');
          return prev;
        }
        console.log('[OraclePage] Adding new NFT to list');
        return [...prev, nft];
      });
    } else {
      // For ART and EXPERIENCE, show modal
      console.log('[OraclePage] Showing modal for', nft.type, 'NFT');
      setSelectedNFT(nft);
    }
  };

  const closeNFTModal = () => {
    setSelectedNFT(null);
  };

  // Dynamic Crystal Ball classes based on state
  const getCrystalBallClasses = () => {
    if (messages.length > 0) {
      // Shrink to 60%, move up, fade slightly
      return 'scale-60 -translate-y-24 opacity-40';
    }
    return 'scale-100 translate-y-0';
  };

  return (
    <div className="relative w-screen bg-black text-white overflow-hidden font-sans" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="absolute top-6 left-6 z-50 flex items-center">
        <Globe className="text-cyan-400 w-12 h-12 animate-[spin_60s_linear_infinite]" />
        <div className="ml-3">
          <span className="font-sans font-bold text-xl tracking-[0.2em]">EMPOWERTOURS</span>
          <div className="text-xs text-gray-400">Global Guide Oracle</div>
        </div>
      </div>

      <main className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-24 pb-32 overflow-y-auto">
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
            <div className="mt-2 text-xs text-gray-500">
              Try: "Take me to passport", "Play Tetris", "Swap 1 MON for TOURS", "Show me travel experiences"
            </div>
          </div>
        </div>
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

      {/* Music Playlist */}
      <MusicPlaylist
        userAddress={walletAddress ?? undefined}
        clickedNFTs={clickedMusicNFTs}
      />
    </div>
  );
}
