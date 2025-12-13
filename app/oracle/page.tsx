'use client';

import React, { useState } from 'react';
import { X, Globe } from 'lucide-react';
import { CrystalBall, OracleState } from '@/app/components/oracle/CrystalBall';
import { MusicPlaylist } from '@/app/components/oracle/MusicPlaylist';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface NFTObject {
  id: string;
  type: 'ART' | 'MUSIC' | 'EXPERIENCE';
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
}

export default function OraclePage() {
  const { walletAddress } = useFarcasterContext();
  const [oracleState] = useState<OracleState>(OracleState.IDLE);
  const [selectedNFT, setSelectedNFT] = useState<NFTObject | null>(null);

  const handleNFTClick = (nft: NFTObject) => {
    setSelectedNFT(nft);
  };

  const closeNFTModal = () => {
    setSelectedNFT(null);
  };

  return (
    <div className="relative w-screen bg-black text-white overflow-hidden font-sans" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="absolute top-6 left-6 z-50 flex items-center">
        <Globe className="text-cyan-400 w-8 h-8 animate-[spin_60s_linear_infinite]" />
        <div className="ml-3">
          <span className="font-sans font-bold text-xl tracking-[0.2em]">EMPOWERTOURS</span>
          <div className="text-xs text-gray-400">Global Guide Oracle</div>
        </div>
      </div>

      <main className="relative z-10 w-full h-full flex flex-col items-center justify-center">
        {/* Crystal Ball - Centered */}
        <CrystalBall state={oracleState} onNFTClick={handleNFTClick} />
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
              <div className="text-center text-xs text-gray-500 mt-4">
                Use the bot bar below to interact with this NFT
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Music Playlist */}
      <MusicPlaylist userAddress={walletAddress ?? undefined} />
    </div>
  );
}
