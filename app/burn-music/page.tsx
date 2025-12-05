'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { monadTestnet } from '@/app/chains';
import { encodeFunctionData, parseAbi } from 'viem';

const NFT_ADDRESS = (process.env.NEXT_PUBLIC_NFT_ADDRESS || '0xAD403897CD7d465445aF0BD4fe40f18698655D4e') as `0x${string}`;

const nftAbi = parseAbi([
  'function burnNFT(uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
]);

export default function BurnMusicPage() {
  const { walletAddress, fid, isLoading: contextLoading, sendTransaction } = useFarcasterContext();

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
    if (!tokenId || !walletAddress || !sendTransaction) {
      setError('Missing required information or wallet not connected');
      return;
    }

    setError('');
    setSuccess('');
    setTxHash('');
    setLoading(true);

    try {
      console.log('🔥 Burning NFT directly from Farcaster wallet:', {
        wallet: walletAddress,
        tokenId,
        nftContract: NFT_ADDRESS
      });

      // Encode the burnNFT function call
      const burnData = encodeFunctionData({
        abi: nftAbi,
        functionName: 'burnNFT',
        args: [BigInt(tokenId)],
      });

      console.log('📝 Encoded burn data:', burnData);

      // Send transaction using Farcaster SDK
      const result = await sendTransaction({
        to: NFT_ADDRESS,
        data: burnData,
        chainId: monadTestnet.id,
      });

      const hash = result?.transactionHash || result;
      console.log('✅ Burn transaction sent:', hash);

      setTxHash(hash);
      setSuccess(`🔥 NFT #${tokenId} burned successfully! You'll receive 5 TOURS.`);

      // Wait then redirect back
      setTimeout(() => {
        window.location.href = '/profile';
      }, 3000);

    } catch (err: any) {
      console.error('❌ Burn error:', err);
      setError(err.message || 'Failed to burn NFT. Make sure you own this NFT.');
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

        {/* Info about burn reward */}
        <div className="mb-6 p-4 bg-green-900/30 border border-green-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <div className="font-semibold text-green-300 mb-1">Burn Reward</div>
              <div className="text-sm text-green-200">
                You'll receive 5 TOURS tokens as a reward for burning this NFT. Small gas fee required (~$0.01).
              </div>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-semibold text-red-300 mb-1">Permanent Action</div>
              <div className="text-sm text-red-200">
                This action cannot be undone. Your NFT will be permanently burned and you'll receive 5 TOURS as a reward.
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
          onClick={() => window.location.href = '/profile'}
          disabled={loading}
          className="w-full mt-3 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
