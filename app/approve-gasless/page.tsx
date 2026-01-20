'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { encodeFunctionData, parseAbi } from 'viem';

const MUSIC_NFT_V5 = process.env.NEXT_PUBLIC_NFT_CONTRACT as `0x${string}`;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as `0x${string}`;

export default function ApproveGaslessPage() {
  const { walletAddress, loading: farcasterLoading } = useFarcasterContext();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasEthereum, setHasEthereum] = useState(false);

  useEffect(() => {
    // Check if window.ethereum is available
    setHasEthereum(typeof window !== 'undefined' && !!(window as any).ethereum);
  }, []);

  const handleApprove = async () => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }

    setError('');
    setSuccess('');
    setTxHash('');
    setLoading(true);

    try {
      // Use window.ethereum provider directly
      const ethereum = (window as any).ethereum;

      if (!ethereum) {
        throw new Error('No Ethereum provider found. Please install a wallet like MetaMask.');
      }

      console.log('📝 Encoding setApprovalForAll call...');

      // Encode the function call
      const data = encodeFunctionData({
        abi: parseAbi(['function setApprovalForAll(address operator, bool approved) external']),
        functionName: 'setApprovalForAll',
        args: [SAFE_ACCOUNT, true],
      });

      console.log('📤 Sending approval transaction via window.ethereum...');

      // Request accounts if needed
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

      console.log('✅ Approval transaction sent:', hash);
      setTxHash(hash);
      setSuccess('Approval successful! You can now burn NFTs gaslessly.');
    } catch (err: any) {
      console.error('❌ Approval error:', err);
      setError(err.message || 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  // Show success screen after approval
  if (txHash && success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-green-500/20">
          <h1 className="text-3xl font-bold text-white mb-4">✅ Approved!</h1>
          <p className="text-gray-300 mb-4">
            You can now burn NFTs gaslessly using the bot command:
          </p>
          <div className="bg-slate-700/50 p-4 rounded-lg mb-4">
            <code className="text-green-400">burn music [tokenId]</code>
          </div>

          {txHash && (
            <div className="mb-6 p-3 bg-slate-700/50 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Transaction Hash:</p>
              <p className="text-xs text-blue-300 font-mono break-all mb-2">{txHash}</p>
              <a
                href={`https://testnet.monadscan.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-xs underline"
              >
                View on Monadscan →
              </a>
            </div>
          )}

          <button
            onClick={() => window.location.href = '/profile?tab=music'}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Back to Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-purple-500/20">
        <h1 className="text-3xl font-bold text-white mb-6">🔓 Approve Gasless Burning</h1>

        <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
          <div className="text-sm text-blue-200">
            <p className="mb-2">This is a <strong>one-time approval</strong> that allows the gasless system to burn your NFTs on your behalf.</p>
            <p>After this, you can use the bot command <code className="bg-slate-700 px-2 py-1 rounded">burn music [id]</code> without paying gas!</p>
          </div>
        </div>

        {walletAddress && (
          <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
            <div className="text-xs text-gray-300 space-y-1">
              <p>Your Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
              <p>Status: ✅ Connected via Farcaster</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-900/50 border border-green-500/50 rounded-lg text-green-200">
            {success}
          </div>
        )}

        <button
          onClick={handleApprove}
          disabled={loading || !walletAddress || farcasterLoading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              Sending Approval...
            </>
          ) : (
            <>
              🔓 Approve Gasless System
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 mt-4 text-center">
          You'll sign this transaction with your Farcaster wallet.
        </p>
      </div>
    </div>
  );
}
