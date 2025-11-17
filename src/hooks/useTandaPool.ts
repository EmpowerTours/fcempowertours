import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { tandaPoolConfig } from '../config/contracts';
import { Address } from 'viem';

export enum PoolType {
  FIXED = 0,
  ROTATING = 1,
  WEIGHTED = 2,
}

export function useTandaPool() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetPool = (poolId: bigint) => {
    return useReadContract({
      ...tandaPoolConfig,
      functionName: 'getPool',
      args: [poolId],
    });
  };

  const useGetPoolMembers = (poolId: bigint) => {
    return useReadContract({
      ...tandaPoolConfig,
      functionName: 'getPoolMembers',
      args: [poolId],
    });
  };

  const useGetMember = (poolId: bigint, memberAddress: Address) => {
    return useReadContract({
      ...tandaPoolConfig,
      functionName: 'getMember',
      args: [poolId, memberAddress],
    });
  };

  const useGetPoolStats = (poolId: bigint) => {
    return useReadContract({
      ...tandaPoolConfig,
      functionName: 'getPoolStats',
      args: [poolId],
    });
  };

  const useCanClaim = (poolId: bigint, member: Address) => {
    return useReadContract({
      ...tandaPoolConfig,
      functionName: 'canClaim',
      args: [poolId, member],
    });
  };

  const useGetCurrentRoundRecipient = (poolId: bigint) => {
    return useReadContract({
      ...tandaPoolConfig,
      functionName: 'getCurrentRoundRecipient',
      args: [poolId],
    });
  };

  const useGetContractBalance = () => {
    return useReadContract({
      ...tandaPoolConfig,
      functionName: 'getContractBalance',
    });
  };

  // Write functions
  const createPool = (
    name: string,
    contributionAmount: bigint,
    maxMembers: bigint,
    roundDuration: bigint,
    poolType: PoolType
  ) => {
    writeContract({
      ...tandaPoolConfig,
      functionName: 'createPool',
      args: [name, contributionAmount, maxMembers, roundDuration, poolType],
    });
  };

  const joinPool = (poolId: bigint) => {
    writeContract({
      ...tandaPoolConfig,
      functionName: 'joinPool',
      args: [poolId],
    });
  };

  const claimPayout = (poolId: bigint) => {
    writeContract({
      ...tandaPoolConfig,
      functionName: 'claimPayout',
      args: [poolId],
    });
  };

  const cancelPool = (poolId: bigint, reason: string) => {
    writeContract({
      ...tandaPoolConfig,
      functionName: 'cancelPool',
      args: [poolId, reason],
    });
  };

  const setRoundDuration = (poolId: bigint, newDuration: bigint) => {
    writeContract({
      ...tandaPoolConfig,
      functionName: 'setRoundDuration',
      args: [poolId, newDuration],
    });
  };

  const emergencyWithdraw = (poolId: bigint) => {
    writeContract({
      ...tandaPoolConfig,
      functionName: 'emergencyWithdraw',
      args: [poolId],
    });
  };

  return {
    // Read hooks
    useGetPool,
    useGetPoolMembers,
    useGetMember,
    useGetPoolStats,
    useCanClaim,
    useGetCurrentRoundRecipient,
    useGetContractBalance,

    // Write functions
    createPool,
    joinPool,
    claimPayout,
    cancelPool,
    setRoundDuration,
    emergencyWithdraw,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
