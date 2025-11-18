'use client';

import { useState, useEffect } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { monadTestnet } from '../chains';
import { parseAbiItem } from 'viem';

function BurnMusicContent() {
  const { login, authenticated, user, ready } = usePrivy();
  const { wallets } = useWallets();

  const [tokenId, setTokenId] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [preferredWallet, setPreferredWallet] = useState<string | null>(null);

  // Get URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('tokenId');
      const name = urlParams.get('name');
      const fromAddress = urlParams.get('from')?.toLowerCase();

      if (token) setTokenId(token);
      if (name) setTokenName(decodeURIComponent(name));
      if (fromAddress) setPreferredWallet(fromAddress);
    }
  }, []);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<any>(null);

  // Auto-select wallet based on URL parameter or show selection
  useEffect(() => {
    if (wallets.length > 0) {
      if (preferredWallet) {
        const matchingWallet = wallets.find(w => w.address.toLowerCase() === preferredWallet);
        if (matchingWallet) {
          setSelectedWallet(matchingWallet);
          console.log('✅ Auto-selected wallet from URL:', matchingWallet.address);
        } else {
          setSelectedWallet(wallets[0]);
          console.warn('⚠️ Preferred wallet not found, using first wallet');
        }
      } else {
        const privyWallet = wallets.find(w => w.walletClientType === 'privy');
        const nonMetaMaskWallet = wallets.find(w =>
          w.walletClientType !== 'metamask' && w.walletClientType !== 'injected'
        );

        if (privyWallet) {
          setSelectedWallet(privyWallet);
          console.log('✅ Auto-selected Privy embedded wallet:', privyWallet.address);
        } else if (nonMetaMaskWallet) {
          setSelectedWallet(nonMetaMaskWallet);
          console.log('✅ Auto-selected non-MetaMask wallet:', nonMetaMaskWallet.address);
        } else {
          setSelectedWallet(wallets[0]);
          console.log('⚠️ Using first available wallet:', wallets[0].address);
        }
      }
    }
  }, [wallets, preferredWallet]);

  // Debug logging
  useEffect(() => {
    console.log('🔐 Privy state:', {
      ready,
      authenticated,
      user: user?.id,
      walletsCount: wallets.length,
      walletAddresses: wallets.map(w => w.address),
      preferredWallet,
      selectedWallet: selectedWallet?.address
    });
  }, [ready, authenticated, user, wallets, preferredWallet, selectedWallet]);

  const handleBurn = async () => {
    if (!tokenId || !selectedWallet) return;

    try {
      setError('');
      setSuccess('');
      setTxHash('');
      setLoading(true);

      const wallet = selectedWallet;

      console.log('🔥 Burning NFT with wallet:', {
        address: wallet.address,
        type: wallet.walletClientType,
        chainId: wallet.chainId,
        tokenId
      });

      // Switch to Monad if needed
      if (wallet.chainId !== `eip155:${monadTestnet.id}`) {
        console.log(`🔄 Switching wallet to Monad Testnet (chain ${monadTestnet.id})...`);
        await wallet.switchChain(monadTestnet.id);
      }

      // Get EIP1193 provider
      const provider = await wallet.getEthereumProvider();

      const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS! as `0x${string}`;

      // Encode burn function call
      const burnData = parseAbiItem('function burnMusicNFT(uint256 tokenId) external');
      const data = `0x${burnData.name}${BigInt(tokenId).toString(16).padStart(64, '0')}`;

      console.log('📝 Sending burn transaction...');

      // Send transaction via provider
      const tx = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet.address,
          to: MUSIC_NFT_ADDRESS,
          data: `0x46dd2b43${BigInt(tokenId).toString(16).padStart(64, '0')}`, // burnMusicNFT selector
          value: '0x0',
        }],
      });

      console.log('✅ Burn transaction sent:', tx);
      setTxHash(tx as string);
      setSuccess(`Music NFT #${tokenId} burn transaction submitted! TX: ${(tx as string).slice(0, 10)}...`);

      // Wait a moment then redirect back
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

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
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

        {/* Wallet Selection */}
        {wallets.length > 1 && (
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-300 mb-2 block">
              Select Wallet
            </label>
            <select
              value={selectedWallet?.address || ''}
              onChange={(e) => {
                const wallet = wallets.find(w => w.address === e.target.value);
                setSelectedWallet(wallet);
              }}
              className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-purple-500/20 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {wallets.map((wallet) => (
                <option key={wallet.address} value={wallet.address}>
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)} ({wallet.walletClientType})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Warning */}
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-semibold text-red-300 mb-1">Permanent Action</div>
              <div className="text-sm text-red-200">
                This action cannot be undone. You will pay gas for this transaction.
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
                  href={`https://explorer.testnet.monad.xyz/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-300 hover:text-green-100 underline"
                >
                  View on Explorer
                </a>
              </div>
            )}
          </div>
        )}

        {/* Burn Button */}
        <button
          onClick={handleBurn}
          disabled={loading || !tokenId || !selectedWallet}
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
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['farcaster', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#8b5cf6',
        },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
      }}
    >
      <BurnMusicContent />
    </PrivyProvider>
  );
}
