'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, TrendingUp, TrendingDown, Activity, ExternalLink, ArrowLeft, ChevronDown, Shield, Zap, BarChart3 } from 'lucide-react';
import { useWalletContext } from '@/app/hooks/useWalletContext';

const EXPLORER = 'https://monadscan.com';

interface VaultInfo {
  agentId: number;
  name: string;
  style: string;
  emoji: string;
  wallet: string;
  status: string;
  tvl: string;
  navPerShare: string;
  totalShares: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: string;
  cumulativePnL: string;
  volume: string;
}

interface VaultStatusResponse {
  contract: string;
  paused: boolean;
  totalTVL: string;
  vaults: VaultInfo[];
  timestamp: number;
}

interface HistoryEntry {
  type: string;
  action?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  amountOut?: string;
  user?: string;
  amount?: string;
  sharesMinted?: string;
  sharesBurned?: string;
  performanceFee?: string;
  blockNumber: number;
  txHash: string;
}

interface AgentVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export function AgentVaultModal({ isOpen, onClose }: AgentVaultModalProps) {
  const { walletAddress } = useWalletContext();
  const [mounted, setMounted] = useState(false);

  // Data state
  const [vaultData, setVaultData] = useState<VaultStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // View state
  const [selectedVault, setSelectedVault] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form state
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Poll vault status
  useEffect(() => {
    if (!isOpen) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const fetchStatus = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/vaults/status');
        if (res.ok) {
          const data = await res.json();
          setVaultData(data);
        }
      } catch {}
      finally { setLoading(false); }
    };

    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen]);

  // Fetch history when vault selected
  useEffect(() => {
    if (selectedVault === null) return;

    const fetchHistory = async () => {
      try {
        setHistoryLoading(true);
        const res = await fetch(`/api/vaults/history?agentId=${selectedVault}`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history || []);
        }
      } catch {}
      finally { setHistoryLoading(false); }
    };

    fetchHistory();
  }, [selectedVault]);

  const handleDeposit = useCallback(async () => {
    if (!walletAddress || !depositAmount || selectedVault === null) return;
    setTxLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'vault_deposit',
          params: { agentId: selectedVault, amount: depositAmount },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Deposit failed');
      setTxHash(data.txHash);
      setDepositAmount('');
    } catch (e: any) {
      setError(e?.message?.slice(0, 160) ?? 'Deposit failed');
    } finally {
      setTxLoading(false);
    }
  }, [walletAddress, depositAmount, selectedVault]);

  const handleWithdraw = useCallback(async () => {
    if (!walletAddress || !withdrawShares || selectedVault === null) return;
    setTxLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'vault_withdraw',
          params: { agentId: selectedVault, shares: withdrawShares },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Withdraw failed');
      setTxHash(data.txHash);
      setWithdrawShares('');
    } catch (e: any) {
      setError(e?.message?.slice(0, 160) ?? 'Withdraw failed');
    } finally {
      setTxLoading(false);
    }
  }, [walletAddress, withdrawShares, selectedVault]);

  const handleEmergencyWithdraw = useCallback(async () => {
    if (!walletAddress || selectedVault === null) return;
    setTxLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'vault_emergency_withdraw',
          params: { agentId: selectedVault },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Emergency withdraw failed');
      setTxHash(data.txHash);
    } catch (e: any) {
      setError(e?.message?.slice(0, 160) ?? 'Emergency withdraw failed');
    } finally {
      setTxLoading(false);
    }
  }, [walletAddress, selectedVault]);

  if (!mounted || !isOpen) return null;

  const vaults = vaultData?.vaults || [];
  const contract = vaultData?.contract || '';
  const selected = selectedVault !== null ? vaults.find(v => v.agentId === selectedVault) : null;

  // Sort vaults by TVL descending for leaderboard
  const sortedVaults = [...vaults].sort((a, b) => parseFloat(b.tvl) - parseFloat(a.tvl));

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 10004, backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[#080810] border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            {selectedVault !== null && (
              <button
                onClick={() => { setSelectedVault(null); setError(null); setTxHash(null); }}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-400" />
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {selected ? selected.name : 'AI Agent Vaults'}
              </h2>
              <p className="text-xs text-gray-500">
                {selected
                  ? `${selected.style} strategy`
                  : `${vaults.length} agents | ${parseFloat(vaultData?.totalTVL || '0').toFixed(2)} WMON TVL`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {vaultData && !vaultData.paused && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-green-400 border-green-500/30 bg-green-500/10">
                <Activity className="w-2.5 h-2.5" />
                Live
              </span>
            )}
            {vaultData?.paused && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-yellow-400 border-yellow-500/30 bg-yellow-500/10">
                Paused
              </span>
            )}
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Loading State */}
          {loading && vaults.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
            </div>
          )}

          {/* ── LEADERBOARD VIEW ── */}
          {selectedVault === null && vaults.length > 0 && (
            <>
              {/* Total TVL Banner */}
              <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Value Locked</div>
                <div className="text-2xl font-bold text-white">{parseFloat(vaultData?.totalTVL || '0').toFixed(4)} WMON</div>
              </div>

              {/* Agent Rows */}
              <div className="space-y-2">
                {sortedVaults.map((vault, rank) => (
                  <button
                    key={vault.agentId}
                    onClick={() => setSelectedVault(vault.agentId)}
                    className="w-full bg-gray-900/60 border border-gray-800 hover:border-cyan-500/30 rounded-xl p-3 transition-all hover:bg-gray-900/80 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-mono text-gray-600 w-6 text-center">{rank + 1}</div>
                      <div className="text-xl flex-shrink-0">{vault.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{vault.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            vault.status === 'Active'
                              ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                              : vault.status === 'Dormant'
                              ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20'
                              : 'text-gray-500 bg-gray-500/10 border border-gray-500/20'
                          }`}>{vault.status}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>{parseFloat(vault.tvl).toFixed(2)} WMON</span>
                          <span>{vault.tradeCount} trades</span>
                          <span>{vault.winRate}% win</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-medium ${
                          parseFloat(vault.navPerShare) >= 1e18 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {(parseFloat(vault.navPerShare) / 1e18 * 100 - 100).toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-gray-600">NAV/share</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* How it works */}
              <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-400 text-xs font-semibold uppercase tracking-wider">How AI Vaults work</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex gap-2"><span className="text-cyan-600 font-mono">1</span><span>Deposit WMON into any agent's vault</span></div>
                  <div className="flex gap-2"><span className="text-cyan-600 font-mono">2</span><span>Claude-powered AI agents trade autonomously via DEX</span></div>
                  <div className="flex gap-2"><span className="text-cyan-600 font-mono">3</span><span>Earn returns — 20% performance fee only on profits</span></div>
                  <div className="flex gap-2"><span className="text-cyan-600 font-mono">4</span><span>Withdraw anytime — emergency exit always available</span></div>
                </div>
              </div>
            </>
          )}

          {/* ── AGENT DETAIL VIEW ── */}
          {selected && (
            <>
              {/* Key Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-gray-500 uppercase mb-1">TVL</div>
                  <div className="text-sm font-bold text-white">{parseFloat(selected.tvl).toFixed(4)}</div>
                  <div className="text-[10px] text-gray-600">WMON</div>
                </div>
                <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Trades</div>
                  <div className="text-sm font-bold text-white">{selected.tradeCount}</div>
                  <div className="text-[10px] text-gray-600">{selected.winRate}% win</div>
                </div>
                <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Volume</div>
                  <div className="text-sm font-bold text-white">{parseFloat(selected.volume).toFixed(2)}</div>
                  <div className="text-[10px] text-gray-600">WMON</div>
                </div>
              </div>

              {/* NAV/Share */}
              <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">NAV per Share</span>
                <span className="text-sm font-bold text-white">
                  {parseFloat(selected.navPerShare).toFixed(6)} WMON
                </span>
              </div>

              {/* Deposit Form */}
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Deposit WMON</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.0"
                    min="0"
                    step="any"
                    className="flex-1 bg-transparent text-lg font-light text-white placeholder-gray-700 focus:outline-none"
                  />
                  <button
                    onClick={handleDeposit}
                    disabled={txLoading || !walletAddress || !depositAmount || Number(depositAmount) <= 0}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      txLoading || !walletAddress || !depositAmount || Number(depositAmount) <= 0
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white'
                    }`}
                  >
                    {txLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Deposit'}
                  </button>
                </div>
              </div>

              {/* Withdraw Form */}
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Withdraw (shares)</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={withdrawShares}
                    onChange={(e) => setWithdrawShares(e.target.value)}
                    placeholder="0.0"
                    min="0"
                    step="any"
                    className="flex-1 bg-transparent text-lg font-light text-white placeholder-gray-700 focus:outline-none"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={txLoading || !walletAddress || !withdrawShares || Number(withdrawShares) <= 0}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      txLoading || !walletAddress || !withdrawShares || Number(withdrawShares) <= 0
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white'
                    }`}
                  >
                    {txLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Withdraw'}
                  </button>
                </div>
              </div>

              {/* Emergency Withdraw (only for non-active agents) */}
              {selected.status !== 'Active' && (
                <button
                  onClick={handleEmergencyWithdraw}
                  disabled={txLoading || !walletAddress}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-all bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                >
                  {txLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                  Emergency Withdraw (No Performance Fee)
                </button>
              )}

              {/* UserSafe note */}
              <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-xl p-3 flex items-start gap-2">
                <span className="text-yellow-500 text-sm flex-shrink-0">&#9889;</span>
                <p className="text-xs text-yellow-500/80">
                  WMON is sent from your <span className="text-yellow-400 font-medium">User Safe</span>.
                  Deposit MON and wrap to WMON before depositing into vaults.
                </p>
              </div>

              {/* Error / Success */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              {txHash && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                  <div className="text-green-400 text-sm font-medium mb-1">Transaction submitted!</div>
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

              {/* Trade History */}
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Recent Activity</div>
                {historyLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-xs text-gray-600 text-center py-4">No recent activity</div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {history.map((entry, i) => (
                      <div
                        key={i}
                        className="bg-gray-900/60 border border-gray-800 rounded-lg p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {entry.type === 'trade' && entry.action === 'BUY' && (
                              <TrendingUp className="w-3 h-3 text-green-400" />
                            )}
                            {entry.type === 'trade' && entry.action === 'SELL' && (
                              <TrendingDown className="w-3 h-3 text-red-400" />
                            )}
                            {entry.type === 'deposit' && (
                              <span className="text-cyan-400 text-[10px]">+</span>
                            )}
                            {entry.type === 'withdrawal' && (
                              <span className="text-purple-400 text-[10px]">-</span>
                            )}
                            <span className="text-gray-400">
                              {entry.type === 'trade'
                                ? `${entry.action} ${entry.amountIn} ${entry.tokenIn} → ${entry.amountOut} ${entry.tokenOut}`
                                : entry.type === 'deposit'
                                ? `Deposit ${entry.amount} WMON`
                                : `Withdraw ${entry.amountOut} WMON`
                              }
                            </span>
                          </div>
                          <a
                            href={`${EXPLORER}/tx/${entry.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-600 hover:text-cyan-400 transition-colors"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Contract Link */}
          {contract && (
            <div className="text-center pt-1">
              <a
                href={`${EXPLORER}/address/${contract}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-500 transition-colors"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                {contract.slice(0, 10)}...{contract.slice(-8)} on MonadScan
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
