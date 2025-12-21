import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { creditScoreCalculatorConfig } from '../config/contracts';

export function useCreditScoreCalculator() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useCalculateScore = (user: Address) => {
    return useReadContract({
      ...creditScoreCalculatorConfig,
      functionName: 'calculateScore',
      args: [user],
    });
  };

  const useGetScore = (user: Address) => {
    return useReadContract({
      ...creditScoreCalculatorConfig,
      functionName: 'getScore',
      args: [user],
    });
  };

  const useGetScoreBreakdown = (user: Address) => {
    return useReadContract({
      ...creditScoreCalculatorConfig,
      functionName: 'getScoreBreakdown',
      args: [user],
    });
  };

  const useGetScoreTier = (user: Address) => {
    return useReadContract({
      ...creditScoreCalculatorConfig,
      functionName: 'getScoreTier',
      args: [user],
    });
  };

  // Write functions
  const updateScore = (user: Address) => {
    writeContract({
      ...creditScoreCalculatorConfig,
      functionName: 'updateScore',
      args: [user],
    });
  };

  const recordPayment = (user: Address, amount: bigint, onTime: boolean) => {
    writeContract({
      ...creditScoreCalculatorConfig,
      functionName: 'recordPayment',
      args: [user, amount, onTime],
    });
  };

  const recordEventAttendance = (user: Address, eventId: bigint) => {
    writeContract({
      ...creditScoreCalculatorConfig,
      functionName: 'recordEventAttendance',
      args: [user, eventId],
    });
  };

  return {
    // Read hooks
    useCalculateScore,
    useGetScore,
    useGetScoreBreakdown,
    useGetScoreTier,

    // Write functions
    updateScore,
    recordPayment,
    recordEventAttendance,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
