'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

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
      console.log('🔥 Burning NFT via delegated burn (gasless):', {
        wallet: walletAddress,
        tokenId
      });

      // First ensure we have a valid delegation with burn_nft permission
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('burn_nft');

      if (!hasValidDelegation) {
        console.log('🔐 Creating delegation with burn_nft permission...');
        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: walletAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours', 'burn_nft']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation for burning');
        }
        console.log('✅ Delegation created with burn_nft permission');
      }

      // Use delegated burning via platform Safe account (gasless)
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'burn_nft',
          params: {
            tokenId: tokenId,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to burn NFT');
      }

      console.log('✅ Burn transaction sent:', data.txHash);
      setTxHash(data.txHash);
      setSuccess(`🔥 NFT #${tokenId} burned successfully! You received 5 TOURS.`);

      // Wait then redirect back
      setTimeout(() => {
        window.location.href = '/profile';
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

        {/* Info about gasless burn */}
        <div className="mb-6 p-4 bg-green-900/30 border border-green-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⛽</span>
            <div>
              <div className="font-semibold text-green-300 mb-1">Gasless Transaction</div>
              <div className="text-sm text-green-200">
                This burn is FREE! We pay the gas fees on your behalf. You'll receive 5 TOURS tokens as a reward.
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
              🔥 Burn NFT & Get 5 TOURS (FREE)
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
