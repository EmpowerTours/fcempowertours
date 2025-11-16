'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { ethers } from 'ethers';
import { calculateProjectedYield, formatYieldProjection } from '@/lib/switchboard-yield';

interface Passport {
  tokenId: string;
  countryCode: string;
  countryName: string;
  region: string;
  continent: string;
  mintedAt: string;
}

interface StakingPosition {
  positionId: string;
  nftAddress: string;
  nftTokenId: string;
  owner: string;
  beneficiary: string;
  depositTime: string;
  toursStaked: string;
  monDeployed: string;
  yieldDebt: string;
  active: boolean;
  accumulatedYield: string; // On-chain yield
  projectedYield?: string;   // Projected yield from Switchboard
  estimatedAPY?: number;      // Current APY estimate
  daysStaked?: number;        // Days since staking
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const YIELD_STRATEGY = process.env.NEXT_PUBLIC_YIELD_STRATEGY || '0x6863674C89faD0c7e3C0B406BA35182649eE216b';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';

const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT || '';
const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT || '';

// Minimal ABI for YieldStrategy V5 view functions
const YIELD_STRATEGY_ABI = [
  'function getUserPositions(address user) external view returns (uint256[])',
  'function getPosition(uint256 positionId) external view returns (tuple(address nftAddress, uint256 nftTokenId, address owner, address beneficiary, uint256 depositTime, uint256 toursStaked, uint256 monDeployed, uint256 yieldDebt, bool active))',
  'function accYieldPerShare() external view returns (uint256)',
];

export default function PassportStakingPage() {
  const { walletAddress } = useFarcasterContext();
  const [stakeAmount, setStakeAmount] = useState('');
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [passports, setPassports] = useState<Passport[]>([]);
  const [isLoadingPassports, setIsLoadingPassports] = useState(true);
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState<string | null>(null); // Tracks which position is being unstaked
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stakeTxHash, setStakeTxHash] = useState('');

  // Staking positions state
  const [stakingPositions, setStakingPositions] = useState<StakingPosition[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [totalStaked, setTotalStaked] = useState('0');
  const [totalYield, setTotalYield] = useState('0');

  // Global staking stats
  const [globalStaked, setGlobalStaked] = useState('0');
  const [globalStakers, setGlobalStakers] = useState(0);

  // Fetch global staking stats directly from contract
  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(MONAD_RPC);
        const contract = new ethers.Contract(YIELD_STRATEGY, YIELD_STRATEGY_ABI, provider);

        // Get total assets (total MON staked globally)
        const totalAssets = await contract.totalAssets();
        setGlobalStaked(ethers.formatUnits(totalAssets, 18));

        // Get total positions to estimate stakers (approximation)
        const positionCounter = await contract.positionCounter();
        setGlobalStakers(Number(positionCounter));

        console.log('📊 Global stats:', {
          totalStaked: ethers.formatUnits(totalAssets, 18),
          totalStakers: Number(positionCounter)
        });
      } catch (err) {
        console.error('Error fetching global stats:', err);
      }
    };

    fetchGlobalStats();

    // Refresh every 30 seconds
    const interval = setInterval(fetchGlobalStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch user's passports
  useEffect(() => {
    if (!walletAddress) {
      setIsLoadingPassports(false);
      return;
    }

    const fetchPassports = async () => {
      try {
        setIsLoadingPassports(true);
        const response = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetPassportsByOwner($owner: String!) {
                PassportNFT(where: { owner: { _eq: $owner } }) {
                  id
                  tokenId
                  countryCode
                  countryName
                  region
                  continent
                  mintedAt
                }
              }
            `,
            variables: { owner: walletAddress.toLowerCase() }
          })
        });

        const data = await response.json();
        if (data.data?.PassportNFT) {
          setPassports(data.data.PassportNFT);
        }
      } catch (err) {
        console.error('Error fetching passports:', err);
      } finally {
        setIsLoadingPassports(false);
      }
    };

    fetchPassports();
  }, [walletAddress]);

  // Fetch user's staking positions from YieldStrategy V5
  useEffect(() => {
    if (!walletAddress) {
      setIsLoadingPositions(false);
      return;
    }

    const fetchStakingPositions = async () => {
      try {
        setIsLoadingPositions(true);

        // Create provider and contract instance
        const provider = new ethers.JsonRpcProvider(MONAD_RPC);
        const contract = new ethers.Contract(YIELD_STRATEGY, YIELD_STRATEGY_ABI, provider);

        // Get user's position IDs
        const positionIds = await contract.getUserPositions(walletAddress);
        console.log('📊 Found position IDs:', positionIds);

        if (positionIds.length === 0) {
          setStakingPositions([]);
          setTotalStaked('0');
          setTotalYield('0');
          setIsLoadingPositions(false);
          return;
        }

        // Get global accYieldPerShare for yield calculations
        const accYieldPerShare = await contract.accYieldPerShare();
        console.log('📈 Global accYieldPerShare:', accYieldPerShare.toString());

        // Fetch each position and calculate accumulated yield
        const positions: StakingPosition[] = [];
        let totalStakedAmount = BigInt(0);
        let totalYieldAmount = BigInt(0);

        for (const positionId of positionIds) {
          const pos = await contract.getPosition(positionId);

          // Only include active positions
          if (!pos.active) continue;

          // Calculate accumulated yield: ((toursStaked * accYieldPerShare) / 1e18) - yieldDebt
          const toursStaked = BigInt(pos.toursStaked);
          const yieldDebt = BigInt(pos.yieldDebt);
          const accYield = BigInt(accYieldPerShare);

          const accumulatedYield = (toursStaked * accYield) / BigInt(1e18) - yieldDebt;

          // Calculate projected yield using Switchboard
          const projection = await calculateProjectedYield(
            BigInt(pos.monDeployed),
            BigInt(pos.depositTime),
            accumulatedYield
          );
          const formatted = formatYieldProjection(projection);

          positions.push({
            positionId: positionId.toString(),
            nftAddress: pos.nftAddress,
            nftTokenId: pos.nftTokenId.toString(),
            owner: pos.owner,
            beneficiary: pos.beneficiary,
            depositTime: pos.depositTime.toString(),
            toursStaked: ethers.formatUnits(pos.toursStaked, 18),
            monDeployed: ethers.formatUnits(pos.monDeployed, 18),
            yieldDebt: pos.yieldDebt.toString(),
            active: pos.active,
            accumulatedYield: ethers.formatUnits(accumulatedYield, 18),
            projectedYield: projection.projectedYield,
            estimatedAPY: projection.estimatedAPY,
            daysStaked: formatted.daysStaked,
          });

          totalStakedAmount += toursStaked;
          totalYieldAmount += accumulatedYield;
        }

        setStakingPositions(positions);
        setTotalStaked(ethers.formatUnits(totalStakedAmount, 18));
        setTotalYield(ethers.formatUnits(totalYieldAmount, 18));

        console.log('✅ Fetched staking positions:', positions);
      } catch (err) {
        console.error('Error fetching staking positions:', err);
      } finally {
        setIsLoadingPositions(false);
      }
    };

    fetchStakingPositions();

    // Refresh positions every 30 seconds to show yield accumulation
    const interval = setInterval(fetchStakingPositions, 30000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  const handleStake = async () => {
    if (!walletAddress || !selectedTokenId || !stakeAmount) {
      setError('Please select a passport and enter an amount');
      return;
    }

    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsStaking(true);
    setError('');
    setSuccess('');
    setStakeTxHash('');

    try {
      console.log(`🔄 Staking ${stakeAmount} MON with passport #${selectedTokenId}`);

      // Check for delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('stake_tours');

      if (!hasValidDelegation) {
        console.log('📝 Creating delegation...');
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
        console.log('✅ Delegation created');
      }

      setSuccess('⏳ Staking MON (FREE - we pay gas)...');

      // Execute stake via delegation API
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'stake_tours',
          params: {
            amount: stakeAmount
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Stake failed');
      }

      const { txHash, positionId } = await response.json();

      setStakeTxHash(txHash);
      setSuccess(`🎉 Successfully staked ${stakeAmount} MON!
Position ID: ${positionId}
Gasless - we paid the gas!`);
      setStakeAmount('');
      setSelectedTokenId('');

      // Refresh passports after a delay
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Failed to stake MON');
    } finally {
      setIsStaking(false);
    }
  };

  const handleUnstake = async (positionId: string) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }

    setIsUnstaking(positionId);
    setError('');
    setSuccess('');
    setStakeTxHash('');

    try {
      console.log(`🔄 Unstaking position #${positionId}`);

      // Check for delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('unstake_tours');

      if (!hasValidDelegation) {
        console.log('📝 Creating delegation with unstake permission...');
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
        console.log('✅ Delegation created');
      }

      setSuccess('⏳ Unstaking position (FREE - we pay gas)...');

      // Execute unstake via delegation API
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'unstake_tours',
          params: {
            positionId: positionId
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Unstake failed');
      }

      const { txHash } = await response.json();
      setStakeTxHash(txHash);
      setSuccess(`🎉 Position #${positionId} unstaked successfully!
Your MON + yield have been returned to your wallet.`);

      // Refresh positions after a delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Failed to unstake position');
    } finally {
      setIsUnstaking(null);
    }
  };

  if (isLoadingPassports) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-900">Loading your passports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🎫 Passport Staking</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Stake MON using your passport NFTs to earn rewards and build credit score
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-3 max-w-2xl mx-auto">
            <p className="text-red-700 text-sm">❌ {error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-lg p-3 max-w-2xl mx-auto">
            <p className="text-green-700 text-sm whitespace-pre-line">{success}</p>
            {stakeTxHash && (
              <a
                href={`https://testnet.monadscan.com/tx/${stakeTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-green-600 hover:text-green-800 underline text-sm font-mono"
              >
                🔗 View Transaction: {stakeTxHash.slice(0, 10)}...{stakeTxHash.slice(-8)}
              </a>
            )}
          </div>
        )}

        {!walletAddress ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">Connect your wallet to view your passports</p>
          </div>
        ) : passports.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600 mb-4">You don't have any passports yet</p>
            <button
              onClick={() => window.location.href = '/passport'}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Mint Your First Passport
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Global Staking Stats */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg shadow-lg p-6 border-2 border-purple-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">🌍 Global Staking Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 mb-1">Total Staked Globally</div>
                  <div className="text-3xl font-bold text-purple-600">
                    {parseFloat(globalStaked).toFixed(2)} MON
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Across all users in the ecosystem
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 mb-1">Total Stakers</div>
                  <div className="text-3xl font-bold text-pink-600">
                    {globalStakers.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Unique users staking right now
                  </div>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-600 text-center">
                📊 Stats update every 30 seconds
              </div>
            </div>

            {/* Yield Statistics Dashboard */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg shadow-lg p-6 border-2 border-green-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">💰 Staking Rewards Dashboard</h3>
              {isLoadingPositions ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading staking positions...</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Total Staked */}
                    <div className="bg-white rounded-lg p-4 shadow">
                      <div className="text-sm text-gray-600 mb-1">Total Staked</div>
                      <div className="text-2xl font-bold text-purple-600">
                        {parseFloat(totalStaked).toFixed(2)} MON
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Across {stakingPositions.length} active position{stakingPositions.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Total Yield Earned */}
                    <div className="bg-white rounded-lg p-4 shadow">
                      <div className="text-sm text-gray-600 mb-1">Total Yield Earned</div>
                      <div className="text-2xl font-bold text-green-600">
                        +{parseFloat(totalYield).toFixed(4)} MON
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Accumulating in real-time
                      </div>
                    </div>

                    {/* Yield Status */}
                    <div className="bg-white rounded-lg p-4 shadow">
                      <div className="text-sm text-gray-600 mb-1">Yield Status</div>
                      <div className="flex items-center gap-2">
                        {stakingPositions.length > 0 ? (
                          <>
                            <div className="animate-pulse">
                              <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                            </div>
                            <div className="text-lg font-semibold text-green-600">Earning</div>
                          </>
                        ) : (
                          <>
                            <div className="h-3 w-3 bg-gray-400 rounded-full"></div>
                            <div className="text-lg font-semibold text-gray-600">Inactive</div>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {stakingPositions.length > 0 ? 'Active staking positions' : 'Start staking to earn'}
                      </div>
                    </div>
                  </div>

                  {/* Yield Progress Bar - Animated with Projected Yield */}
                  <div className="mt-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">📈 Yield Accumulation Progress</span>
                      <span className="text-sm text-gray-600">
                        {stakingPositions.length > 0 ? 'Auto-refresh every 30s' : 'No active positions'}
                      </span>
                    </div>

                    {/* Calculate projected yield sum and target (1 week at 10% APY) */}
                    {(() => {
                      const projectedYieldSum = stakingPositions.reduce((sum, pos) =>
                        sum + parseFloat(pos.projectedYield || '0'), 0
                      );
                      const stakedAmount = parseFloat(totalStaked || '0');
                      // Target: 1 week of yield at 10% APY
                      const targetYield = (stakedAmount * 0.10 * 7) / 365.25;
                      const progressPercent = targetYield > 0
                        ? Math.min((projectedYieldSum / targetYield) * 100, 100)
                        : 0;

                      return (
                        <>
                          {/* Animated progress bar */}
                          <div className="relative w-full bg-gray-200 rounded-full h-8 overflow-hidden shadow-inner">
                            {stakingPositions.length > 0 ? (
                              <>
                                {/* Background animated gradient shimmer */}
                                <div
                                  className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-100/40 to-transparent"
                                  style={{
                                    animation: 'shimmer 3s ease-in-out infinite',
                                  }}
                                />

                                {/* Main progress fill - smoothly animates */}
                                <div
                                  className="relative h-8 bg-gradient-to-r from-green-400 via-emerald-500 to-blue-500 rounded-full flex items-center justify-between px-3 overflow-hidden"
                                  style={{
                                    width: `${Math.max(3, progressPercent)}%`,
                                    transition: 'width 2s cubic-bezier(0.4, 0, 0.2, 1)',
                                  }}
                                >
                                  {/* Flowing shimmer effect inside bar */}
                                  <div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                                    style={{
                                      animation: 'flow 2s linear infinite',
                                    }}
                                  />

                                  <span className="relative z-10 text-xs font-bold text-white drop-shadow">
                                    {progressPercent.toFixed(1)}%
                                  </span>

                                  {/* Pulsing dot at end */}
                                  <div className="relative z-10 animate-pulse">
                                    <div className="w-3 h-3 bg-white rounded-full shadow-lg"></div>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="h-8 bg-gray-300 rounded-full flex items-center justify-center">
                                <span className="text-xs text-gray-500 font-medium">No active stakes</span>
                              </div>
                            )}
                          </div>

                          <div className="flex justify-between mt-2 text-xs text-gray-600">
                            <span className="flex items-center gap-1">
                              {stakingPositions.length > 0 && (
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                              )}
                              <span className="font-medium">
                                {stakingPositions.length > 0
                                  ? `Projected: ~${projectedYieldSum.toFixed(6)} MON`
                                  : 'No stakes yet'}
                              </span>
                            </span>
                            <span className="font-mono text-gray-500">
                              {stakingPositions.length > 0 && `Target: ${targetYield.toFixed(6)} MON (7d)`}
                            </span>
                          </div>

                          {/* Progress info */}
                          {stakingPositions.length > 0 && (
                            <div className="mt-2 p-3 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
                              <div className="flex items-start gap-2">
                                <span className="text-lg">💡</span>
                                <div className="text-xs text-gray-700 leading-relaxed">
                                  <div className="font-semibold mb-1">Progress to weekly target ({progressPercent.toFixed(1)}%)</div>
                                  <div className="text-gray-600">
                                    Bar fills as projected yield approaches 1 week's earnings at 10% APY.
                                    Actual on-chain yield: <span className="font-mono text-green-600">+{parseFloat(totalYield).toFixed(6)} MON</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* CSS animations */}
                          <style jsx>{`
                            @keyframes shimmer {
                              0%, 100% { transform: translateX(-100%); opacity: 0; }
                              50% { transform: translateX(100%); opacity: 1; }
                            }
                            @keyframes flow {
                              0% { transform: translateX(-100%); }
                              100% { transform: translateX(100%); }
                            }
                          `}</style>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* How It Works */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-gray-700">
                  <strong>💡 How Yield Works:</strong> Your MON is deposited directly into Kintsu vault.
                  Yield is generated from MON staking and distributed as MON on unstake.
                  Your passport NFT stays in your wallet - no transfers needed! The Safe stakes on your behalf as the beneficiary.
                </div>
              </div>

              {/* Individual Staking Positions */}
              {stakingPositions.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-bold text-gray-900 mb-3">📊 Your Staking Positions</h4>
                  <div className="space-y-3">
                    {stakingPositions.map((position) => (
                      <div key={position.positionId} className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">Position #{position.positionId}</div>
                            <div className="text-xs text-gray-500">Passport NFT #{position.nftTokenId}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-purple-600">
                              {parseFloat(position.toursStaked).toFixed(2)} MON
                            </div>
                            <div className="text-xs text-gray-600">
                              <div className="text-green-600 font-semibold">
                                Actual: +{parseFloat(position.accumulatedYield).toFixed(6)} MON
                              </div>
                              {position.projectedYield && (
                                <div className="text-blue-600 font-medium">
                                  Projected: ~{parseFloat(position.projectedYield).toFixed(6)} MON
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Deposited: {new Date(parseInt(position.depositTime) * 1000).toLocaleDateString()}</span>
                            <span>Days: {position.daysStaked || 0}</span>
                          </div>
                          <div className="flex justify-between text-xs mb-3">
                            <span className="text-gray-600">
                              Est. APY: <span className="font-semibold text-blue-600">{position.estimatedAPY ? `${(position.estimatedAPY * 100).toFixed(2)}%` : 'N/A'}</span>
                            </span>
                            <span className="text-gray-600">
                              ROI: <span className="font-semibold text-green-600">{((parseFloat(position.accumulatedYield) / parseFloat(position.toursStaked)) * 100).toFixed(4)}%</span>
                            </span>
                          </div>
                          <button
                            onClick={() => handleUnstake(position.positionId)}
                            disabled={isUnstaking === position.positionId}
                            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold active:scale-95 touch-manipulation"
                          >
                            {isUnstaking === position.positionId ? '⏳ Unstaking...' : '💰 Unstake + Claim Yield (FREE)'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Passport List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {passports.map((passport) => (
                <div key={passport.tokenId} className="bg-white rounded-lg shadow-lg p-6">
                  <div className="text-center mb-4">
                    <div className="text-6xl mb-2">🎫</div>
                    <h3 className="text-xl font-bold">Passport #{passport.tokenId}</h3>
                    <p className="text-sm text-gray-600 mt-1">{passport.countryName}</p>
                    <p className="text-xs text-gray-500">{passport.region}</p>
                  </div>

                  <div className="mt-4 space-y-2">
                    <input
                      type="number"
                      placeholder="Amount to stake (e.g. 100)"
                      value={selectedTokenId === passport.tokenId ? stakeAmount : ''}
                      onChange={(e) => {
                        setSelectedTokenId(passport.tokenId);
                        setStakeAmount(e.target.value);
                      }}
                      disabled={isStaking}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    />
                    <button
                      onClick={handleStake}
                      disabled={isStaking || !stakeAmount || selectedTokenId !== passport.tokenId}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 touch-manipulation"
                    >
                      {isStaking ? '⏳ Staking...' : 'Stake MON (FREE)'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4">ℹ️ About Passport Staking</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>• Stake MON using your passport NFT as collateral</p>
                <p>• Earn yield from MON staking via Kintsu integration</p>
                <p>• Build your credit score by staking consistently</p>
                <p>• All transactions are gasless - we pay the gas!</p>
                <p>• Your passport NFT stays in your wallet - no transfers needed!</p>
                <p>• When you unstake, your MON (+ yield) are returned automatically</p>
                <p>• The Safe stakes on your behalf as the beneficiary</p>
              </div>
            </div>

            {/* Credit Score Formula */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4">📊 Credit Score Formula</h3>
              <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm">
                <div>Score = 100 (base)</div>
                <div className="ml-4">+ Staked MON (in whole units)</div>
                <div className="ml-4">+ (Stamps × 10)</div>
                <div className="ml-4">+ (Verified Stamps × 5)</div>
              </div>
              <p className="text-gray-600 text-sm mt-4">
                Stake more MON and collect more venue stamps to increase your credit score!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
