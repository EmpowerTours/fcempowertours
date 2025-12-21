// @ts-nocheck
'use client';

import { useState } from 'react';
import { useTandaPool, PoolType } from '@/src/hooks';
import { useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export function TandaPoolManager() {
  const { address } = useAccount();
  const { walletAddress } = useFarcasterContext();
  const effectiveAddress = (address || walletAddress) as `0x${string}` | undefined;
  const [activeTab, setActiveTab] = useState<'browse' | 'create' | 'my-pools'>('browse');
  const [poolId, setPoolId] = useState<string>('');

  const {
    useGetPool,
    useGetPoolMembers,
    useGetPoolStats,
  } = useTandaPool();

  // Form state for creating pool
  const [poolName, setPoolName] = useState('');
  const [contribution, setContribution] = useState('');
  const [maxMembers, setMaxMembers] = useState('');
  const [roundDuration, setRoundDuration] = useState('7'); // days
  const [selectedPoolType, setSelectedPoolType] = useState<PoolType>(PoolType.ROTATING);

  const { data: pool } = useGetPool(poolId ? BigInt(poolId) : BigInt(0));
  const { data: poolMembers } = useGetPoolMembers(poolId ? BigInt(poolId) : BigInt(0));
  const { data: poolStats } = useGetPoolStats(poolId ? BigInt(poolId) : BigInt(0));

  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleCreatePool = async () => {
    if (!effectiveAddress || !poolName || !contribution || !maxMembers || !roundDuration) {
      setErrorMsg('Please fill all fields and connect wallet');
      return;
    }

    setIsCreating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const roundDurationSeconds = parseInt(roundDuration) * 24 * 60 * 60;

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'create_tanda_group',
          params: {
            name: poolName,
            contributionAmount: contribution,
            frequency: roundDurationSeconds,
            maxMembers: parseInt(maxMembers),
          }
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create pool');
      }

      setSuccessMsg(`Pool "${poolName}" created successfully! (Gasless transaction)`);
      setPoolName('');
      setContribution('');
      setMaxMembers('');
      setRoundDuration('7');
    } catch (error: any) {
      console.error('Create pool error:', error);
      setErrorMsg(error.message || 'Failed to create pool');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinPool = async () => {
    if (!effectiveAddress || !poolId) return;

    setIsJoining(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'join_tanda_group',
          params: {
            groupId: poolId,
          }
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to join pool');
      }

      setSuccessMsg(`Joined pool #${poolId} successfully! (Gasless transaction)`);
    } catch (error: any) {
      console.error('Join pool error:', error);
      setErrorMsg(error.message || 'Failed to join pool');
    } finally {
      setIsJoining(false);
    }
  };

  const handleClaimPayout = async () => {
    if (!effectiveAddress || !poolId) return;

    setIsClaiming(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'claim_tanda_payout',
          params: {
            groupId: poolId,
          }
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to claim payout');
      }

      setSuccessMsg(`Payout from pool #${poolId} claimed successfully! (Gasless transaction)`);
    } catch (error: any) {
      console.error('Claim payout error:', error);
      setErrorMsg(error.message || 'Failed to claim payout');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Error/Success Messages */}
      {errorMsg && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-200">❌ {errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
          <p className="text-green-200">✅ {successMsg}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-white/10 rounded-lg">
        <TabButton
          active={activeTab === 'browse'}
          onClick={() => setActiveTab('browse')}
        >
          🔍 Browse Pools
        </TabButton>
        <TabButton
          active={activeTab === 'create'}
          onClick={() => setActiveTab('create')}
        >
          ➕ Create Pool
        </TabButton>
        <TabButton
          active={activeTab === 'my-pools'}
          onClick={() => setActiveTab('my-pools')}
        >
          💼 My Pools
        </TabButton>
      </div>

      {/* Browse Pools */}
      {activeTab === 'browse' && (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Browse & Join Pools</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-white font-semibold mb-2">Pool ID</label>
              <input
                type="number"
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                placeholder="Enter pool ID to view details"
                className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50"
              />
            </div>

            {pool && poolId && (
              <div className="bg-black/30 rounded-xl p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">{(pool as any).name}</h3>
                    <div className="flex gap-4 text-sm">
                      <span className="text-blue-300">
                        Type: {['Fixed', 'Rotating', 'Weighted'][(pool as any).poolType]}
                      </span>
                      <span className="text-green-300">
                        Status: {['Pending', 'Active', 'Completed', 'Cancelled'][(pool as any).status]}
                      </span>
                    </div>
                  </div>
                  <div className="bg-purple-500/30 px-4 py-2 rounded-lg">
                    <span className="text-white font-semibold">Pool #{poolId}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <InfoCard label="Contribution" value={`${formatEther((pool as any).contributionAmount)} TOURS`} />
                  <InfoCard label="Members" value={`${(pool as any).memberCount}/${(pool as any).maxMembers}`} />
                  <InfoCard label="Current Round" value={(pool as any).currentRound.toString()} />
                  <InfoCard label="Total Pool" value={`${formatEther((pool as any).totalPool)} TOURS`} />
                </div>

                {poolMembers && poolMembers.length > 0 && (
                  <div>
                    <h4 className="text-white font-semibold mb-2">Members ({poolMembers.length})</h4>
                    <div className="bg-white/5 rounded-lg p-4 max-h-40 overflow-y-auto">
                      {poolMembers.map((member, idx) => (
                        <div key={idx} className="text-blue-200 text-sm py-1 font-mono">
                          {member.slice(0, 6)}...{member.slice(-4)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(pool as any).status === 1 && Number((pool as any).memberCount) < Number((pool as any).maxMembers) && (
                  <button
                    onClick={handleJoinPool}
                    disabled={isJoining}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    {isJoining ? '⏳ Joining (Gasless)...' : '🤝 Join This Pool (FREE)'}
                  </button>
                )}

                {(pool as any).status === 1 && (
                  <button
                    onClick={handleClaimPayout}
                    disabled={isClaiming}
                    className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    {isClaiming ? '⏳ Claiming (Gasless)...' : '💰 Claim Payout (FREE)'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Pool */}
      {activeTab === 'create' && (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Create New Pool</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-white font-semibold mb-2">Pool Name</label>
              <input
                type="text"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                placeholder="e.g., Weekend Savers Pool"
                className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white font-semibold mb-2">Contribution (TOURS)</label>
                <input
                  type="number"
                  value={contribution}
                  onChange={(e) => setContribution(e.target.value)}
                  placeholder="100"
                  className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50"
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">Max Members</label>
                <input
                  type="number"
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                  placeholder="10"
                  className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">Round Duration (days)</label>
              <input
                type="number"
                value={roundDuration}
                onChange={(e) => setRoundDuration(e.target.value)}
                placeholder="7"
                className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">Pool Type</label>
              <div className="grid grid-cols-3 gap-4">
                <PoolTypeCard
                  type={PoolType.FIXED}
                  name="Fixed"
                  description="Fixed order payouts"
                  selected={selectedPoolType === PoolType.FIXED}
                  onClick={() => setSelectedPoolType(PoolType.FIXED)}
                />
                <PoolTypeCard
                  type={PoolType.ROTATING}
                  name="Rotating"
                  description="Rotating recipients"
                  selected={selectedPoolType === PoolType.ROTATING}
                  onClick={() => setSelectedPoolType(PoolType.ROTATING)}
                />
                <PoolTypeCard
                  type={PoolType.WEIGHTED}
                  name="Weighted"
                  description="Credit-weighted"
                  selected={selectedPoolType === PoolType.WEIGHTED}
                  onClick={() => setSelectedPoolType(PoolType.WEIGHTED)}
                />
              </div>
            </div>

            <button
              onClick={handleCreatePool}
              disabled={isCreating || !poolName || !contribution || !maxMembers}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all"
            >
              {isCreating ? '⏳ Creating Pool (Gasless)...' : '➕ Create Pool (FREE)'}
            </button>
          </div>
        </div>
      )}

      {/* My Pools */}
      {activeTab === 'my-pools' && (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">My Pools</h2>
          <p className="text-blue-200">
            Enter a pool ID above to view your participation details
          </p>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
        active
          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
          : 'text-white/70 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-blue-300 text-sm mb-1">{label}</div>
      <div className="text-white font-bold">{value}</div>
    </div>
  );
}

function PoolTypeCard({
  type,
  name,
  description,
  selected,
  onClick,
}: {
  type: PoolType;
  name: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border-2 transition-all ${
        selected
          ? 'bg-purple-500/30 border-purple-500'
          : 'bg-white/5 border-white/20 hover:border-white/40'
      }`}
    >
      <div className="text-white font-bold mb-1">{name}</div>
      <div className="text-blue-200 text-xs">{description}</div>
    </button>
  );
}
