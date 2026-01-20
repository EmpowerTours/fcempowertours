'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '../hooks/useFarcasterContext';
import { monadTestnet } from '../chains';

export default function SendMonPage() {
  const {
    walletAddress,
    custodyAddress,
    loading: farcasterLoading,
    error: farcasterError,
    sendTransaction,
    user,
    fid
  } = useFarcasterContext();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);

  // Get URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const toAddress = urlParams.get('to');
      const amountParam = urlParams.get('amount');

      if (toAddress) setRecipient(toAddress);
      if (amountParam) setAmount(amountParam);
    }
  }, []);

  // Debug logging
  useEffect(() => {
    console.log('🔐 Farcaster state:', {
      loading: farcasterLoading,
      walletAddress,
      custodyAddress,
      fid,
      user
    });
  }, [farcasterLoading, walletAddress, custodyAddress, fid, user]);

  const handleSend = async () => {
    if (!amount || !recipient) return;

    // Use Safe AA wallet address
    const senderAddress = '0xDdaE200DBc2874BAd4FdB5e39F227215386c7533';

    try {
      setError('');
      setSuccess('');
      setTxHash('');
      setLoading(true);

      console.log('💰 Sending MON:', {
        from: senderAddress,
        to: recipient,
        amount,
        chainId: monadTestnet.id
      });

      // Convert amount to wei (hex)
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 1e18));
      console.log('Sending', amount, 'MON =', amountInWei.toString(), 'wei');

      // Send transaction using Farcaster SDK
      const result = await sendTransaction({
        to: recipient,
        value: '0x' + amountInWei.toString(16),
        chainId: monadTestnet.id,
      });

      const hash = result?.transactionHash || result;
      setTxHash(hash);
      setSuccess(`Transaction sent! Hash: ${hash}`);
      console.log('✅ Transaction sent:', hash);

      // ✅ Notify bot about successful transaction
      try {
        const username = user?.username || fid?.toString() || senderAddress.slice(0, 8);

        const callbackResponse = await fetch('/api/send-mon-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash: hash,
            amount,
            fromAddress: senderAddress,
            toAddress: recipient,
            username,
            fid,
          }),
        });

        if (callbackResponse.ok) {
          const callbackData = await callbackResponse.json();
          console.log('✅ Bot notified of transaction:', callbackData);
        } else {
          console.warn('⚠️ Failed to notify bot of transaction');
        }
      } catch (callbackError) {
        console.error('❌ Failed to notify bot:', callbackError);
        // Don't fail the transaction if callback fails
      }
    } catch (err: any) {
      console.error('❌ Transaction failed:', err);
      setError(err.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while Farcaster SDK initializes
  if (farcasterLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Send MON</h1>
            <p className="text-gray-300 text-sm">Loading Farcaster SDK...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if Farcaster SDK failed to load
  if (farcasterError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Send MON</h1>
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
              <p className="text-red-200 text-sm">Failed to load Farcaster SDK: {farcasterError.message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Safe AA wallet address (hardcoded as primary wallet)
  const safeWalletAddress = '0xDdaE200DBc2874BAd4FdB5e39F227215386c7533';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Send MON</h1>
          <p className="text-gray-300 text-sm">Send MON from your Farcaster Safe wallet</p>
        </div>

        <>
          <div className="bg-yellow-500/20 border border-yellow-500 rounded-xl p-4 mb-4">
            <p className="text-yellow-200 font-semibold mb-2">⚠️ Manual Transfer Required</p>
            <p className="text-yellow-100 text-xs">
              Monad Testnet is not in Farcaster's token list yet. To send MON to your Safe:
            </p>
            <ol className="text-yellow-100 text-xs mt-2 ml-4 list-decimal space-y-1">
              <li>Copy your Safe address below</li>
              <li>Use MetaMask or another wallet</li>
              <li>Send MON to your Safe address</li>
            </ol>
          </div>

          <div className="bg-black/20 rounded-xl p-4">
            <p className="text-gray-400 text-xs">Your Safe Wallet Address</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-white font-mono text-sm break-all flex-1">
                {safeWalletAddress}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(safeWalletAddress);
                  alert('Safe address copied!');
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs"
              >
                Copy
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-gray-500 text-xs">
                Type: Safe Account Abstraction Wallet
              </p>
              <span className="text-green-400 text-xs">✓ Farcaster</span>
            </div>
            {fid && (
              <p className="text-blue-400 text-xs mt-2">
                💡 FID: {fid}
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
                💡 Transaction will be signed using your Farcaster wallet
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
            disabled={loading || !amount || !recipient}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Sending...' : 'Send MON'}
          </button>

          <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
            <p className="text-yellow-200 text-xs">
              ⚠️ You'll approve this transaction using your Farcaster wallet
            </p>
          </div>
        </>
      </div>
    </div>
  );
}
