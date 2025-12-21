import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { yieldStrategyConfig } from '../config/contracts';

export function useYieldStrategy() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetStakedAmount = (user: Address) => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getStakedAmount',
      args: [user],
    });
  };

  const useGetPendingRewards = (user: Address) => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getPendingRewards',
      args: [user],
    });
  };

  const useGetTotalStaked = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getTotalStaked',
    });
  };

  const useGetAPY = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getAPY',
    });
  };

  // Write functions
  const stake = (amount: bigint) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'stake',
      args: [amount],
    });
  };

  const unstake = (amount: bigint) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'unstake',
      args: [amount],
    });
  };

  const claimRewards = () => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'claimRewards',
    });
  };

  return {
    // Read hooks
    useGetStakedAmount,
    useGetPendingRewards,
    useGetTotalStaked,
    useGetAPY,

    // Write functions
    stake,
    unstake,
    claimRewards,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
