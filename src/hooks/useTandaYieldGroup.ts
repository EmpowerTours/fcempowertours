import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { tandaYieldGroupConfig } from '../config/contracts';

export function useTandaYieldGroup() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetGroup = (groupId: bigint) => {
    return useReadContract({
      ...tandaYieldGroupConfig,
      functionName: 'getGroup',
      args: [groupId],
    });
  };

  const useGetMemberContributions = (groupId: bigint, member: Address) => {
    return useReadContract({
      ...tandaYieldGroupConfig,
      functionName: 'getMemberContributions',
      args: [groupId, member],
    });
  };

  const useGetGroupMembers = (groupId: bigint) => {
    return useReadContract({
      ...tandaYieldGroupConfig,
      functionName: 'getGroupMembers',
      args: [groupId],
    });
  };

  // Write functions
  const createGroup = (
    name: string,
    contributionAmount: bigint,
    frequency: bigint,
    maxMembers: bigint
  ) => {
    writeContract({
      ...tandaYieldGroupConfig,
      functionName: 'createGroup',
      args: [name, contributionAmount, frequency, maxMembers],
    });
  };

  const joinGroup = (groupId: bigint) => {
    writeContract({
      ...tandaYieldGroupConfig,
      functionName: 'joinGroup',
      args: [groupId],
    });
  };

  const contribute = (groupId: bigint) => {
    writeContract({
      ...tandaYieldGroupConfig,
      functionName: 'contribute',
      args: [groupId],
    });
  };

  const claimPayout = (groupId: bigint) => {
    writeContract({
      ...tandaYieldGroupConfig,
      functionName: 'claimPayout',
      args: [groupId],
    });
  };

  const leaveGroup = (groupId: bigint) => {
    writeContract({
      ...tandaYieldGroupConfig,
      functionName: 'leaveGroup',
      args: [groupId],
    });
  };

  return {
    // Read hooks
    useGetGroup,
    useGetMemberContributions,
    useGetGroupMembers,

    // Write functions
    createGroup,
    joinGroup,
    contribute,
    claimPayout,
    leaveGroup,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
