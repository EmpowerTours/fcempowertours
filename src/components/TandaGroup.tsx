'use client';

import { useState } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTandaYieldGroup } from '../hooks/useTandaYieldGroup';
import { toast } from 'sonner';
import { parseUnits, formatUnits } from 'viem';

interface Group {
  name: string;
  contributionAmount: bigint;
  frequency: bigint;
  maxMembers: bigint;
  currentMembers: bigint;
  totalPool: bigint;
  currentRound: bigint;
  isActive: boolean;
}

export function TandaGroup() {
  const { walletAddress } = useFarcasterContext();
  const {
    createGroup,
    joinGroup,
    contribute,
    claimPayout,
    isPending,
    isConfirming,
    useGetGroup,
    useGetGroupMembers,
  } = useTandaYieldGroup();

  const [groupId, setGroupId] = useState<bigint>(0n);
  const [createGroupForm, setCreateGroupForm] = useState({
    name: '',
    contributionAmount: '',
    frequency: '',
    maxMembers: '',
  });

  const { data: groupData } = useGetGroup(groupId);
  const { data: members } = useGetGroupMembers(groupId);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    // Validate form
    if (!createGroupForm.name || !createGroupForm.contributionAmount || !createGroupForm.frequency || !createGroupForm.maxMembers) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      toast.loading('Creating Tanda group...');

      // Call delegation API for gasless group creation
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'create_tanda_group',
          params: {
            name: createGroupForm.name,
            contributionAmount: createGroupForm.contributionAmount,
            frequency: createGroupForm.frequency,
            maxMembers: createGroupForm.maxMembers
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Group creation failed');
      }

      toast.dismiss();
      toast.success(`Created group "${createGroupForm.name}"! (Gasless)`);
      setCreateGroupForm({ name: '', contributionAmount: '', frequency: '', maxMembers: '' });
    } catch (error: any) {
      console.error('Error creating group:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to create group');
    }
  };

  const handleJoinGroup = async () => {
    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      toast.loading('Joining group...');

      // Call delegation API for gasless group joining
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'join_tanda_group',
          params: {
            groupId: groupId.toString()
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Joining group failed');
      }

      toast.dismiss();
      toast.success(`Joined group #${groupId}! (Gasless)`);
    } catch (error: any) {
      console.error('Error joining group:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to join group');
    }
  };

  const handleContribute = async () => {
    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      toast.loading('Contributing to group...');

      // Call delegation API for gasless contribution
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'contribute_tanda',
          params: {
            groupId: groupId.toString()
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Contribution failed');
      }

      toast.dismiss();
      toast.success(`Contributed to group #${groupId}! (Gasless)`);
    } catch (error: any) {
      console.error('Error contributing:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to contribute');
    }
  };

  const handleClaimPayout = async () => {
    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      toast.loading('Claiming payout...');

      // Call delegation API for gasless payout claim
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'claim_tanda_payout',
          params: {
            groupId: groupId.toString()
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Claiming payout failed');
      }

      toast.dismiss();
      toast.success(`Claimed payout from group #${groupId}! (Gasless)`);
    } catch (error: any) {
      console.error('Error claiming payout:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to claim payout');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Tanda Yield Groups</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Create Group */}
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">Create New Tanda Group</h3>

          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Group Name</label>
              <Input
                type="text"
                value={createGroupForm.name}
                onChange={(e) => setCreateGroupForm({ ...createGroupForm, name: e.target.value })}
                placeholder="My Tanda Group"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Contribution Amount (TOURS)</label>
              <Input
                type="number"
                step="0.000001"
                value={createGroupForm.contributionAmount}
                onChange={(e) => setCreateGroupForm({ ...createGroupForm, contributionAmount: e.target.value })}
                placeholder="100"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Frequency (days)</label>
              <Input
                type="number"
                value={createGroupForm.frequency}
                onChange={(e) => setCreateGroupForm({ ...createGroupForm, frequency: e.target.value })}
                placeholder="30"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Max Members</label>
              <Input
                type="number"
                value={createGroupForm.maxMembers}
                onChange={(e) => setCreateGroupForm({ ...createGroupForm, maxMembers: e.target.value })}
                placeholder="10"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={
                !walletAddress ||
                !createGroupForm.name ||
                !createGroupForm.contributionAmount ||
                !createGroupForm.frequency ||
                !createGroupForm.maxMembers ||
                isPending ||
                isConfirming
              }
              className="w-full"
            >
              {isPending || isConfirming ? 'Creating...' : 'Create Group'}
            </Button>
          </form>
        </Card>

        {/* View Group */}
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">View Group Details</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Group ID</label>
              <Input
                type="number"
                value={groupId.toString()}
                onChange={(e) => setGroupId(e.target.value ? BigInt(e.target.value) : 0n)}
                placeholder="0"
              />
            </div>

            {groupData ? (
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{(groupData as Group).name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Contribution:</span>
                  <span className="font-medium">
                    {formatUnits((groupData as Group).contributionAmount, 18)} TOURS
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Members:</span>
                  <span className="font-medium">
                    {(groupData as Group).currentMembers.toString()}/{(groupData as Group).maxMembers.toString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Pool:</span>
                  <span className="font-medium">
                    {formatUnits((groupData as Group).totalPool, 18)} TOURS
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Round:</span>
                  <span className="font-medium">{(groupData as Group).currentRound.toString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-medium ${(groupData as Group).isActive ? 'text-green-600' : 'text-red-600'}`}>
                    {(groupData as Group).isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleJoinGroup}
                disabled={!walletAddress || isPending || isConfirming}
                variant="outline"
              >
                Join Group
              </Button>
              <Button
                onClick={handleContribute}
                disabled={!walletAddress || isPending || isConfirming}
              >
                Contribute
              </Button>
            </div>

            <Button
              onClick={handleClaimPayout}
              disabled={!walletAddress || isPending || isConfirming}
              className="w-full"
              variant="outline"
            >
              Claim Payout
            </Button>
          </div>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">What are Tanda Groups?</h3>
        <p className="text-gray-600 mb-4">
          Tanda (also known as ROSCA - Rotating Savings and Credit Association) is a traditional
          savings system where members contribute regularly, and each member takes turns receiving
          the total pool. Combined with yield generation, your contributions grow over time!
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl mb-2">🤝</div>
            <div className="font-medium">Collaborative</div>
            <div className="text-sm text-gray-600">Save together</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl mb-2">📈</div>
            <div className="font-medium">Yield Earning</div>
            <div className="text-sm text-gray-600">Grow your funds</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl mb-2">🔄</div>
            <div className="font-medium">Rotating</div>
            <div className="text-sm text-gray-600">Fair distribution</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
