'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { calculateProjectedYield, formatYieldProjection } from '@/lib/switchboard-yield';

interface PassportStakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  passportTokenId: number;
  passportCountryCode?: string;
  passportCountryName?: string;
  walletAddress: string;
}

interface StakingPosition {
  positionId: string;
  nftTokenId: string;
  toursStaked: string;
  monDeployed: string;
  depositTime: string;
  accumulatedYield: string;
  projectedYield?: string;
  estimatedAPY?: number;
  daysStaked?: number;
  active: boolean;
  oracleSource?: 'switchboard' | 'fallback';
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const YIELD_STRATEGY = process.env.NEXT_PUBLIC_YIELD_STRATEGY || '0x37aC86916Ae673bDFCc9c712057092E57b270f5f';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT_NFT_V2 || process.env.NEXT_PUBLIC_PASSPORT || '';

const YIELD_STRATEGY_ABI = [
  'function getUserPositions(address user) external view returns (uint256[])',
  'function getPosition(uint256 positionId) external view returns (tuple(address nftAddress, uint256 nftTokenId, address owner, address beneficiary, uint256 depositTime, uint256 monStaked, uint256 kintsuShares, uint256 yieldDebt, uint8 state, tuple(uint256 kintsuUnlockIndex, uint96 shares, uint96 expectedSpotValue, uint40 requestTime, bool exists) unlockRequest))',
  'function accYieldPerShare() external view returns (uint256)',
];

export default function PassportStakingModal({
  isOpen,
  onClose,
  passportTokenId,
  passportCountryCode,
  passportCountryName,
  walletAddress,
}: PassportStakingModalProps) {
  const [stakeAmount, setStakeAmount] = useState('');
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stakeTxHash, setStakeTxHash] = useState('');
  const [positions, setPositions] = useState<StakingPosition[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);

  // Fetch staking positions for this specific passport
  useEffect(() => {
    if (!isOpen || !walletAddress) return;

    const fetchPositions = async () => {
      try {
        setIsLoadingPositions(true);

        const provider = new ethers.JsonRpcProvider(MONAD_RPC);
        const contract = new ethers.Contract(YIELD_STRATEGY, YIELD_STRATEGY_ABI, provider);

        const positionIds = await contract.getUserPositions(walletAddress);
        const accYieldPerShare = await contract.accYieldPerShare();

        const passportPositions: StakingPosition[] = [];

        for (const positionId of positionIds) {
          const pos = await contract.getPosition(positionId);

          // Only include positions for this specific passport that are active (state = 0)
          // PositionState: 0 = Active, 1 = PendingWithdrawal, 2 = Closed
          if (pos.state !== 0 || pos.nftTokenId.toString() !== passportTokenId.toString()) continue;

          const monStaked = BigInt(pos.monStaked);
          const yieldDebt = BigInt(pos.yieldDebt);
          const accYield = BigInt(accYieldPerShare);

          const accumulatedYield = (monStaked * accYield) / BigInt(1e18) - yieldDebt;

          const projection = await calculateProjectedYield(
            BigInt(pos.monStaked),
            BigInt(pos.depositTime),
            accumulatedYield
          );

          passportPositions.push({
            positionId: positionId.toString(),
            nftTokenId: pos.nftTokenId.toString(),
            toursStaked: ethers.formatUnits(pos.monStaked, 18),
            monDeployed: ethers.formatUnits(pos.monStaked, 18),
            depositTime: pos.depositTime.toString(),
            accumulatedYield: ethers.formatUnits(accumulatedYield, 18),
            projectedYield: projection.projectedYield,
            estimatedAPY: projection.estimatedAPY,
            daysStaked: Math.floor((Date.now() / 1000 - Number(pos.depositTime)) / 86400),
            active: pos.state === 0,
            oracleSource: (projection as any).oracleSource || 'fallback',
          });
        }

        setPositions(passportPositions);
      } catch (err) {
        console.error('Error fetching positions:', err);
      } finally {
        setIsLoadingPositions(false);
      }
    };

    fetchPositions();
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, [isOpen, walletAddress, passportTokenId]);

  const handleStake = async () => {
    console.log('[Staking Modal] handleStake called with amount:', stakeAmount);
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    console.log('[Staking Modal] Amount valid:', amount, 'walletAddress:', walletAddress);
    setIsStaking(true);
    setError('');
    setSuccess('');
    setStakeTxHash('');

    try {
      // Check for delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('stake_tours');

      if (!hasValidDelegation) {
        setSuccess('⏳ Setting up gasless transactions...');

        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: walletAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      setSuccess('⏳ Staking MON (FREE - we pay gas)...');

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'stake_tours',
          params: {
            amount: stakeAmount,
            nftTokenId: passportTokenId.toString()
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Stake failed');
      }

      const { txHash, positionId } = await response.json();

      setStakeTxHash(txHash);
      setSuccess(`🎉 Successfully staked ${stakeAmount} MON! Position ID: ${positionId}`);
      setStakeAmount('');

      // Refresh positions after delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      console.error('Stake error:', err);
      setError(err.message || 'Failed to stake MON');
    } finally {
      setIsStaking(false);
    }
  };

  const handleUnstake = async (positionId: string) => {
    setIsUnstaking(positionId);
    setError('');
    setSuccess('');

    try {
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('unstake_tours');

      if (!hasValidDelegation) {
        setSuccess('⏳ Setting up gasless transactions...');

        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: walletAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      setSuccess('⏳ Unstaking position (FREE - we pay gas)...');

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'unstake_tours',
          params: { positionId }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Unstake failed');
      }

      const { txHash } = await response.json();
      setSuccess(`🎉 Successfully unstaked! TX: ${txHash.slice(0, 10)}...`);

      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      console.error('Unstake error:', err);
      setError(err.message || 'Failed to unstake');
    } finally {
      setIsUnstaking(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">
                💰 Stake with Passport #{passportTokenId}
              </h2>
              <p className="text-purple-100 text-sm mt-1">
                {passportCountryCode && passportCountryName ? `${passportCountryCode} - ${passportCountryName}` : 'Passport Staking'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Messages */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-medium">❌ {error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <p className="text-green-700 font-medium">✅ {success}</p>
            </div>
          )}

          {/* Stake Form */}
          <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Stake MON to Earn Yield</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (MON)
                </label>
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="Enter MON amount (e.g., 1.0)"
                  step="0.01"
                  className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:outline-none"
                />
              </div>
              <button
                onClick={handleStake}
                disabled={isStaking || !stakeAmount}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isStaking ? '⏳ Staking...' : '📌 Stake MON'}
              </button>
              <p className="text-xs text-gray-500 text-center">
                Your MON will be deployed to Kintsu Vault to earn yield. Gasless transaction!
              </p>
            </div>
          </div>

          {/* Active Positions */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">📊 Your Staking Positions</h3>
            {isLoadingPositions ? (
              <div className="text-center py-8">
                <div className="animate-spin inline-block text-3xl">⏳</div>
                <p className="text-gray-500 mt-2">Loading positions...</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-gray-600">No active staking positions for this passport</p>
              </div>
            ) : (
              <div className="space-y-4">
                {positions.map((pos) => (
                  <div
                    key={pos.positionId}
                    className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-4"
                  >
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-600">MON Deployed</p>
                        <p className="text-lg font-bold text-gray-900">{parseFloat(pos.monDeployed).toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Accumulated Yield</p>
                        <p className="text-lg font-bold text-green-600">{parseFloat(pos.accumulatedYield).toFixed(4)} MON</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Days Staked</p>
                        <p className="text-lg font-bold text-gray-900">{pos.daysStaked || 0} days</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Estimated APY</p>
                        <p className="text-lg font-bold text-blue-600">
                          {pos.estimatedAPY ? `${pos.estimatedAPY.toFixed(2)}%` : 'Calculating...'}
                        </p>
                      </div>
                    </div>
                    {pos.projectedYield && (
                      <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 mb-4">
                        <p className="text-xs text-blue-700 font-medium">Projected Total Yield</p>
                        <p className="text-sm text-blue-900">{pos.projectedYield}</p>
                      </div>
                    )}

                    {/* Animated Yield Progress Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-medium text-gray-700">💰 Live Yield Accrual</p>
                        <p className="text-xs font-bold text-green-600 animate-pulse">
                          +{parseFloat(pos.accumulatedYield).toFixed(6)} MON
                        </p>
                      </div>
                      <div className="relative w-full h-8 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full overflow-hidden border-2 border-gray-300 shadow-inner">
                        {/* Animated gradient background with glow */}
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-green-400 via-blue-500 to-green-400 transition-all duration-1000 ease-out"
                          style={{
                            width: `${Math.min((parseFloat(pos.accumulatedYield) / (pos.estimatedAPY ? parseFloat(pos.monDeployed) * pos.estimatedAPY / 100 : parseFloat(pos.monDeployed) * 0.1)) * 100, 100)}%`,
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 3s ease-in-out infinite, glow-pulse 2s ease-in-out infinite',
                          }}
                        />
                        {/* Flowing shine overlay */}
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-40"
                          style={{
                            animation: 'slide 2s ease-in-out infinite',
                            width: `${Math.min((parseFloat(pos.accumulatedYield) / (pos.estimatedAPY ? parseFloat(pos.monDeployed) * pos.estimatedAPY / 100 : parseFloat(pos.monDeployed) * 0.1)) * 100, 100)}%`,
                          }}
                        />
                        {/* Progress text */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                            {pos.estimatedAPY
                              ? `${Math.min((parseFloat(pos.accumulatedYield) / (parseFloat(pos.monDeployed) * pos.estimatedAPY / 100)) * 100, 100).toFixed(2)}%`
                              : '⏳ Accruing...'}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <p className="text-xs text-gray-500">0 MON</p>
                        <p className="text-xs font-medium text-blue-600">
                          🎯 Annual Target: {pos.estimatedAPY
                            ? `${(parseFloat(pos.monDeployed) * pos.estimatedAPY / 100).toFixed(4)} MON`
                            : 'Calculating...'}
                        </p>
                      </div>
                      {/* Real-time update indicator */}
                      <div className="flex items-center justify-center mt-2 gap-1">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                          pos.oracleSource === 'switchboard' ? 'bg-green-500' : 'bg-yellow-500'
                        }`}></div>
                        <p className="text-xs text-gray-500 italic">
                          {pos.oracleSource === 'switchboard'
                            ? 'Live APY via Switchboard Oracle'
                            : 'Estimated APY (Oracle connecting...)'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleUnstake(pos.positionId)}
                      disabled={isUnstaking === pos.positionId}
                      className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-2 rounded-lg hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 transition-all"
                    >
                      {isUnstaking === pos.positionId ? '⏳ Unstaking...' : '📤 Unstake & Claim Yield'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stakeTxHash && (
            <div className="text-center">
              <a
                href={`https://testnet.monadscan.com/tx/${stakeTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 hover:text-purple-700 underline text-sm"
              >
                View Transaction →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
