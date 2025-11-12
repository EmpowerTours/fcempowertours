'use client';

import { useState } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export default function PassportStakingPage() {
  const { walletAddress } = useFarcasterContext();
  const [stakeAmount, setStakeAmount] = useState('');
  const [selectedTokenId, setSelectedTokenId] = useState('');

  // Mock data - replace with actual hook calls
  const passports = [
    { tokenId: '1', stakedAmount: '100', stampCount: 5, creditScore: 250 },
    { tokenId: '2', stakedAmount: '0', stampCount: 2, creditScore: 120 },
  ];

  const handleStake = async () => {
    // Implementation for staking
    console.log(`Staking ${stakeAmount} TOURS with passport #${selectedTokenId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🎫 Passport Staking</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Stake TOURS tokens using your passport NFTs to earn rewards and build credit score
          </p>
        </div>

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
            {/* Passport List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {passports.map((passport) => (
                <div key={passport.tokenId} className="bg-white rounded-lg shadow-lg p-6">
                  <div className="text-center mb-4">
                    <div className="text-6xl mb-2">🎫</div>
                    <h3 className="text-xl font-bold">Passport #{passport.tokenId}</h3>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Staked:</span>
                      <span className="font-semibold">{passport.stakedAmount} TOURS</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Stamps:</span>
                      <span className="font-semibold">{passport.stampCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Credit Score:</span>
                      <span className="font-semibold text-green-600">{passport.creditScore}</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <input
                      type="number"
                      placeholder="Amount to stake"
                      value={selectedTokenId === passport.tokenId ? stakeAmount : ''}
                      onChange={(e) => {
                        setSelectedTokenId(passport.tokenId);
                        setStakeAmount(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={handleStake}
                      disabled={!stakeAmount || selectedTokenId !== passport.tokenId}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Stake TOURS
                    </button>
                  </div>
                </div>
              ))}
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
