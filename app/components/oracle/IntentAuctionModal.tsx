'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ArrowRightLeft, Zap, Activity, ExternalLink, ChevronDown } from 'lucide-react';
import { encodeFunctionData, parseEther } from 'viem';
import { useWalletContext } from '@/app/hooks/useWalletContext';

const AUCTION_CONTRACT = '0x0992f5E8a2d9709d7897F413Ef294c47a18D029e' as const;
const EXPLORER = 'https://monadscan.com';
const DEST_CHAIN = 143;

const TOKENS = {
  USDC:  { address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as `0x${string}`, decimals: 6  },
  USDT0: { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D' as `0x${string}`, decimals: 6  },
  WETH:  { address: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242' as `0x${string}`, decimals: 18 },
  WBTC:  { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c' as `0x${string}`, decimals: 8  },
  WMON:  { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as `0x${string}`, decimals: 18 },
} as const;

type TokenKey = keyof typeof TOKENS;

const AUCTION_ABI = [{
  name: 'postIntent',
  type: 'function' as const,
  inputs: [
    { name: 'tokenIn',   type: 'address' },
    { name: 'tokenOut',  type: 'address' },
    { name: 'destChain', type: 'uint32'  },
    { name: 'minOut',    type: 'uint256' },
    { name: 'amountIn',  type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'payable' as const,
}];

interface RecentIntent {
  intentId: string;
  user: string;
  bidCount: number;
  executed: boolean;
}

interface IntentAuctionModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export function IntentAuctionModal({ isOpen, onClose }: IntentAuctionModalProps) {
  const { walletAddress, sendTransaction, switchChain } = useWalletContext();
  const [mounted, setMounted] = useState(false);

  // Form state
  const [amount, setAmount]   = useState('');
  const [tokenOut, setTokenOut] = useState<TokenKey>('USDC');

  // Tx state
  const [posting, setPosting] = useState(false);
  const [txHash, setTxHash]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  // Live activity — polled from /api/auction/live (no ws:// Mixed Content issues)
  const [liveIntents, setLiveIntents]     = useState<RecentIntent[]>([]);
  const [liveLoading, setLiveLoading]     = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Poll /api/auction/live while modal is open
  useEffect(() => {
    if (!isOpen) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const fetchLive = async () => {
      try {
        setLiveLoading(true);
        const res = await fetch('/api/auction/live');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.intents)) setLiveIntents(data.intents);
        }
      } catch {}
      finally { setLiveLoading(false); }
    };

    fetchLive();
    pollRef.current = setInterval(fetchLive, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen]);

  const handlePost = async () => {
    if (!walletAddress)                  { setError('Connect your wallet first'); return; }
    if (!amount || Number(amount) <= 0)  { setError('Enter a MON amount'); return; }

    setPosting(true);
    setError(null);
    setTxHash(null);

    try {
      await switchChain({ chainId: 143 });

      const amountWei = parseEther(amount);
      const data = encodeFunctionData({
        abi:          AUCTION_ABI,
        functionName: 'postIntent',
        args: [
          '0x0000000000000000000000000000000000000000',
          TOKENS[tokenOut].address,
          DEST_CHAIN,
          0n,
          amountWei,
        ],
      });

      const result = await sendTransaction({
        to:    AUCTION_CONTRACT,
        data,
        value: amountWei.toString(),
      });

      const hash = result?.transactionHash ?? result?.hash ?? result;
      if (typeof hash === 'string') setTxHash(hash);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message?.slice(0, 120) ?? 'Transaction failed');
    } finally {
      setPosting(false);
    }
  };

  if (!mounted || !isOpen) return null;

  const tokenKeys = Object.keys(TOKENS) as TokenKey[];

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 10004, backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[#080810] border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 flex items-center justify-center flex-shrink-0">
              <ArrowRightLeft className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Intent Swap</h2>
              <p className="text-xs text-gray-500">AI agents compete for your swap</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {liveIntents.length > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-green-400 border-green-500/30 bg-green-500/10">
                <Activity className="w-2.5 h-2.5" />
                Live
              </span>
            )}
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* You Pay */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">You Pay</div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                min="0"
                step="any"
                className="flex-1 bg-transparent text-2xl font-light text-white placeholder-gray-700 focus:outline-none"
              />
              <div className="flex items-center gap-2 bg-gray-800/80 border border-gray-700 rounded-xl px-3 py-2 flex-shrink-0">
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                <span className="text-white text-sm font-medium">MON</span>
              </div>
            </div>
          </div>

          {/* You Receive */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">You Receive</div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-sm text-gray-500">Best rate from competing agents</div>
              <div className="relative flex-shrink-0">
                <select
                  value={tokenOut}
                  onChange={(e) => setTokenOut(e.target.value as TokenKey)}
                  className="appearance-none bg-gray-800/80 border border-gray-700 rounded-xl pl-3 pr-7 py-2 text-white text-sm font-medium focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  {tokenKeys.map(sym => (
                    <option key={sym} value={sym}>{sym}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-cyan-400 text-xs font-semibold uppercase tracking-wider">How it works</span>
            </div>
            <div className="space-y-1.5 text-xs text-gray-500">
              <div className="flex gap-2"><span className="text-cyan-600 font-mono">1</span><span>Post intent — MON locked in auction contract, 0.30% protocol fee</span></div>
              <div className="flex gap-2"><span className="text-cyan-600 font-mono">2</span><span>Claude-powered agents compete and bid the best rate</span></div>
              <div className="flex gap-2"><span className="text-cyan-600 font-mono">3</span><span>Winning agent executes the swap, delivers {tokenOut} directly to you</span></div>
              <div className="flex gap-2"><span className="text-cyan-600 font-mono">4</span><span>Full refund if no bids — zero counterparty risk</span></div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Success */}
          {txHash && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <div className="text-green-400 text-sm font-medium mb-1">Intent posted! Agents are bidding...</div>
              <a
                href={`${EXPLORER}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View on MonadScan
              </a>
            </div>
          )}

          {/* Post Button */}
          <button
            onClick={handlePost}
            disabled={posting || !walletAddress || !amount || Number(amount) <= 0}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              posting || !walletAddress || !amount || Number(amount) <= 0
                ? 'bg-gray-800/80 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white shadow-lg shadow-cyan-500/20'
            }`}
          >
            {posting && <Loader2 className="w-4 h-4 animate-spin" />}
            {!walletAddress ? 'Connect Wallet'
              : posting ? 'Posting...'
              : amount && Number(amount) > 0 ? `Swap ${amount} MON → ${tokenOut}`
              : 'Enter Amount'}
          </button>

          {/* Live Activity (polled via API, no ws:// Mixed Content issues) */}
          {liveIntents.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Live Activity</div>
              <div className="space-y-2">
                {liveIntents.slice(0, 5).map((intent) => (
                  <div
                    key={intent.intentId}
                    className={`rounded-xl p-3 border text-xs ${
                      intent.executed ? 'bg-green-500/5 border-green-500/20' : 'bg-gray-900/60 border-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">
                        Intent #{intent.intentId}
                        {' '}<span className="font-mono text-gray-700">{intent.user.slice(0, 6)}...{intent.user.slice(-4)}</span>
                      </span>
                      <span className={intent.executed ? 'text-green-400' : 'text-purple-400'}>
                        {intent.executed ? 'Filled' : `${intent.bidCount} bid${intent.bidCount !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contract Link */}
          <div className="text-center pt-1">
            <a
              href={`${EXPLORER}/address/${AUCTION_CONTRACT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-500 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              {AUCTION_CONTRACT.slice(0, 10)}...{AUCTION_CONTRACT.slice(-8)} on MonadScan
            </a>
          </div>

        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
