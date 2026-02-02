'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Vote, Coins, Users, Clock, ArrowRightLeft, CheckCircle2, X, Loader2, Shield, TrendingUp, RefreshCw, Wallet, ArrowDownToLine, Gift, Flame, AlertTriangle } from 'lucide-react';
import { ethers } from 'ethers';

interface DAOModalProps {
  userAddress?: string;
  onClose: () => void;
  isDarkMode?: boolean;
}

const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN!;
const VTOURS_ADDRESS = process.env.NEXT_PUBLIC_VOTING_TOURS || '';
const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO || '';
const TIMELOCK_ADDRESS = process.env.NEXT_PUBLIC_TIMELOCK || '';
const NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT || process.env.NEXT_PUBLIC_NFT_CONTRACT || '';


const TOURS_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

const VTOURS_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function getVotes(address account) external view returns (uint256)',
  'function delegates(address account) external view returns (address)',
  'function wrap(uint256 amount) external',
  'function wrapAndDelegate(uint256 amount, address delegatee) external',
  'function unwrap(uint256 amount) external',
  'function delegate(address delegatee) external',
];

const DAO_ABI = [
  'function proposalThreshold() external view returns (uint256)',
  'function votingDelay() external view returns (uint256)',
  'function votingPeriod() external view returns (uint256)',
  'function quorumNumerator() external view returns (uint256)',
];

type TabType = 'overview' | 'wrap' | 'delegate' | 'proposals' | 'burn';

export const DAOModal: React.FC<DAOModalProps> = ({ userAddress, onClose, isDarkMode = true }) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [toursBalance, setToursBalance] = useState('0'); // Wallet balance
  const [safeToursBalance, setSafeToursBalance] = useState('0'); // Safe balance
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [vToursBalance, setVToursBalance] = useState('0');
  const [votingPower, setVotingPower] = useState('0');
  const [delegatedTo, setDelegatedTo] = useState<string | null>(null);
  const [wrapAmount, setWrapAmount] = useState('');
  const [unwrapAmount, setUnwrapAmount] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [delegateAddress, setDelegateAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [daoInfo, setDaoInfo] = useState({
    proposalThreshold: '100',
    votingDelay: '1 day',
    votingPeriod: '1 week',
    quorum: '4%',
    timelockDelay: '2 days',
  });
  const [refreshing, setRefreshing] = useState(false);
  const [fundingInProgress, setFundingInProgress] = useState(false);

  // Burn proposal state
  const [burnTokenId, setBurnTokenId] = useState('');
  const [burnReason, setBurnReason] = useState('');
  const [burnProposalLoading, setBurnProposalLoading] = useState(false);


  // Mount state for portal rendering (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch balances and DAO info
  const fetchData = async () => {
    if (!userAddress) return;

    try {
      console.log('[DAOModal] Fetching data for:', userAddress);

      // Create provider with explicit network configuration to avoid network detection issues
      const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
      const provider = new ethers.JsonRpcProvider(rpcUrl, {
        chainId: 143,
        name: 'monad'
      });

      // Get User Safe address and TOURS balances from server-side API
      let userSafeAddr: string | null = null;
      try {
        const safeRes = await fetch(`/api/user-safe?address=${userAddress}`);
        const safeData = await safeRes.json();
        if (safeData.success) {
          if (safeData.safeAddress) {
            userSafeAddr = safeData.safeAddress;
            setSafeAddress(userSafeAddr);
            console.log('[DAOModal] User Safe:', userSafeAddr);
          }
          // Use server-side TOURS balances (more reliable than client-side RPC)
          if (safeData.toursWalletBalance) {
            setToursBalance(safeData.toursWalletBalance);
            console.log('[DAOModal] Wallet TOURS balance (from API):', safeData.toursWalletBalance);
          }
          if (safeData.toursBalance) {
            setSafeToursBalance(safeData.toursBalance);
            console.log('[DAOModal] Safe TOURS balance (from API):', safeData.toursBalance);
          }
        }
      } catch (safeErr) {
        console.warn('[DAOModal] Failed to fetch Safe data:', safeErr);
      }

      // Fetch vTOURS balance and voting power from BOTH wallet and Safe
      if (VTOURS_ADDRESS) {
        try {
          const vToursContract = new ethers.Contract(VTOURS_ADDRESS, VTOURS_ABI, provider);

          // Check wallet vTOURS balance and voting power
          let walletVTours = 0n;
          let walletVotes = 0n;
          try {
            walletVTours = await vToursContract.balanceOf(userAddress);
            walletVotes = await vToursContract.getVotes(userAddress);
            console.log('[DAOModal] Wallet vTOURS:', ethers.formatEther(walletVTours), 'votes:', ethers.formatEther(walletVotes));

            // Check wallet delegation
            const walletDelegate = await vToursContract.delegates(userAddress);
            if (walletDelegate !== ethers.ZeroAddress) {
              setDelegatedTo(walletDelegate);
            }
          } catch (e) {
            console.warn('[DAOModal] Failed to fetch wallet vTOURS:', e);
          }

          // Check Safe vTOURS balance and voting power (if Safe exists)
          let safeVTours = 0n;
          let safeVotes = 0n;
          if (userSafeAddr) {
            try {
              safeVTours = await vToursContract.balanceOf(userSafeAddr);
              safeVotes = await vToursContract.getVotes(userSafeAddr);
              console.log('[DAOModal] Safe vTOURS:', ethers.formatEther(safeVTours), 'votes:', ethers.formatEther(safeVotes));

              // Check Safe delegation if no wallet delegation found
              if (!delegatedTo) {
                const safeDelegate = await vToursContract.delegates(userSafeAddr);
                if (safeDelegate !== ethers.ZeroAddress) {
                  setDelegatedTo(safeDelegate);
                }
              }
            } catch (e) {
              console.warn('[DAOModal] Failed to fetch Safe vTOURS:', e);
            }
          }

          // Combine totals (wallet + Safe)
          const totalVTours = walletVTours + safeVTours;
          const totalVotes = walletVotes + safeVotes;

          setVToursBalance(ethers.formatEther(totalVTours));
          setVotingPower(ethers.formatEther(totalVotes));

          console.log('[DAOModal] Total vTOURS:', ethers.formatEther(totalVTours), 'Total voting power:', ethers.formatEther(totalVotes));
        } catch (vtoursErr) {
          console.warn('[DAOModal] vTOURS contract not available:', vtoursErr);
        }
      } else {
        console.log('[DAOModal] vTOURS address not configured');
      }
    } catch (err) {
      console.error('[DAOModal] Failed to fetch DAO data:', err);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [userAddress]);

  // Refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Fund Safe - request TOURS from platform via delegated transaction
  const handleFundSafe = async () => {
    if (!userAddress || !safeAddress || !fundAmount || parseFloat(fundAmount) <= 0) return;

    const amount = parseFloat(fundAmount);
    if (amount > 10) {
      setError('Maximum 10 TOURS per funding request');
      return;
    }

    setFundingInProgress(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('[DAOModal] Requesting Safe funding:', fundAmount, 'TOURS');
      console.log('[DAOModal] Safe address:', safeAddress);

      // Use delegated transaction to fund Safe from platform
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          action: 'dao_fund_safe',
          params: {
            amount: fundAmount,
            safeAddress,
          },
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fund Safe');
      }

      console.log('[DAOModal] Fund Safe result:', result);
      setSuccess(`Received ${fundAmount} TOURS in your Safe! TX: ${result.txHash?.slice(0, 10)}...`);
      setFundAmount('');

      // Refresh balances after delay
      setTimeout(() => fetchData(), 3000);
    } catch (err: any) {
      console.error('[DAOModal] Fund Safe failed:', err);
      setError(err.message || 'Failed to fund Safe');
    } finally {
      setFundingInProgress(false);
    }
  };

  const handleWrap = async () => {
    if (!userAddress || !wrapAmount || parseFloat(wrapAmount) <= 0) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use delegated transaction API (gasless, no MetaMask popup)
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dao_wrap',
          userAddress,
          params: { amount: wrapAmount },
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to wrap TOURS');
      }

      setSuccess(data.message || `Wrapped ${wrapAmount} TOURS to vTOURS!`);
      setWrapAmount('');

      // Refresh balances
      setTimeout(() => fetchData(), 2000);
    } catch (err: any) {
      console.error('Wrap failed:', err);
      setError(err.message || 'Failed to wrap TOURS');
    } finally {
      setLoading(false);
    }
  };

  const handleUnwrap = async () => {
    if (!userAddress || !unwrapAmount || parseFloat(unwrapAmount) <= 0) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use delegated transaction API (gasless, no MetaMask popup)
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dao_unwrap',
          userAddress,
          params: { amount: unwrapAmount },
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to unwrap vTOURS');
      }

      setSuccess(data.message || `Unwrapped ${unwrapAmount} vTOURS back to TOURS!`);
      setUnwrapAmount('');

      // Refresh balances after a delay for chain confirmation
      setTimeout(() => fetchData(), 2000);
    } catch (err: any) {
      console.error('Unwrap failed:', err);
      setError(err.message || 'Failed to unwrap vTOURS');
    } finally {
      setLoading(false);
    }
  };

  const handleDelegate = async () => {
    if (!userAddress || !delegateAddress) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use delegated transaction API (gasless, no MetaMask popup)
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dao_delegate',
          userAddress,
          params: { delegatee: delegateAddress },
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to delegate');
      }

      setSuccess(data.message || `Delegated voting power to ${delegateAddress.slice(0, 6)}...${delegateAddress.slice(-4)}`);
      setDelegatedTo(delegateAddress);
      setDelegateAddress('');

      // Refresh balances after a delay for chain confirmation
      setTimeout(() => fetchData(), 2000);
    } catch (err: any) {
      console.error('Delegate failed:', err);
      setError(err.message || 'Failed to delegate');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBurnProposal = async () => {
    if (!userAddress || !burnTokenId || !burnReason) return;
    setBurnProposalLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use delegated transaction API to create a burn proposal
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dao_create_burn_proposal',
          userAddress,
          params: {
            tokenId: burnTokenId,
            reason: burnReason,
            nftContract: NFT_ADDRESS,
          },
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to create burn proposal');
      }

      setSuccess(data.message || `Burn proposal created! Token #${burnTokenId} will be voted on by the DAO.`);
      setBurnTokenId('');
      setBurnReason('');
    } catch (err: any) {
      console.error('Create burn proposal failed:', err);
      setError(err.message || 'Failed to create burn proposal');
    } finally {
      setBurnProposalLoading(false);
    }
  };


  const formatNumber = (num: string) => {
    const n = parseFloat(num);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
    return n.toFixed(2);
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`}
      style={{ zIndex: 9999, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
      onClick={onClose}
    >
      <div
        className={`rounded-2xl w-full max-w-lg shadow-2xl ${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 border border-purple-500/30' : 'bg-white border border-gray-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-600/30 flex items-center justify-center">
              <Vote className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">EmpowerTours DAO</h2>
              <p className="text-sm text-gray-400">Governance & Voting</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-gray-400 hover:text-purple-400 transition-colors disabled:opacity-50"
              title="Refresh balances"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-purple-500/20 overflow-x-auto">
          {(['overview', 'wrap', 'delegate', 'proposals', 'burn'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors whitespace-nowrap px-2 ${
                activeTab === tab
                  ? tab === 'burn' ? 'text-red-400 border-b-2 border-red-400'
                    : 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'overview' && 'Overview'}
              {tab === 'wrap' && 'Wrap'}
              {tab === 'delegate' && 'Delegate'}
              {tab === 'proposals' && 'Vote'}
              {tab === 'burn' && 'Report'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-800/50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-yellow-400" />
                <p className="text-xs text-gray-400">Wallet TOURS</p>
              </div>
              <p className="text-lg font-bold text-white">{formatNumber(toursBalance)}</p>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-blue-400" />
                <p className="text-xs text-gray-400">Safe TOURS</p>
              </div>
              <p className="text-lg font-bold text-white">{formatNumber(safeToursBalance)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-gray-800/50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Vote className="w-4 h-4 text-purple-400" />
                <p className="text-xs text-gray-400">vTOURS</p>
              </div>
              <p className="text-lg font-bold text-white">{formatNumber(vToursBalance)}</p>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <p className="text-xs text-gray-400">Voting Power</p>
              </div>
              <p className="text-lg font-bold text-white">{formatNumber(votingPower)}</p>
            </div>
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3">How It Works</h3>
                <ol className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                    <span>Wrap TOURS to get vTOURS (1:1 ratio)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                    <span>Delegate vTOURS to yourself or others to activate voting power</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                    <span>Vote on proposals to shape platform direction</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">4</span>
                    <span>Unwrap vTOURS back to TOURS anytime</span>
                  </li>
                </ol>
              </div>

              <div className="bg-gray-800/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3">DAO Parameters</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Proposal Threshold</span>
                    <span className="text-white">{daoInfo.proposalThreshold} vTOURS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Quorum</span>
                    <span className="text-white">{daoInfo.quorum}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Voting Delay</span>
                    <span className="text-white">{daoInfo.votingDelay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Voting Period</span>
                    <span className="text-white">{daoInfo.votingPeriod}</span>
                  </div>
                </div>
              </div>

              {delegatedTo && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <span className="text-green-400 text-sm">
                      Delegated to: {delegatedTo === userAddress ? 'Yourself' : `${delegatedTo.slice(0, 6)}...${delegatedTo.slice(-4)}`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'wrap' && (
            <div className="space-y-4">
              {/* Request TOURS Section - show if Safe needs TOURS for wrapping */}
              {parseFloat(safeToursBalance) < 10 && (
                <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
                    <Gift className="w-4 h-4" />
                    Step 1: Get TOURS for Your Safe
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Request TOURS tokens to participate in DAO governance. Max 10 TOURS per request.
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1 flex gap-1">
                      <input
                        type="number"
                        value={fundAmount}
                        onChange={(e) => setFundAmount(e.target.value)}
                        placeholder="Amount (max 10)"
                        max="10"
                        className={`flex-1 min-w-0 rounded-lg px-3 py-2 focus:outline-none ${isDarkMode ? 'bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-purple-500' : 'bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-purple-500'}`}
                      />
                      <button
                        onClick={() => setFundAmount('10')}
                        className="px-2 py-2 bg-purple-900/50 border border-purple-700 rounded-lg text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-900/70 transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                    <button
                      onClick={handleFundSafe}
                      disabled={fundingInProgress || !fundAmount || !safeAddress || parseFloat(fundAmount) > 10}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
                    >
                      {fundingInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Request'}
                    </button>
                  </div>
                </div>
              )}

              {/* Wrap Section */}
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4" />
                  {parseFloat(toursBalance) > 0 ? 'Step 2: ' : ''}Wrap TOURS → vTOURS
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Get voting power by wrapping TOURS from your Safe. Auto-delegates to yourself.
                  {parseFloat(safeToursBalance) === 0 && parseFloat(toursBalance) > 0 && (
                    <span className="text-yellow-400 block mt-1">⚠️ Fund your Safe first to wrap tokens.</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <input
                      type="number"
                      value={wrapAmount}
                      onChange={(e) => setWrapAmount(e.target.value)}
                      placeholder="Amount"
                      className={`flex-1 min-w-0 rounded-lg px-3 py-2 focus:outline-none ${isDarkMode ? 'bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-purple-500' : 'bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-purple-500'}`}
                    />
                    <button
                      onClick={() => setWrapAmount(safeToursBalance)}
                      className="px-2 py-2 bg-purple-900/50 border border-purple-700 rounded-lg text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-900/70 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={handleWrap}
                    disabled={loading || !wrapAmount || parseFloat(safeToursBalance) === 0}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Wrap'}
                  </button>
                </div>
              </div>

              {/* Unwrap Section */}
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 rotate-180" />
                  Unwrap vTOURS → TOURS
                </h3>
                <p className="text-xs text-gray-400 mb-3">Convert vTOURS back to TOURS anytime.</p>
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <input
                      type="number"
                      value={unwrapAmount}
                      onChange={(e) => setUnwrapAmount(e.target.value)}
                      placeholder="Amount"
                      className={`flex-1 min-w-0 rounded-lg px-3 py-2 focus:outline-none ${isDarkMode ? 'bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-purple-500' : 'bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-purple-500'}`}
                    />
                    <button
                      onClick={() => setUnwrapAmount(vToursBalance)}
                      className="px-2 py-2 bg-purple-900/50 border border-purple-700 rounded-lg text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-900/70 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={handleUnwrap}
                    disabled={loading || !unwrapAmount}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unwrap'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'delegate' && (
            <div className="space-y-4">
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Delegate Voting Power
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Delegate your vTOURS voting power to yourself or another address. You keep your tokens.
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => setDelegateAddress(userAddress || '')}
                    className={`w-full p-3 rounded-lg border transition-colors text-left ${
                      delegatedTo === userAddress
                        ? 'border-purple-500 bg-purple-900/20'
                        : 'border-gray-700 hover:border-purple-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">Delegate to Yourself</p>
                        <p className="text-xs text-gray-400">Vote directly on proposals</p>
                      </div>
                      {delegatedTo === userAddress && (
                        <CheckCircle2 className="w-5 h-5 text-purple-400" />
                      )}
                    </div>
                  </button>

                  <div className="text-center text-gray-500 text-sm">or</div>

                  <div>
                    <input
                      type="text"
                      value={delegateAddress}
                      onChange={(e) => setDelegateAddress(e.target.value)}
                      placeholder="0x... delegate address"
                      className={`w-full rounded-lg px-3 py-2 focus:outline-none mb-2 ${isDarkMode ? 'bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-purple-500' : 'bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-purple-500'}`}
                    />
                    <button
                      onClick={handleDelegate}
                      disabled={loading || !delegateAddress}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delegate'}
                    </button>
                  </div>
                </div>
              </div>

              {delegatedTo && delegatedTo !== userAddress && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
                  <p className="text-yellow-400 text-sm">
                    Your votes are currently delegated to {delegatedTo.slice(0, 6)}...{delegatedTo.slice(-4)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Proposals Tab */}
          {activeTab === 'proposals' && (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                  <Vote className="w-4 h-4" />
                  DAO Governance
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Create and vote on proposals to shape the future of EmpowerTours. You need at least {daoInfo.proposalThreshold} vTOURS to create a proposal.
                </p>
                <div className="space-y-2 text-xs text-gray-400">
                  <p>• Voting Delay: {daoInfo.votingDelay} after proposal</p>
                  <p>• Voting Period: {daoInfo.votingPeriod}</p>
                  <p>• Quorum Required: {daoInfo.quorum}</p>
                </div>
              </div>

              {/* Voting Power Status */}
              <div className={`rounded-xl p-4 ${parseFloat(votingPower) > 0 ? 'bg-green-900/20 border border-green-500/30' : 'bg-gray-800/30 border border-gray-700'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Your Voting Power</p>
                    <p className={`text-lg font-bold ${parseFloat(votingPower) > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                      {formatNumber(votingPower)} vTOURS
                    </p>
                  </div>
                  {parseFloat(votingPower) === 0 && (
                    <button
                      onClick={() => setActiveTab('delegate')}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs text-white"
                    >
                      Activate Voting
                    </button>
                  )}
                </div>
                {parseFloat(votingPower) === 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Delegate vTOURS to yourself to activate voting power
                  </p>
                )}
              </div>

              {/* View Proposals Link */}
              <a
                href={`https://monadscan.com/address/${DAO_ADDRESS}#readProxyContract`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-gray-800/30 rounded-xl p-4 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">View Proposals</p>
                    <p className="text-xs text-gray-400">See active proposals on Monadscan</p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                </div>
              </a>

              {/* Create Proposal Section */}
              <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
                <h4 className="text-sm font-medium text-purple-400 mb-2">Create Proposal</h4>
                <p className="text-xs text-gray-400 mb-3">
                  {parseFloat(votingPower) >= parseFloat(daoInfo.proposalThreshold)
                    ? 'You have enough voting power to create a proposal!'
                    : `You need ${daoInfo.proposalThreshold} vTOURS to create a proposal. Wrap and delegate more TOURS.`}
                </p>
                <button
                  disabled={parseFloat(votingPower) < parseFloat(daoInfo.proposalThreshold)}
                  onClick={() => window.open(`https://monadscan.com/address/${DAO_ADDRESS}#writeProxyContract`, '_blank')}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
                >
                  {parseFloat(votingPower) >= parseFloat(daoInfo.proposalThreshold)
                    ? 'Create Proposal on Explorer'
                    : `Need ${daoInfo.proposalThreshold} vTOURS`}
                </button>
              </div>

              {/* How Voting Works */}
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h4 className="text-sm font-medium text-purple-400 mb-2">How Voting Works</h4>
                <ol className="space-y-2 text-xs text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                    <span>Wrap TOURS to vTOURS and delegate to yourself</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                    <span>View active proposals on the blockchain explorer</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                    <span>Cast your vote: For, Against, or Abstain</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">4</span>
                    <span>If passed and quorum met, proposal executes after timelock</span>
                  </li>
                </ol>
              </div>
            </div>
          )}


          {/* Burn/Report Tab - Report stolen/infringing content for DAO review */}
          {activeTab === 'burn' && (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Report Stolen/Infringing Content
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  If you believe an NFT contains stolen content, copyright infringement, or violates platform rules, you can create a DAO proposal to burn it. The community will vote on whether to remove the content.
                </p>
              </div>

              {/* Voting Power Check */}
              {parseFloat(votingPower) < parseFloat(daoInfo.proposalThreshold) ? (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-yellow-400" />
                    <p className="text-sm font-medium text-yellow-400">Voting Power Required</p>
                  </div>
                  <p className="text-xs text-gray-400">
                    You need at least {daoInfo.proposalThreshold} vTOURS to create a burn proposal.
                    Go to the Wrap tab to get voting power.
                  </p>
                  <button
                    onClick={() => setActiveTab('wrap')}
                    className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-white text-sm font-medium transition-colors"
                  >
                    Get Voting Power
                  </button>
                </div>
              ) : (
                <div className="bg-gray-800/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                    <Flame className="w-4 h-4" />
                    Create Burn Proposal
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Token ID to Report</label>
                      <input
                        type="number"
                        value={burnTokenId}
                        onChange={(e) => setBurnTokenId(e.target.value)}
                        placeholder="Enter NFT token ID"
                        className={`w-full rounded-lg px-3 py-2 focus:outline-none ${isDarkMode ? 'bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-red-500' : 'bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-red-500'}`}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Reason for Burn</label>
                      <textarea
                        value={burnReason}
                        onChange={(e) => setBurnReason(e.target.value)}
                        placeholder="Explain why this NFT should be burned (e.g., 'Copyright infringement - original artwork by @artist')"
                        rows={3}
                        className={`w-full rounded-lg px-3 py-2 focus:outline-none resize-none ${isDarkMode ? 'bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-red-500' : 'bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-red-500'}`}
                      />
                    </div>

                    <button
                      onClick={handleCreateBurnProposal}
                      disabled={burnProposalLoading || !burnTokenId || !burnReason}
                      className="w-full py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {burnProposalLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating Proposal...
                        </>
                      ) : (
                        <>
                          <Flame className="w-4 h-4" />
                          Create Burn Proposal
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* How It Works */}
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h4 className="text-sm font-medium text-purple-400 mb-2">How Burn Proposals Work</h4>
                <ol className="space-y-2 text-xs text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="bg-red-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                    <span>Submit a proposal with the token ID and reason</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                    <span>DAO members vote during the voting period ({daoInfo.votingPeriod})</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                    <span>If approved with quorum ({daoInfo.quorum}), it enters timelock</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-600/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">4</span>
                    <span>After timelock ({daoInfo.timelockDelay}), the NFT is burned</span>
                  </li>
                </ol>
              </div>

              {/* Warning */}
              <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-500">
                  <strong className="text-yellow-400">Note:</strong> Burn proposals are serious governance actions.
                  False reports may damage your reputation in the community. Only report content you genuinely believe violates platform rules.
                </p>
              </div>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-purple-500/20">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Contracts: vTOURS, Timelock, Governor</span>
            <a
              href={`https://monadscan.com/address/${DAO_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300"
            >
              View on Explorer
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default DAOModal;
