'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { monadTestnet } from '../chains';
import { encodeFunctionData, parseAbi } from 'viem';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';

function BurnMusicContent() {
  const { walletAddress, fid, isLoading: contextLoading } = useFarcasterContext();
  const { login, authenticated, ready: privyReady } = usePrivy();
  const { wallets } = useWallets();

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
    if (!tokenId || !walletAddress) return;

    setError('');
    setSuccess('');
    setTxHash('');
    setLoading(true);

    try {
      console.log('🔥 Attempting to burn NFT:', {
        wallet: walletAddress,
        tokenId,
        fid,
        authenticated,
        walletsCount: wallets.length
      });

      // Use Privy wallet to sign the burn transaction
      if (!authenticated) {
        setError('Please connect your wallet first');
        setLoading(false);
        return;
      }

      // Find a connected wallet
      const wallet = wallets.find(w =>
        w.address.toLowerCase() === walletAddress.toLowerCase()
      ) || wallets[0];

      if (!wallet) {
        setError('No wallet connected. Please connect a wallet to burn NFTs.');
        setLoading(false);
        return;
      }

      console.log('📝 Using wallet:', wallet.address);
      console.log('📝 Wallet type:', wallet.walletClientType);
      setSuccess('⏳ Preparing transaction...');

      // Get Ethereum provider from wallet
      const provider = await wallet.getEthereumProvider();
      console.log('✅ Provider obtained');

      // Switch to Monad testnet
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + monadTestnet.id.toString(16) }],
        });
        console.log('✅ Switched to Monad testnet');
      } catch (switchError: any) {
        // Chain not added, try adding it
        if (switchError.code === 4902) {
          console.log('⚙️ Adding Monad testnet...');
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x' + monadTestnet.id.toString(16),
              chainName: monadTestnet.name,
              rpcUrls: [monadTestnet.rpcUrls.default.http[0]],
              nativeCurrency: monadTestnet.nativeCurrency,
            }],
          });
          console.log('✅ Monad testnet added');
        }
      }

      // Encode burnMusicNFT call
      const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS!;
      const burnData = encodeFunctionData({
        abi: parseAbi(['function burnMusicNFT(uint256 tokenId) external']),
        functionName: 'burnMusicNFT',
        args: [BigInt(tokenId)],
      });

      setSuccess('⏳ Please sign the transaction in your wallet...');

      console.log('📝 Sending transaction...');
      console.log('   From:', wallet.address);
      console.log('   To:', MUSIC_NFT_ADDRESS);
      console.log('   TokenID:', tokenId);

      // Send transaction
      const txResponse = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet.address,
          to: MUSIC_NFT_ADDRESS,
          data: burnData,
          value: '0x0',
        }],
      });

      console.log('✅ Transaction response received:', txResponse);
      console.log('   Response type:', typeof txResponse);
      console.log('   Response value:', JSON.stringify(txResponse));

      // Handle different response formats
      let hash;
      if (typeof txResponse === 'string') {
        hash = txResponse;
      } else if (txResponse && typeof txResponse === 'object') {
        hash = (txResponse as any).hash || (txResponse as any).transactionHash || (txResponse as any).tx;
      }

      console.log('✅ Extracted hash:', hash);

      if (!hash) {
        throw new Error('No transaction hash returned from wallet');
      }

      setTxHash(hash);
      setSuccess(`Music NFT #${tokenId} burned successfully!`);

      // Wait then redirect back
      setTimeout(() => {
        window.location.href = '/profile?tab=music';
      }, 3000);

    } catch (err: any) {
      console.error('❌ Burn error:', err);
      console.error('❌ Error details:', {
        message: err.message,
        code: err.code,
        data: err.data
      });
      setError(err.message || 'Failed to burn NFT');
    } finally {
      setLoading(false);
    }
  };

  if (contextLoading || !privyReady) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!walletAddress && !authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-purple-500/20">
          <h1 className="text-3xl font-bold text-white mb-4">🔥 Burn Music NFT</h1>
          <p className="text-gray-300 mb-6">
            Please connect your wallet to burn this music NFT.
          </p>
          <button
            onClick={login}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Connect Wallet
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
                This action cannot be undone. You'll need to sign the transaction and pay a small gas fee (~0.001 MON).
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

export default function BurnMusicPage() {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#9333EA',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        loginMethods: ['farcaster', 'wallet'],
      }}
    >
      <BurnMusicContent />
    </PrivyProvider>
  );
}
