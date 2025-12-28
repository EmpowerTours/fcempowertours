'use client';

import React, { useState, useEffect } from 'react';
import { Vote, Coins, Users, Clock, ArrowRightLeft, CheckCircle2, X, Loader2, Shield, TrendingUp } from 'lucide-react';
import { ethers } from 'ethers';

interface DAOModalProps {
  userAddress?: string;
  onClose: () => void;
}

const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN || '0x46d048EB424b0A95d5185f39C760c5FA754491d0';
const VTOURS_ADDRESS = process.env.NEXT_PUBLIC_VOTING_TOURS || '';
const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO || '';
const TIMELOCK_ADDRESS = process.env.NEXT_PUBLIC_TIMELOCK || '';

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

type TabType = 'overview' | 'wrap' | 'delegate';

export const DAOModal: React.FC<DAOModalProps> = ({ userAddress, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [toursBalance, setToursBalance] = useState('0');
  const [vToursBalance, setVToursBalance] = useState('0');
  const [votingPower, setVotingPower] = useState('0');
  const [delegatedTo, setDelegatedTo] = useState<string | null>(null);
  const [wrapAmount, setWrapAmount] = useState('');
  const [unwrapAmount, setUnwrapAmount] = useState('');
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

  // Fetch balances and DAO info
  useEffect(() => {
    if (!userAddress) return;

    const fetchData = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(
          process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com'
        );

        // Fetch TOURS balance
        const toursContract = new ethers.Contract(TOURS_ADDRESS, TOURS_ABI, provider);
        const toursBal = await toursContract.balanceOf(userAddress);
        setToursBalance(ethers.formatEther(toursBal));

        // Fetch vTOURS balance and voting power
        if (VTOURS_ADDRESS) {
          const vToursContract = new ethers.Contract(VTOURS_ADDRESS, VTOURS_ABI, provider);
          const vToursBal = await vToursContract.balanceOf(userAddress);
          setVToursBalance(ethers.formatEther(vToursBal));

          const votes = await vToursContract.getVotes(userAddress);
          setVotingPower(ethers.formatEther(votes));

          const delegate = await vToursContract.delegates(userAddress);
          if (delegate !== ethers.ZeroAddress) {
            setDelegatedTo(delegate);
          }
        }
      } catch (err) {
        console.error('Failed to fetch DAO data:', err);
      }
    };

    fetchData();
  }, [userAddress]);

  const handleWrap = async () => {
    if (!userAddress || !wrapAmount || parseFloat(wrapAmount) <= 0) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const amount = ethers.parseEther(wrapAmount);

      // Approve TOURS spending
      const toursContract = new ethers.Contract(TOURS_ADDRESS, TOURS_ABI, signer);
      const allowance = await toursContract.allowance(userAddress, VTOURS_ADDRESS);

      if (allowance < amount) {
        const approveTx = await toursContract.approve(VTOURS_ADDRESS, amount);
        await approveTx.wait();
      }

      // Wrap and delegate to self
      const vToursContract = new ethers.Contract(VTOURS_ADDRESS, VTOURS_ABI, signer);
      const wrapTx = await vToursContract.wrapAndDelegate(amount, userAddress);
      await wrapTx.wait();

      setSuccess(`Wrapped ${wrapAmount} TOURS to vTOURS and delegated to yourself!`);
      setWrapAmount('');

      // Refresh balances
      const toursBal = await toursContract.balanceOf(userAddress);
      setToursBalance(ethers.formatEther(toursBal));
      const vToursBal = await vToursContract.balanceOf(userAddress);
      setVToursBalance(ethers.formatEther(vToursBal));
      const votes = await vToursContract.getVotes(userAddress);
      setVotingPower(ethers.formatEther(votes));
      setDelegatedTo(userAddress);
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
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const amount = ethers.parseEther(unwrapAmount);

      const vToursContract = new ethers.Contract(VTOURS_ADDRESS, VTOURS_ABI, signer);
      const unwrapTx = await vToursContract.unwrap(amount);
      await unwrapTx.wait();

      setSuccess(`Unwrapped ${unwrapAmount} vTOURS back to TOURS!`);
      setUnwrapAmount('');

      // Refresh balances
      const toursContract = new ethers.Contract(TOURS_ADDRESS, TOURS_ABI, new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_MONAD_RPC));
      const toursBal = await toursContract.balanceOf(userAddress);
      setToursBalance(ethers.formatEther(toursBal));
      const vToursBal = await vToursContract.balanceOf(userAddress);
      setVToursBalance(ethers.formatEther(vToursBal));
      const votes = await vToursContract.getVotes(userAddress);
      setVotingPower(ethers.formatEther(votes));
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
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const vToursContract = new ethers.Contract(VTOURS_ADDRESS, VTOURS_ABI, signer);
      const delegateTx = await vToursContract.delegate(delegateAddress);
      await delegateTx.wait();

      setSuccess(`Delegated voting power to ${delegateAddress.slice(0, 6)}...${delegateAddress.slice(-4)}`);
      setDelegatedTo(delegateAddress);
      setDelegateAddress('');

      // Refresh voting power
      const votes = await vToursContract.getVotes(userAddress);
      setVotingPower(ethers.formatEther(votes));
    } catch (err: any) {
      console.error('Delegate failed:', err);
      setError(err.message || 'Failed to delegate');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: string) => {
    const n = parseFloat(num);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
    return n.toFixed(2);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 rounded-2xl w-full max-w-lg border border-purple-500/30 shadow-2xl">
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
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-purple-500/20">
          {(['overview', 'wrap', 'delegate'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'overview' && 'Overview'}
              {tab === 'wrap' && 'Wrap/Unwrap'}
              {tab === 'delegate' && 'Delegate'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-800/50 rounded-xl p-3 text-center">
              <Coins className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <p className="text-xs text-gray-400">TOURS</p>
              <p className="text-lg font-bold text-white">{formatNumber(toursBalance)}</p>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-3 text-center">
              <Shield className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <p className="text-xs text-gray-400">vTOURS</p>
              <p className="text-lg font-bold text-white">{formatNumber(vToursBalance)}</p>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-3 text-center">
              <TrendingUp className="w-5 h-5 text-green-400 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Voting Power</p>
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
              {/* Wrap Section */}
              <div className="bg-gray-800/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4" />
                  Wrap TOURS → vTOURS
                </h3>
                <p className="text-xs text-gray-400 mb-3">Get voting power by wrapping TOURS. Auto-delegates to yourself.</p>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      value={wrapAmount}
                      onChange={(e) => setWrapAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={() => setWrapAmount(toursBalance)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-purple-400 hover:text-purple-300"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={handleWrap}
                    disabled={loading || !wrapAmount}
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
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      value={unwrapAmount}
                      onChange={(e) => setUnwrapAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={() => setUnwrapAmount(vToursBalance)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-purple-400 hover:text-purple-300"
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
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-2"
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
              href={`https://testnet.monadscan.com/address/${DAO_ADDRESS}`}
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
};

export default DAOModal;
