'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface Passport {
  tokenId: string;
  countryCode: string;
  countryName: string;
  region: string;
  continent: string;
  mintedAt: string;
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT || '';
const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT || '';

export default function PassportStakingPage() {
  const { walletAddress } = useFarcasterContext();
  const [stakeAmount, setStakeAmount] = useState('');
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [passports, setPassports] = useState<Passport[]>([]);
  const [isLoadingPassports, setIsLoadingPassports] = useState(true);
  const [isStaking, setIsStaking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stakeTxHash, setStakeTxHash] = useState('');

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
      console.log(`🔄 Staking ${stakeAmount} TOURS with passport #${selectedTokenId}`);

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
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
        console.log('✅ Delegation created');
      }

      setSuccess('⏳ Staking TOURS (FREE - we pay gas)...');

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
      setSuccess(`🎉 Successfully staked ${stakeAmount} TOURS!
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
      setError(err.message || 'Failed to stake TOURS');
    } finally {
      setIsStaking(false);
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
            Stake TOURS tokens using your passport NFTs to earn rewards and build credit score
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
                href={`https://explorer.monad.xyz/tx/${stakeTxHash}`}
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
            {/* Yield Statistics Dashboard */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg shadow-lg p-6 border-2 border-green-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">💰 Staking Rewards Dashboard</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Staked */}
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 mb-1">Total Staked</div>
                  <div className="text-2xl font-bold text-purple-600">
                    {passports.reduce((sum) => sum, 0)} TOURS
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Across {passports.length} passport{passports.length !== 1 ? 's' : ''}</div>
                </div>

                {/* Estimated APY */}
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 mb-1">Estimated APY</div>
                  <div className="text-2xl font-bold text-green-600">5-15%</div>
                  <div className="text-xs text-gray-500 mt-1">Based on MON staking via Kintsu</div>
                </div>

                {/* Yield Status */}
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 mb-1">Yield Status</div>
                  <div className="flex items-center gap-2">
                    <div className="animate-pulse">
                      <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                    </div>
                    <div className="text-lg font-semibold text-green-600">Earning</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {stakeTxHash ? 'Active staking position' : 'Start staking to earn'}
                  </div>
                </div>
              </div>

              {/* Yield Progress Bar */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">📈 Yield Accumulation</span>
                  <span className="text-sm text-gray-600">Updated every block</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 bg-gradient-to-r from-green-400 to-blue-500 rounded-full animate-pulse"
                    style={{ width: '45%' }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-600">
                  <span>Staking active</span>
                  <span>Rewards compounding automatically</span>
                </div>
              </div>

              {/* How It Works */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-gray-700">
                  <strong>💡 How Yield Works:</strong> Your TOURS tokens are swapped to MON and staked via Kintsu integration.
                  Yield is generated from MON staking, converted back to TOURS, and distributed on unstake.
                  Your passport NFT stays in your wallet - no transfers needed! The Safe stakes on your behalf as the beneficiary.
                </div>
              </div>
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
                      {isStaking ? '⏳ Staking...' : 'Stake TOURS (FREE)'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4">ℹ️ About Passport Staking</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>• Stake TOURS tokens using your passport NFT as collateral</p>
                <p>• Earn yield from MON staking via Kintsu integration</p>
                <p>• Build your credit score by staking consistently</p>
                <p>• All transactions are gasless - we pay the gas!</p>
                <p>• Your passport NFT stays in your wallet - no transfers needed!</p>
                <p>• When you unstake, your TOURS (+ yield) are returned automatically</p>
                <p>• The Safe stakes on your behalf as the beneficiary</p>
              </div>
            </div>

            {/* Credit Score Formula */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4">📊 Credit Score Formula</h3>
              <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm">
                <div>Score = 100 (base)</div>
                <div className="ml-4">+ Staked TOURS (in whole units)</div>
                <div className="ml-4">+ (Stamps × 10)</div>
                <div className="ml-4">+ (Verified Stamps × 5)</div>
              </div>
              <p className="text-gray-600 text-sm mt-4">
                Stake more TOURS and collect more venue stamps to increase your credit score!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
