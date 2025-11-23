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

  // Balance state
  const [balances, setBalances] = useState({ mon: '0', tours: '0' });

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
  const { data: wmonBalance} = useGetWMONBalance(effectiveAddress);
  const { data: reserves } = useGetReserves();
  const { data: price } = useGetPrice();

  // Load MON and TOURS balances from API
  useEffect(() => {
    const loadBalances = async () => {
      if (!effectiveAddress) return;

      try {
        const response = await fetch('/api/get-balances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: effectiveAddress }),
        });

        if (response.ok) {
          const data = await response.json();
          setBalances(data);
        }
      } catch (error) {
        console.error('Error loading balances:', error);
      }
    };

    loadBalances();
  }, [effectiveAddress]);

  // Get quote based on direction (only when valid amount is entered)
  const validInputAmount = inputAmount && parseFloat(inputAmount) > 0 ? inputAmount : '';
  const { data: quote, error: quoteError } = swapDirection === 'tours-to-wmon'
    ? useGetToursToWMONQuote(validInputAmount)
    : useGetWMONToToursQuote(validInputAmount);

  const outputAmount = quote ? formatEther(quote as bigint) : '0';
  const minOutput = outputAmount && parseFloat(outputAmount) > 0 ? (parseFloat(outputAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6) : '0';

  // Check if pool has liquidity
  const toursReserve = reserves ? BigInt((reserves as any)[0] || 0) : BigInt(0);
  const wmonReserve = reserves ? BigInt((reserves as any)[1] || 0) : BigInt(0);
  const poolHasLiquidity = toursReserve > BigInt(0) && wmonReserve > BigInt(0);

  // Log for debugging
  useEffect(() => {
    if (validInputAmount) {
      console.log('Swap Debug:', {
        inputAmount: validInputAmount,
        direction: swapDirection,
        quote: quote?.toString(),
        outputAmount,
        toursReserve: toursReserve.toString(),
        wmonReserve: wmonReserve.toString(),
        poolHasLiquidity,
        quoteError: quoteError?.message
      });
    }
  }, [validInputAmount, quote, swapDirection, toursReserve, wmonReserve, poolHasLiquidity, quoteError]);

  // AMM swap state for delegation
  const [ammSwapping, setAmmSwapping] = useState(false);
  const [ammSwapError, setAmmSwapError] = useState<string | null>(null);
  const [ammSwapSuccess, setAmmSwapSuccess] = useState<string | null>(null);
  const [ammSwapTxHash, setAmmSwapTxHash] = useState<string | null>(null);

  // Wrap/Unwrap state for delegation
  const [wrapUnwrapLoading, setWrapUnwrapLoading] = useState(false);
  const [wrapUnwrapError, setWrapUnwrapError] = useState<string | null>(null);
  const [wrapUnwrapSuccess, setWrapUnwrapSuccess] = useState<string | null>(null);
  const [wrapUnwrapTxHash, setWrapUnwrapTxHash] = useState<string | null>(null);

  const handleSwap = async () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      setAmmSwapError('Please enter a valid amount');
      return;
    }

    if (!effectiveAddress) {
      setAmmSwapError('Wallet not connected');
      return;
    }

    setAmmSwapping(true);
    setAmmSwapError(null);
    setAmmSwapSuccess(null);
    setAmmSwapTxHash(null);

    try {
      // Check for delegation with swap permissions
      const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
      const delegationData = await delegationRes.json();

      const requiredPermission = swapDirection === 'tours-to-wmon' ? 'swap_tours_for_wmon' : 'swap_wmon_for_tours';
      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes(requiredPermission);

      if (!hasValidDelegation) {
        setAmmSwapSuccess('⏳ Setting up gasless transactions...');

        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: effectiveAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours', 'swap_tours_for_wmon', 'swap_wmon_for_tours']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      setAmmSwapSuccess(`⏳ Swapping ${inputAmount} ${swapDirection === 'tours-to-wmon' ? 'TOURS' : 'WMON'} (FREE - we pay gas)...`);

      const action = swapDirection === 'tours-to-wmon' ? 'swap_tours_for_wmon' : 'swap_wmon_for_tours';
      const params = swapDirection === 'tours-to-wmon'
        ? { toursAmount: inputAmount, minWMONOut: minOutput }
        : { wmonAmount: inputAmount, minToursOut: minOutput };

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action,
          params
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Swap failed');
      }

      const { txHash } = await response.json();

      setAmmSwapSuccess(`🎉 Successfully swapped ${inputAmount} ${swapDirection === 'tours-to-wmon' ? 'TOURS → WMON' : 'WMON → TOURS'}!`);
      setAmmSwapTxHash(txHash);
      setInputAmount('');

      // Refresh balances after delay (longer delay for blockchain to update)
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch (err: any) {
      console.error('AMM Swap error:', err);
      setAmmSwapError(err.message || 'Failed to swap');
    } finally {
      setAmmSwapping(false);
    }
  };

  const handleApprove = () => {
    // No longer needed - delegation handles approvals automatically
    setAmmSwapSuccess('✅ No approval needed! Delegation handles everything for you. Click "Swap" to execute.');
  };

  const handleWrapUnwrap = async (action: 'wrap_mon' | 'unwrap_wmon', amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setWrapUnwrapError('Please enter a valid amount');
      return;
    }

    if (!effectiveAddress) {
      setWrapUnwrapError('Wallet not connected');
      return;
    }

    setWrapUnwrapLoading(true);
    setWrapUnwrapError(null);
    setWrapUnwrapSuccess(null);
    setWrapUnwrapTxHash(null);

    try {
      // Check for delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes(action);

      if (!hasValidDelegation) {
        setWrapUnwrapSuccess('⏳ Setting up gasless transactions...');

        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: effectiveAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours', 'swap_tours_for_wmon', 'swap_wmon_for_tours', 'wrap_mon', 'unwrap_wmon']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      const actionName = action === 'wrap_mon' ? 'Wrapping MON' : 'Unwrapping WMON';
      setWrapUnwrapSuccess(`⏳ ${actionName} (FREE - we pay gas)...`);

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action,
          params: { amount }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `${actionName} failed`);
      }

      const { txHash } = await response.json();

      setWrapUnwrapSuccess(`🎉 Successfully ${action === 'wrap_mon' ? 'wrapped MON to WMON' : 'unwrapped WMON to MON'}!`);
      setWrapUnwrapTxHash(txHash);

      if (action === 'wrap_mon') {
        setWrapAmount('');
      } else {
        setUnwrapAmount('');
      }

      // Refresh balances after delay (longer delay for blockchain to update)
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch (err: any) {
      console.error('Wrap/Unwrap error:', err);
      setWrapUnwrapError(err.message || 'Failed to wrap/unwrap');
    } finally {
      setWrapUnwrapLoading(false);
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

        {/* Wallet Connection Status */}
        {effectiveAddress && (
          <div className="mb-6 p-4 bg-green-500/20 backdrop-blur-lg border border-green-500/50 rounded-xl">
            <p className="text-green-200 text-sm font-medium">✅ Wallet Connected</p>
            <p className="text-green-100 text-xs mt-1 font-mono">
              {effectiveAddress.slice(0, 10)}...{effectiveAddress.slice(-8)}
            </p>
          </div>
        )}

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-lg border border-yellow-500/30 rounded-xl p-5">
            <p className="text-yellow-200 text-xs font-medium mb-2">MON Balance</p>
            <p className="text-3xl font-bold text-yellow-100">{balances.mon}</p>
            {/* Wallet/Safe breakdown */}
            {(balances as any).monWallet && (
              <div className="mt-2 pt-2 border-t border-yellow-500/30 text-xs">
                <div className="flex justify-between text-yellow-200">
                  <span>Wallet:</span>
                  <span className="font-mono">{(balances as any).monWallet}</span>
                </div>
                <div className="flex justify-between text-yellow-200">
                  <span>Safe:</span>
                  <span className="font-mono">{(balances as any).monSafe}</span>
                </div>
              </div>
            )}
          </div>
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-lg border border-green-500/30 rounded-xl p-5">
            <p className="text-green-200 text-xs font-medium mb-2">TOURS Balance</p>
            <p className="text-3xl font-bold text-green-100">{balances.tours}</p>
            {/* Wallet/Safe breakdown for TOURS */}
            {(balances as any).breakdown?.tours && (
              <div className="mt-2 pt-2 border-t border-green-500/30 text-xs">
                <div className="flex justify-between text-green-200">
                  <span>Wallet:</span>
                  <span className="font-mono">{(balances as any).breakdown.tours.user}</span>
                </div>
                <div className="flex justify-between text-green-200">
                  <span>Safe:</span>
                  <span className="font-mono">{(balances as any).breakdown.tours.safe}</span>
                </div>
              </div>
            )}
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-lg border border-blue-500/30 rounded-xl p-5">
            <p className="text-blue-200 text-xs font-medium mb-2">WMON Balance</p>
            <p className="text-3xl font-bold text-blue-100">{balances.wmon || '0'}</p>
          </div>
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
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <label className="text-white font-semibold">MON Amount</label>
                <div className="text-purple-200 text-sm">Available: {balances.mon} MON | Max: 10 MON</div>
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

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              {['0.1', '0.5', '1', '5'].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setMonAmount(amt)}
                  disabled={isSwapping}
                  className="px-3 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {amt}
                </button>
              ))}
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

            {/* How It Works */}
            <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-5">
              <h3 className="font-bold text-white mb-3 text-lg">💡 How It Works:</h3>
              <ul className="text-sm text-blue-100 space-y-2">
                <li>✅ <strong>Gasless:</strong> We pay all transaction fees for you</li>
                <li>✅ <strong>Instant:</strong> Swap completes in seconds</li>
                <li>✅ <strong>Safe:</strong> Uses delegation via our bot</li>
                <li>💰 <strong>Rate:</strong> 1 MON = 1 TOURS (fair exchange)</li>
                <li>⏱️ <strong>Balance Update:</strong> May take 5-10 seconds to reflect</li>
              </ul>
            </div>

            {/* Refresh Balances Button */}
            <div className="mt-4">
              <button
                onClick={async () => {
                  if (!effectiveAddress) return;
                  try {
                    const response = await fetch('/api/get-balances', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ address: effectiveAddress }),
                    });
                    if (response.ok) {
                      const data = await response.json();
                      setBalances(data);
                    }
                  } catch (error) {
                    console.error('Error refreshing balances:', error);
                  }
                }}
                className="w-full px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 text-sm font-medium transition-all"
              >
                🔄 Refresh Balances
              </button>
            </div>
          </div>
        )}

        {/* AMM Interface (TOURS ⇄ WMON) */}
        {swapType === 'amm' && (
          <>
            {/* No Liquidity Warning */}
            {!poolHasLiquidity && (
              <div className="bg-yellow-500/20 backdrop-blur-lg rounded-2xl p-6 mb-6 border-2 border-yellow-500/50">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">⚠️</div>
                  <div>
                    <h3 className="text-yellow-200 font-bold text-lg mb-2">AMM Pool Empty</h3>
                    <p className="text-yellow-100 text-sm mb-3">
                      The TOURS/WMON pool currently has no liquidity. Swaps will return 0 until liquidity is added.
                    </p>
                    <div className="bg-yellow-900/30 rounded-lg p-3 text-xs text-yellow-100">
                      <strong>Current Reserves:</strong>
                      <br />TOURS: {formatEther(toursReserve)} | WMON: {formatEther(wmonReserve)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Price Info */}
            {reserves && poolHasLiquidity && (
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
                  ? (balances.tours || '0')
                  : (balances.wmon || '0')}
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
                  ? (balances.wmon || '0')
                  : (balances.tours || '0')}
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
          {ammSwapError && (
            <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-200">❌ {ammSwapError}</p>
            </div>
          )}

          {/* Success Display */}
          {ammSwapSuccess && (
            <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-lg p-4">
              <p className="text-green-200">{ammSwapSuccess}</p>
              {ammSwapTxHash && (
                <div className="mt-2 text-xs">
                  <a
                    href={`https://testnet.monadscan.com/tx/${ammSwapTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-300 hover:text-green-100 underline"
                  >
                    View on Monadscan →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Gasless Swap Button */}
          <div className="space-y-3">
            <button
              onClick={handleSwap}
              disabled={ammSwapping || !inputAmount}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:scale-100"
            >
              {ammSwapping
                ? '⏳ Swapping (Gasless)...'
                : `🚀 Swap ${swapDirection === 'tours-to-wmon' ? 'TOURS → WMON' : 'WMON → TOURS'} (FREE)`}
            </button>
            <p className="text-xs text-purple-200 text-center">
              ✅ No gas fees! We pay for your transaction via delegation
            </p>
          </div>
        </div>

            {/* Wrap/Unwrap Section */}
            <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">🎁 Wrap / Unwrap MON (Gasless)</h2>
              <p className="text-purple-200 mb-6">
                Wrap your MON into WMON to trade, or unwrap WMON back to MON - completely FREE!
              </p>

              {/* Error/Success Messages */}
              {wrapUnwrapError && (
                <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                  <p className="text-red-200">❌ {wrapUnwrapError}</p>
                </div>
              )}

              {wrapUnwrapSuccess && (
                <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                  <p className="text-green-200">{wrapUnwrapSuccess}</p>
                  {wrapUnwrapTxHash && (
                    <div className="mt-2 text-xs">
                      <a
                        href={`https://testnet.monadscan.com/tx/${wrapUnwrapTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-300 hover:text-green-100 underline"
                      >
                        View on Monadscan →
                      </a>
                    </div>
                  )}
                </div>
              )}

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
                    onClick={() => handleWrapUnwrap('wrap_mon', wrapAmount)}
                    disabled={!wrapAmount || parseFloat(wrapAmount) <= 0 || wrapUnwrapLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    {wrapUnwrapLoading ? '⏳ Wrapping (Gasless)...' : '🚀 Wrap MON (FREE)'}
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
                    onClick={() => handleWrapUnwrap('unwrap_wmon', unwrapAmount)}
                    disabled={!unwrapAmount || parseFloat(unwrapAmount) <= 0 || wrapUnwrapLoading}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    {wrapUnwrapLoading ? '⏳ Unwrapping (Gasless)...' : '🚀 Unwrap WMON (FREE)'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-purple-200 text-center mt-4">
                ✅ No gas fees! We pay for your transactions via delegation
              </p>
            </div>

            {/* Complete Trading Flow */}
            <div className="mt-8 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
              <h2 className="text-2xl font-bold text-white mb-6">💡 Complete Trading Flow</h2>

              {/* All Available Operations */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h3 className="text-blue-200 font-bold mb-2">🔄 Wrap/Unwrap</h3>
                  <ul className="text-sm text-blue-100 space-y-1">
                    <li>✅ MON → WMON (Wrap)</li>
                    <li>✅ WMON → MON (Unwrap)</li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="text-purple-200 font-bold mb-2">💱 AMM Swaps</h3>
                  <ul className="text-sm text-purple-100 space-y-1">
                    <li>✅ TOURS → WMON</li>
                    <li>✅ WMON → TOURS</li>
                  </ul>
                </div>
              </div>

              {/* Complete Flow Examples */}
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg p-5">
                <h3 className="text-green-200 font-bold mb-3">🎯 Example Flows:</h3>
                <div className="space-y-3 text-sm text-green-100">
                  <div>
                    <strong>TOURS → MON:</strong> TOURS → WMON (AMM) → MON (Unwrap)
                  </div>
                  <div>
                    <strong>MON → TOURS:</strong> MON → WMON (Wrap) → TOURS (AMM)
                  </div>
                  <div className="pt-2 border-t border-green-500/30 text-xs">
                    💡 All transactions are <strong>gasless</strong> - we pay for your gas fees!
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
