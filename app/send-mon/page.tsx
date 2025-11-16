'use client';

import { useState, useEffect } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { monadTestnet } from '../chains';

function SendMonContent() {
  const { login, authenticated, user, ready } = usePrivy();
  const { wallets } = useWallets();

  // Get URL parameters
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const defaultRecipient = urlParams?.get('to') || '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20';
  const defaultAmount = urlParams?.get('amount') || '';

  const [recipient, setRecipient] = useState(defaultRecipient);
  const [amount, setAmount] = useState(defaultAmount);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log('🔐 Privy state:', {
      ready,
      authenticated,
      user: user?.id,
      walletsCount: wallets.length,
      walletAddresses: wallets.map(w => w.address)
    });
  }, [ready, authenticated, user, wallets]);

  const handleSend = async () => {
    if (!amount || !recipient || wallets.length === 0) return;

    try {
      setError('');
      setSuccess('');
      setTxHash('');
      setLoading(true);

      // Get the embedded wallet (created when user logs in with Farcaster)
      const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
      const wallet = embeddedWallet || wallets[0];

      console.log('Using wallet:', {
        address: wallet.address,
        type: wallet.walletClientType,
        chainId: wallet.chainId
      });

      // Switch to Monad testnet if needed
      if (wallet.chainId !== monadTestnet.id.toString()) {
        console.log('Switching to Monad testnet...');
        await wallet.switchChain(monadTestnet.id);
      }

      // Convert amount to wei (hex)
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 1e18));
      console.log('Sending', amount, 'MON =', amountInWei.toString(), 'wei');

      // Get provider from wallet
      const provider = await wallet.getEthereumProvider();

      // Send transaction
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet.address,
          to: recipient,
          value: '0x' + amountInWei.toString(16),
        }],
      }) as string;

      setTxHash(hash);
      setSuccess(`Transaction sent! Hash: ${hash}`);
      console.log('✅ Transaction sent:', hash);
    } catch (err: any) {
      console.error('❌ Transaction failed:', err);
      setError(err.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while Privy initializes
  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Send MON</h1>
            <p className="text-gray-300 text-sm">Loading Privy...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Send MON</h1>
          <p className="text-gray-300 text-sm">Connect your Farcaster account via Privy</p>
        </div>

        {!authenticated ? (
          <div className="space-y-4">
            <button
              onClick={() => {
                console.log('🔐 Login button clicked');
                login();
              }}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200"
            >
              Connect with Farcaster
            </button>
            <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
              <p className="text-blue-200 text-sm">
                💡 Privy will access your verified wallets linked to your Farcaster account
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-black/20 rounded-xl p-4">
              <p className="text-gray-400 text-xs">Connected as</p>
              <p className="text-white font-mono text-sm break-all">
                {wallets.length > 0 ? wallets[0].address : (user?.wallet?.address || 'Loading...')}
              </p>
              {wallets.length > 0 && (
                <p className="text-gray-500 text-xs mt-1">
                  Type: {wallets.find(w => w.walletClientType === 'privy') ? 'Privy Embedded Wallet' : wallets[0].walletClientType}
                </p>
              )}
            </div>

            <div className="bg-black/20 rounded-xl p-6 space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-2">Amount (MON)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10.0"
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm block mb-2">To Address</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-3">
                <p className="text-blue-200 text-xs">
                  💡 Default is Safe address (for funding gasless transactions)
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 space-y-2">
                <p className="text-green-200 font-semibold">✅ Transaction Successful!</p>
                {txHash && (
                  <>
                    <p className="text-green-200 text-xs break-all font-mono">{txHash}</p>
                    <a
                      href={`https://testnet.monadscan.com/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 hover:text-blue-200 text-sm underline block mt-2"
                    >
                      View on MonadScan →
                    </a>
                  </>
                )}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={loading || !amount || !recipient || wallets.length === 0}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Sending...' : 'Send MON'}
            </button>

            <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
              <p className="text-yellow-200 text-xs">
                ⚠️ You'll approve this transaction and pay gas fees from your wallet.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SendMonPage() {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmaoduqox005ole0nmj1s4qck'}
      config={{
        loginMethods: ['farcaster', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#8B5CF6',
          logo: 'https://fcempowertours-production-6551.up.railway.app/logo.png',
        },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
      }}
      onSuccess={(user) => {
        console.log('✅ Privy login success:', user);
      }}
    >
      <SendMonContent />
    </PrivyProvider>
  );
}
