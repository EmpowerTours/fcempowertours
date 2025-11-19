'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { monadTestnet } from '../chains';
import { encodeFunctionData, parseAbi } from 'viem';

export default function BurnMusicPage() {
  const { walletAddress, fid, isLoading: contextLoading, sendTransaction, switchChain, sdk } = useFarcasterContext();

  const [tokenId, setTokenId] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOpenExternalButton, setShowOpenExternalButton] = useState(false);

  const openExternally = () => {
    const externalUrl = `${process.env.NEXT_PUBLIC_URL || window.location.origin}/burn-music?tokenId=${tokenId}&name=${encodeURIComponent(tokenName)}`;

    if (sdk?.actions?.openUrl) {
      sdk.actions.openUrl({ url: externalUrl });
    } else {
      window.open(externalUrl, '_blank');
    }
  };

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
    if (!tokenId || !walletAddress) return;

    setError('');
    setSuccess('');
    setTxHash('');
    setLoading(true);

    try {
      console.log('🔥 Attempting to burn NFT:', {
        wallet: walletAddress,
        tokenId,
        fid
      });

      // Farcaster frames don't support arbitrary contract calls
      // We need to open the burn page externally or use an alternative method
      const isInFarcasterFrame = typeof window !== 'undefined' && window.parent !== window;

      if (isInFarcasterFrame) {
        setError(
          'Farcaster frames cannot perform this action. ' +
          'Please open this page in your browser to burn the NFT.'
        );
        setShowOpenExternalButton(true);
        return;
      }

      // Not in frame - try to send transaction
      // Encode the burnMusicNFT call
      const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS!;
      const burnData = encodeFunctionData({
        abi: parseAbi(['function burnMusicNFT(uint256 tokenId) external']),
        functionName: 'burnMusicNFT',
        args: [BigInt(tokenId)],
      });

      console.log('📝 Sending burn transaction from user wallet...');

      // Try with window.ethereum (MetaMask, etc.)
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const provider = (window as any).ethereum;

        // Request accounts
        await provider.request({ method: 'eth_requestAccounts' });

        // Switch to Monad testnet
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + monadTestnet.id.toString(16) }],
          });
        } catch (switchError: any) {
          // Chain not added, try adding it
          if (switchError.code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x' + monadTestnet.id.toString(16),
                chainName: monadTestnet.name,
                rpcUrls: [monadTestnet.rpcUrls.default.http[0]],
                nativeCurrency: monadTestnet.nativeCurrency,
              }],
            });
          }
        }

        // Send transaction
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: walletAddress,
            to: MUSIC_NFT_ADDRESS,
            data: burnData,
            value: '0x0',
          }],
        });

        console.log('✅ Burn transaction sent:', txHash);
        setTxHash(txHash);
        setSuccess(`Music NFT #${tokenId} burned successfully!`);

        // Wait then redirect back
        setTimeout(() => {
          window.location.href = '/profile?tab=music';
        }, 3000);
      } else {
        setError(
          'No wallet found. Please install MetaMask or another Web3 wallet to burn NFTs.'
        );
      }

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

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-purple-500/20">
          <h1 className="text-3xl font-bold text-white mb-4">🔥 Burn Music NFT</h1>
          <p className="text-gray-300 mb-6">
            Please connect your Farcaster account to burn this music NFT.
          </p>
          <button
            onClick={() => window.location.href = '/profile'}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-purple-500/20">
        <h1 className="text-3xl font-bold text-white mb-6">🔥 Burn Music NFT</h1>

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
        <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">Your Wallet</div>
          <div className="text-sm font-mono text-white">
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </div>
          {fid && (
            <div className="text-xs text-gray-400 mt-1">FID: {fid}</div>
          )}
        </div>

        {/* Warning */}
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-semibold text-red-300 mb-1">Permanent Action</div>
              <div className="text-sm text-red-200">
                This action cannot be undone. You'll need to sign the transaction and pay a small gas fee.
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

        {/* Open Externally Button */}
        {showOpenExternalButton && (
          <button
            onClick={openExternally}
            className="w-full mb-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            🌐 Open in Browser
          </button>
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
              🔥 Burn NFT
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
