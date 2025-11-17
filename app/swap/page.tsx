// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSwap } from '@/src/hooks';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import PassportGate from '@/app/components/PassportGate';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export default function SwapPage() {
  return (
    <PassportGate>
      <SwapContent />
    </PassportGate>
  );
}

function SwapContent() {
  const { address } = useAccount();
  const { walletAddress } = useFarcasterContext();
  const [swapType, setSwapType] = useState<'token-swap' | 'amm'>('token-swap');
  const [swapDirection, setSwapDirection] = useState<'tours-to-wmon' | 'wmon-to-tours'>('tours-to-wmon');
  const [inputAmount, setInputAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5'); // 0.5% default slippage

  // TokenSwap (MON to TOURS) state
  const [monAmount, setMonAmount] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<any>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Wrap/Unwrap state
  const [wrapAmount, setWrapAmount] = useState('');
  const [unwrapAmount, setUnwrapAmount] = useState('');

  const {
    useGetToursBalance,
    useGetWMONBalance,
    useGetToursToWMONQuote,
    useGetWMONToToursQuote,
    useGetReserves,
    useGetPrice,
    approveTOURS,
    approveWMON,
    swapToursForWMON,
    swapWMONForTours,
    wrapMON,
    unwrapWMON,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  } = useSwap();

  const effectiveAddress = (address || walletAddress) as `0x${string}` | undefined;
  const { data: toursBalance } = useGetToursBalance(effectiveAddress);
  const { data: wmonBalance } = useGetWMONBalance(effectiveAddress);
  const { data: reserves } = useGetReserves();
  const { data: price } = useGetPrice();

  // Get quote based on direction
  const { data: quote } = swapDirection === 'tours-to-wmon'
    ? useGetToursToWMONQuote(inputAmount || '0')
    : useGetWMONToToursQuote(inputAmount || '0');

  const outputAmount = quote ? formatEther(quote as bigint) : '0';
  const minOutput = outputAmount ? (parseFloat(outputAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6) : '0';

  const handleSwap = () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (swapDirection === 'tours-to-wmon') {
      swapToursForWMON(inputAmount, minOutput);
    } else {
      swapWMONForTours(inputAmount, minOutput);
    }
  };

  const handleApprove = () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (swapDirection === 'tours-to-wmon') {
      approveTOURS(inputAmount);
    } else {
      approveWMON(inputAmount);
    }
  };

  const switchDirection = () => {
    setSwapDirection(prev =>
      prev === 'tours-to-wmon' ? 'wmon-to-tours' : 'tours-to-wmon'
    );
    setInputAmount('');
  };

  const currentPrice = price ? formatEther(price as bigint) : '0';
  const priceDisplay = swapDirection === 'tours-to-wmon'
    ? `1 TOURS = ${parseFloat(currentPrice).toFixed(6)} WMON`
    : `1 WMON = ${(1 / parseFloat(currentPrice)).toFixed(2)} TOURS`;

  // TokenSwap (MON to TOURS) handler
  const handleTokenSwap = async () => {
    if (!monAmount || parseFloat(monAmount) <= 0) {
      setSwapError('Please enter a valid amount');
      return;
    }

    if (parseFloat(monAmount) > 10) {
      setSwapError('Maximum swap amount is 10 MON');
      return;
    }

    setIsSwapping(true);
    setSwapError(null);
    setSwapResult(null);

    try {
      const response = await fetch('/api/execute-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress || address,
          amount: monAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Swap failed');
      }

      setSwapResult(data);
      setMonAmount('');
    } catch (error: any) {
      setSwapError(error.message || 'Swap failed');
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-4">Token Swap</h1>
          <p className="text-purple-200 text-lg">
            Swap MON for TOURS or trade TOURS/WMON on our AMM
          </p>
        </div>

        {/* Swap Type Tabs */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-2 mb-6 border border-white/20 flex gap-2">
          <button
            onClick={() => setSwapType('token-swap')}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
              swapType === 'token-swap'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                : 'text-purple-200 hover:bg-white/10'
            }`}
          >
            MON → TOURS (Gasless)
          </button>
          <button
            onClick={() => setSwapType('amm')}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
              swapType === 'amm'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                : 'text-purple-200 hover:bg-white/10'
            }`}
          >
            TOURS ⇄ WMON (AMM)
          </button>
        </div>

        {/* TokenSwap Interface (MON → TOURS) */}
        {swapType === 'token-swap' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Buy TOURS with MON</h2>
              <p className="text-purple-200 text-sm">
                Gasless swap! Server pays the gas fees for you.
              </p>
            </div>

            {/* Input */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <label className="text-white font-semibold">MON Amount</label>
                <div className="text-purple-200 text-sm">Max: 10 MON</div>
              </div>
              <div className="bg-black/30 rounded-xl p-4 flex items-center gap-4">
                <input
                  type="number"
                  value={monAmount}
                  onChange={(e) => setMonAmount(e.target.value)}
                  placeholder="0.0"
                  max="10"
                  step="0.1"
                  className="flex-1 bg-transparent text-white text-2xl outline-none"
                />
                <div className="bg-purple-600 px-4 py-2 rounded-lg">
                  <span className="text-white font-bold">MON</span>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {swapError && (
              <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                <p className="text-red-200">{swapError}</p>
              </div>
            )}

            {/* Success Display */}
            {swapResult && (
              <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                <p className="text-green-200 font-semibold mb-2">Swap successful!</p>
                <p className="text-green-100 text-sm">
                  Received {swapResult.toursReceived} TOURS
                </p>
                <a
                  href={`https://testnet.monadscan.com/tx/${swapResult.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 text-sm underline"
                >
                  View Transaction
                </a>
              </div>
            )}

            {/* Swap Button */}
            <button
              onClick={handleTokenSwap}
              disabled={isSwapping || !monAmount}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:scale-100"
            >
              {isSwapping ? 'Swapping...' : 'Swap MON → TOURS'}
            </button>

            {/* Info */}
            <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-blue-200 text-sm">
                <strong>Gasless:</strong> This swap is processed by our server, so you don't pay any gas fees!
              </p>
            </div>
          </div>
        )}

        {/* AMM Interface (TOURS ⇄ WMON) */}
        {swapType === 'amm' && (
          <>
            {/* Price Info */}
            {reserves && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-purple-200 text-sm mb-1">Pool Price</div>
                    <div className="text-white font-bold">{priceDisplay}</div>
                  </div>
                  <div>
                    <div className="text-purple-200 text-sm mb-1">TOURS Reserve</div>
                    <div className="text-white font-bold">
                      {formatEther((reserves as any)[0] || BigInt(0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-purple-200 text-sm mb-1">WMON Reserve</div>
                    <div className="text-white font-bold">
                      {formatEther((reserves as any)[1] || BigInt(0))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Swap Interface */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          {/* From Token */}
          <div className="mb-4">
            <div className="flex justify-between mb-2">
              <label className="text-white font-semibold">From</label>
              <div className="text-purple-200 text-sm">
                Balance: {swapDirection === 'tours-to-wmon'
                  ? formatEther(toursBalance || BigInt(0))
                  : formatEther(wmonBalance || BigInt(0))}
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-4 flex items-center gap-4">
              <input
                type="number"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-white text-2xl outline-none"
              />
              <div className="bg-purple-600 px-4 py-2 rounded-lg">
                <span className="text-white font-bold">
                  {swapDirection === 'tours-to-wmon' ? 'TOURS' : 'WMON'}
                </span>
              </div>
            </div>
          </div>

          {/* Switch Button */}
          <div className="flex justify-center my-4">
            <button
              onClick={switchDirection}
              className="bg-white/20 hover:bg-white/30 text-white p-3 rounded-full transition-all transform hover:rotate-180 duration-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Token */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <label className="text-white font-semibold">To (estimated)</label>
              <div className="text-purple-200 text-sm">
                Balance: {swapDirection === 'tours-to-wmon'
                  ? formatEther(wmonBalance || BigInt(0))
                  : formatEther(toursBalance || BigInt(0))}
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-4 flex items-center gap-4">
              <input
                type="text"
                value={outputAmount}
                readOnly
                placeholder="0.0"
                className="flex-1 bg-transparent text-white text-2xl outline-none"
              />
              <div className="bg-pink-600 px-4 py-2 rounded-lg">
                <span className="text-white font-bold">
                  {swapDirection === 'tours-to-wmon' ? 'WMON' : 'TOURS'}
                </span>
              </div>
            </div>
          </div>

          {/* Slippage Settings */}
          <div className="mb-6">
            <label className="text-white font-semibold mb-2 block">
              Slippage Tolerance: {slippage}%
            </label>
            <div className="flex gap-2">
              {['0.1', '0.5', '1.0'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
                    slippage === s
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
            <div className="mt-2 text-purple-200 text-sm">
              Minimum received: {minOutput} {swapDirection === 'tours-to-wmon' ? 'WMON' : 'TOURS'}
            </div>
          </div>

          {/* Error Display */}
          {writeError && (
            <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-200">Error: {writeError.message}</p>
            </div>
          )}

          {/* Success Display */}
          {isConfirmed && (
            <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-lg p-4">
              <p className="text-green-200">Swap completed successfully!</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleApprove}
              disabled={isPending || isConfirming || !inputAmount}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:scale-100"
            >
              {isPending || isConfirming
                ? 'Approving...'
                : `Approve ${swapDirection === 'tours-to-wmon' ? 'TOURS' : 'WMON'}`}
            </button>

            <button
              onClick={handleSwap}
              disabled={isPending || isConfirming || !inputAmount}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:scale-100"
            >
              {isPending || isConfirming
                ? 'Swapping...'
                : `Swap ${swapDirection === 'tours-to-wmon' ? 'TOURS → WMON' : 'WMON → TOURS'}`}
            </button>
          </div>
        </div>

            {/* Wrap/Unwrap Section */}
            <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Wrap / Unwrap MON</h2>
              <p className="text-purple-200 mb-6">
                Wrap your MON into WMON to trade, or unwrap WMON back to MON
              </p>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Wrap MON */}
                <div className="space-y-3">
                  <label className="text-white font-semibold block">Wrap MON → WMON</label>
                  <div className="bg-black/30 rounded-xl p-4">
                    <input
                      type="number"
                      value={wrapAmount}
                      onChange={(e) => setWrapAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-transparent text-white text-xl outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (wrapAmount && parseFloat(wrapAmount) > 0) {
                        wrapMON(wrapAmount);
                        setWrapAmount('');
                      }
                    }}
                    disabled={!wrapAmount || parseFloat(wrapAmount) <= 0 || isPending || isConfirming}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    {isPending || isConfirming ? 'Wrapping...' : 'Wrap MON'}
                  </button>
                </div>

                {/* Unwrap WMON */}
                <div className="space-y-3">
                  <label className="text-white font-semibold block">Unwrap WMON → MON</label>
                  <div className="bg-black/30 rounded-xl p-4">
                    <input
                      type="number"
                      value={unwrapAmount}
                      onChange={(e) => setUnwrapAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-transparent text-white text-xl outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (unwrapAmount && parseFloat(unwrapAmount) > 0) {
                        unwrapWMON(unwrapAmount);
                        setUnwrapAmount('');
                      }
                    }}
                    disabled={!unwrapAmount || parseFloat(unwrapAmount) <= 0 || isPending || isConfirming}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    {isPending || isConfirming ? 'Unwrapping...' : 'Unwrap WMON'}
                  </button>
                </div>
              </div>
            </div>

            {/* How it Works */}
            <div className="mt-8 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
              <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-4xl mb-3">💱</div>
                  <h3 className="text-white font-semibold mb-2">1. Choose Direction</h3>
                  <p className="text-purple-200 text-sm">
                    Swap TOURS for WMON or vice versa
                  </p>
                </div>
                <div>
                  <div className="text-4xl mb-3">⚡</div>
                  <h3 className="text-white font-semibold mb-2">2. Instant Swap</h3>
                  <p className="text-purple-200 text-sm">
                    Automated market maker provides instant liquidity
                  </p>
                </div>
                <div>
                  <div className="text-4xl mb-3">💰</div>
                  <h3 className="text-white font-semibold mb-2">3. Unwrap MON</h3>
                  <p className="text-purple-200 text-sm">
                    Convert WMON back to native MON anytime
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
