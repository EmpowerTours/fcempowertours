import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { demandSignalEngineConfig } from '../config/contracts';

export function useDemandSignalEngine() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetDemandSignal = (eventId: bigint) => {
    return useReadContract({
      ...demandSignalEngineConfig,
      functionName: 'getDemandSignal',
      args: [eventId],
    });
  };

  const useGetUserDemand = (user: Address, eventId: bigint) => {
    return useReadContract({
      ...demandSignalEngineConfig,
      functionName: 'getUserDemand',
      args: [user, eventId],
    });
  };

  const useGetTopEvents = (limit: bigint) => {
    return useReadContract({
      ...demandSignalEngineConfig,
      functionName: 'getTopEvents',
      args: [limit],
    });
  };

  // Write functions
  const submitDemand = (eventId: bigint, demandAmount: bigint) => {
    writeContract({
      ...demandSignalEngineConfig,
      functionName: 'submitDemand',
      args: [eventId, demandAmount],
    });
  };

  const withdrawDemand = (eventId: bigint) => {
    writeContract({
      ...demandSignalEngineConfig,
      functionName: 'withdrawDemand',
      args: [eventId],
    });
  };

  return {
    // Read hooks
    useGetDemandSignal,
    useGetUserDemand,
    useGetTopEvents,

    // Write functions
    submitDemand,
    withdrawDemand,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
