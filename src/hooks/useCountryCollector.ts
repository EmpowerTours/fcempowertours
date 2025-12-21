import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { countryCollectorConfig } from '../config/contracts';
import { Address } from 'viem';

export function useCountryCollector() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetCurrentChallenge = () => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'getCurrentChallenge',
    });
  };

  const useGetChallenge = (challengeId: bigint) => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'getChallenge',
      args: [challengeId],
    });
  };

  const useGetCollectorStats = (collector: Address) => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'getCollectorStats',
      args: [collector],
    });
  };

  const useGetUserBadges = (user: Address) => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'getUserBadges',
      args: [user],
    });
  };

  const useHasCountryBadge = (user: Address, countryCode: string) => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'hasCountryBadge',
      args: [user, countryCode],
    });
  };

  const useGetUserProgress = (challengeId: bigint, user: Address) => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'getUserProgress',
      args: [challengeId, user],
    });
  };

  const useGetCollectionProgress = (collector: Address) => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'getCollectionProgress',
      args: [collector],
    });
  };

  const useGetContractBalance = () => {
    return useReadContract({
      ...countryCollectorConfig,
      functionName: 'getContractBalance',
    });
  };

  // Write functions
  const completeArtist = (challengeId: bigint, artistId: bigint, passportTokenId: bigint) => {
    writeContract({
      ...countryCollectorConfig,
      functionName: 'completeArtist',
      args: [challengeId, artistId, passportTokenId],
    });
  };

  const createWeeklyChallenge = (
    name: string,
    countryCode: string,
    artistIds: [bigint, bigint, bigint]
  ) => {
    writeContract({
      ...countryCollectorConfig,
      functionName: 'createWeeklyChallenge',
      args: [name, countryCode, artistIds],
    });
  };

  const finalizeChallenge = (challengeId: bigint) => {
    writeContract({
      ...countryCollectorConfig,
      functionName: 'finalizeChallenge',
      args: [challengeId],
    });
  };

  const fundRewards = (amount: bigint) => {
    writeContract({
      ...countryCollectorConfig,
      functionName: 'fundRewards',
      args: [amount],
    });
  };

  return {
    // Read hooks
    useGetCurrentChallenge,
    useGetChallenge,
    useGetCollectorStats,
    useGetUserBadges,
    useHasCountryBadge,
    useGetUserProgress,
    useGetCollectionProgress,
    useGetContractBalance,

    // Write functions
    completeArtist,
    createWeeklyChallenge,
    finalizeChallenge,
    fundRewards,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
