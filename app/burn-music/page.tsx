'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { encodeFunctionData, parseAbi } from 'viem';

const MUSIC_NFT_V5 = process.env.NEXT_PUBLIC_MUSIC_NFT as `0x${string}`;

export default function BurnMusicPage() {
  const { walletAddress, fid, isLoading: contextLoading } = useFarcasterContext();

  const [tokenId, setTokenId] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);

  // Get URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('tokenId');
      const name = urlParams.get('name');

      if (token) setTokenId(token);
      if (name) setTokenName(decodeURIComponent(name));
    }
  }, []);

  const handleBurn = async () => {
    if (!tokenId || !walletAddress) {
      setError('Missing required information');
      return;
    }

    setError('');
    setSuccess('');
    setTxHash('');
    setLoading(true);

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('No Ethereum provider found');
      }

      console.log('🔥 Burning NFT with user wallet:', {
        wallet: walletAddress,
        tokenId
      });

      // Encode burn call
      const data = encodeFunctionData({
        abi: parseAbi(['function burn(uint256 tokenId) external']),
        functionName: 'burn',
        args: [BigInt(tokenId)],
      });

      // Request accounts
      await ethereum.request({ method: 'eth_requestAccounts' });

      // Send transaction
      const hash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: MUSIC_NFT_V5,
          data,
          value: '0x0',
        }],
      });

      console.log('✅ Burn transaction sent:', hash);
      setTxHash(hash);
      setSuccess(`🔥 NFT #${tokenId} burned successfully!`);

      // Wait then redirect back
      setTimeout(() => {
        window.location.href = '/profile?tab=music';
      }, 3000);

    } catch (err: any) {
      console.error('❌ Burn error:', err);
      setError(err.message || 'Failed to burn NFT');
    } finally {
      setLoading(false);
    }
  };

  if (contextLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!walletAddress || !fid) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-purple-500/20">
          <h1 className="text-3xl font-bold text-white mb-4">🔥 Burn NFT</h1>
          <p className="text-gray-300 mb-6">
            Please open this page in the Farcaster app to burn your NFT.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-purple-500/20">
        <h1 className="text-3xl font-bold text-white mb-6">🔥 Burn NFT</h1>

        {/* Token Info */}
        <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">Token ID</div>
          <div className="text-xl font-bold text-white">#{tokenId}</div>
          {tokenName && (
            <>
              <div className="text-sm text-gray-400 mt-3 mb-1">Name</div>
              <div className="text-lg text-white">{tokenName}</div>
            </>
          )}
        </div>

        {/* Wallet Info */}
        {walletAddress && (
          <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
            <div className="text-sm text-gray-400 mb-1">Your Wallet</div>
            <div className="text-sm font-mono text-white">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </div>
            {fid && (
              <div className="text-xs text-gray-400 mt-1">FID: {fid}</div>
            )}
          </div>
        )}

        {/* Warning */}
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-semibold text-red-300 mb-1">Permanent Action</div>
              <div className="text-sm text-red-200">
                This action cannot be undone. You'll pay a small gas fee to burn your NFT and receive 5 TOURS as a reward.
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-4 p-4 bg-green-900/50 border border-green-500/50 rounded-lg text-green-200">
            {success}
            {txHash && (
              <div className="mt-2 text-xs break-all">
                <a
                  href={`https://testnet.monadscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-300 hover:text-green-100 underline"
                >
                  View on Monadscan
                </a>
              </div>
            )}
          </div>
        )}

        {/* Burn Button */}
        <button
          onClick={handleBurn}
          disabled={loading || !tokenId || !walletAddress}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              Burning...
            </>
          ) : (
            <>
              🔥 Burn NFT & Get 5 TOURS
            </>
          )}
        </button>

        {/* Cancel */}
        <button
          onClick={() => window.location.href = '/profile?tab=music'}
          disabled={loading}
          className="w-full mt-3 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
