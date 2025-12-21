import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { musicBeatMatchConfig } from '../config/contracts';
import { Address } from 'viem';

export function useMusicBeatMatch() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetCurrentChallenge = () => {
    return useReadContract({
      ...musicBeatMatchConfig,
      functionName: 'getCurrentChallenge',
    });
  };

  const useGetChallenge = (challengeId: bigint) => {
    return useReadContract({
      ...musicBeatMatchConfig,
      functionName: 'getChallenge',
      args: [challengeId],
    });
  };

  const useGetPlayerStats = (player: Address) => {
    return useReadContract({
      ...musicBeatMatchConfig,
      functionName: 'getPlayerStats',
      args: [player],
    });
  };

  const useGetUserGuess = (challengeId: bigint, user: Address) => {
    return useReadContract({
      ...musicBeatMatchConfig,
      functionName: 'getUserGuess',
      args: [challengeId, user],
    });
  };

  const useHasPlayed = (player: Address, challengeId: bigint) => {
    return useReadContract({
      ...musicBeatMatchConfig,
      functionName: 'hasPlayed',
      args: [player, challengeId],
    });
  };

  const useGetChallengeStats = (challengeId: bigint) => {
    return useReadContract({
      ...musicBeatMatchConfig,
      functionName: 'getChallengeStats',
      args: [challengeId],
    });
  };

  const useGetContractBalance = () => {
    return useReadContract({
      ...musicBeatMatchConfig,
      functionName: 'getContractBalance',
    });
  };

  // Write functions
  const submitGuess = (challengeId: bigint, guessedArtistId: bigint, guessReason: string) => {
    writeContract({
      ...musicBeatMatchConfig,
      functionName: 'submitGuess',
      args: [challengeId, guessedArtistId, guessReason],
    });
  };

  const createDailyChallenge = (artistId: bigint, songTitle: string, spotifyUri: string) => {
    writeContract({
      ...musicBeatMatchConfig,
      functionName: 'createDailyChallenge',
      args: [artistId, songTitle, spotifyUri],
    });
  };

  const finalizeChallenge = (challengeId: bigint) => {
    writeContract({
      ...musicBeatMatchConfig,
      functionName: 'finalizeChallenge',
      args: [challengeId],
    });
  };

  const fundRewards = (amount: bigint) => {
    writeContract({
      ...musicBeatMatchConfig,
      functionName: 'fundRewards',
      args: [amount],
    });
  };

  return {
    // Read hooks
    useGetCurrentChallenge,
    useGetChallenge,
    useGetPlayerStats,
    useGetUserGuess,
    useHasPlayed,
    useGetChallengeStats,
    useGetContractBalance,

    // Write functions
    submitGuess,
    createDailyChallenge,
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
