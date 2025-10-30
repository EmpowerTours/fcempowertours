'use client';
import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';
import Link from 'next/link';

interface SwapQuote {
  monAmount: string;
  toursAmount: string;
  rate: string;
}

export default function MarketPage() {
  const { user, walletAddress, isMobile, isLoading: contextLoading, requestWallet } = useFarcasterContext();
  const { executeCommand, loading: botLoading, error: botError } = useBotCommand();

  const [swapAmount, setSwapAmount] = useState('0.1');
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [balances, setBalances] = useState({ mon: '0', tours: '0' });

  useEffect(() => {
    if (walletAddress) {
      loadBalances();
      generateSwapQuote();
    }
  }, [walletAddress]);

  // ✅ FIXED: Improved balance loading with retry mechanism
  const loadBalancesWithRetry = async (retries = 3) => {
    if (!walletAddress) return;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`💰 Loading balances (attempt ${attempt}/${retries})...`);
        
        const response = await fetch('/api/get-balances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletAddress }),
        });
        
        if (response.ok) {
          const data = await response.json();
          setBalances(data);
          console.log('✅ Balances loaded:', data);
          return; // Success, exit retry loop
        }
      } catch (error) {
        console.error(`❌ Balance load attempt ${attempt} failed:`, error);
        if (attempt < retries) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  };

  const loadBalances = () => loadBalancesWithRetry(1); // Single attempt for initial load

  const generateSwapQuote = async () => {
    try {
      const amount = parseFloat(swapAmount) || 0;
      if (amount <= 0) {
        setQuote(null);
        return;
      }

      // Simple rate: 1 MON = 1 TOURS
      const toursAmount = (amount * 1).toFixed(4);
      setQuote({
        monAmount: amount.toString(),
        toursAmount,
        rate: '1.0',
      });
    } catch (error) {
      console.error('Error generating quote:', error);
      setQuote(null);
    }
  };

  const handleSwapClick = async () => {
    if (!walletAddress) {
      alert('🔑 Please connect your wallet first');
      await requestWallet();
      return;
    }

    const amount = parseFloat(swapAmount);
    if (amount <= 0 || amount > 10) {
      setSwapError('❌ Invalid amount. Please use 0.01 - 10 MON');
      return;
    }

    setSwapError(null);
    setSwapSuccess(null);

    try {
      console.log(`💱 Executing swap via bot command: ${amount} MON for user ${walletAddress}`);

      const command = `swap ${amount} mon`;

      // ✅ USE useBotCommand HOOK INSTEAD OF MANUAL FETCH
      const result = await executeCommand(command);

      if (!result.success) {
        throw new Error(result.error || result.message || 'Swap failed');
      }

      console.log('✅ Swap successful:', result.txHash);
      
      // ✅ FIXED: Show txHash properly in success message
      const txHash = result.txHash || 'unknown';
      setSwapSuccess(`🎉 Swapped ${amount} MON for TOURS!

TX: ${txHash}

View: https://testnet.monadscan.com/tx/${txHash}`);
      
      setSwapAmount('0.1');
      setQuote(null);

      // ✅ FIXED: Wait longer and retry multiple times to ensure balance updates
      setTimeout(() => {
        loadBalancesWithRetry(5); // Try 5 times with exponential backoff
      }, 5000); // Wait 5 seconds before first attempt
    } catch (error: any) {
      console.error('❌ Swap failed:', error);
      setSwapError(`❌ Swap failed: ${error.message}`);
    }
  };

  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading marketplace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🛒 EmpowerTours Marketplace</h1>
          <p className="text-gray-600">Swap tokens, buy music, and explore itineraries</p>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <Link
            href="/passport"
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center font-medium transition-all"
          >
            🎫 Passports
          </Link>
          <Link
            href="/music"
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center font-medium transition-all"
          >
            🎵 Music NFTs
          </Link>
          <Link
            href="/profile"
            className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center font-medium transition-all"
          >
            👤 My Profile
          </Link>
        </div>

        {/* User Status */}
        {walletAddress && (
          <div className="mb-8 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <p className="text-blue-900 text-sm font-medium">✅ Connected</p>
            <p className="text-blue-700 text-xs mt-1">
              {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
            </p>
          </div>
        )}

        {/* Current Balances */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-5 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border-2 border-yellow-200">
            <p className="text-xs text-gray-600 mb-2 font-medium">MON Balance</p>
            <p className="text-2xl font-bold text-yellow-700">{balances.mon}</p>
          </div>
          <div className="p-5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border-2 border-green-200">
            <p className="text-xs text-gray-600 mb-2 font-medium">TOURS Balance</p>
            <p className="text-2xl font-bold text-green-700">{balances.tours}</p>
          </div>
        </div>

        {/* Main Content - Swap Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">💱 Swap MON → TOURS</h2>

          {(swapError || botError) && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium text-sm">{swapError || botError}</p>
            </div>
          )}

          {swapSuccess && (
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-green-700 font-medium text-sm whitespace-pre-line">{swapSuccess}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount to Swap
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => {
                    setSwapAmount(e.target.value);
                    generateSwapQuote();
                  }}
                  placeholder="0.1"
                  min="0.01"
                  max="10"
                  step="0.01"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-600 focus:outline-none text-lg font-semibold"
                  disabled={botLoading}
                />
                <span className="absolute right-4 top-3 text-lg font-bold text-gray-600">
                  MON
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Available: {balances.mon} MON | Max: 10 MON
              </p>
            </div>

            {/* Quote */}
            {quote && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">You send</p>
                    <p className="text-xl font-bold text-purple-600">{quote.monAmount} MON</p>
                  </div>
                  <div className="text-2xl">→</div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">You receive</p>
                    <p className="text-xl font-bold text-green-600">{quote.toursAmount} TOURS</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center">
                  Rate: 1 MON = {quote.rate} TOURS
                </p>
              </div>
            )}

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {['0.1', '0.5', '1', '5'].map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setSwapAmount(amt);
                    setTimeout(generateSwapQuote, 0);
                  }}
                  disabled={botLoading}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {amt}
                </button>
              ))}
            </div>

            {/* Swap Button */}
            <button
              onClick={handleSwapClick}
              disabled={botLoading || !walletAddress || parseFloat(swapAmount) <= 0}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold text-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 touch-manipulation"
              style={{ minHeight: '56px' }}
            >
              {!walletAddress
                ? '🔑 Connect Wallet'
                : botLoading
                ? '⏳ Processing Swap...'
                : `💱 Swap ${swapAmount} MON for TOURS`
              }
            </button>

            {!walletAddress && (
              <button
                onClick={requestWallet}
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-all"
              >
                🔑 Connect Wallet
              </button>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <h3 className="font-bold text-gray-900 mb-2">💡 How It Works:</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✅ <strong>Gasless:</strong> We pay all transaction fees</li>
              <li>✅ <strong>Instant:</strong> Swap completes in seconds</li>
              <li>✅ <strong>Safe:</strong> Uses delegation via our bot</li>
              <li>💰 <strong>Rate:</strong> 1 MON = 1 TOURS (fair exchange)</li>
              <li>⏱️ <strong>Balance Update:</strong> May take 5-10 seconds</li>
            </ul>
          </div>

          {/* Manual Refresh Button */}
          <div className="mt-4">
            <button
              onClick={() => loadBalancesWithRetry(5)}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-all"
            >
              🔄 Refresh Balances
            </button>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            Questions? All swaps and purchases use <strong>delegation</strong> for gasless transactions.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Built on Monad Testnet | Powered by Pimlico Account Abstraction
          </p>
        </div>
      </div>
    </div>
  );
}
