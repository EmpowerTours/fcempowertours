import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { yieldStrategyConfig } from '../config/contracts';

// Position states enum matching contract
export enum PositionState {
  Active = 0,
  PendingWithdrawal = 1,
  Closed = 2,
}

// Types matching contract structs
export interface UnlockRequestInfo {
  kintsuUnlockIndex: bigint;
  shares: bigint;
  expectedSpotValue: bigint;
  requestTime: number;
  exists: boolean;
}

export interface StakingPosition {
  nftAddress: Address;
  nftTokenId: bigint;
  owner: Address;
  beneficiary: Address;
  depositTime: bigint;
  monStaked: bigint;
  kintsuShares: bigint;
  yieldDebt: bigint;
  state: PositionState;
  unlockRequest: UnlockRequestInfo;
}

export function useYieldStrategyV9() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // ============================================
  // Read Functions
  // ============================================

  const useGetPosition = (positionId: bigint) => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getPosition',
      args: [positionId],
    });
  };

  const useGetUserPositions = (user: Address) => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getUserPositions',
      args: [user],
    });
  };

  const useGetPositionState = (positionId: bigint) => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getPositionState',
      args: [positionId],
    });
  };

  const useCanFinalizeUnstake = (positionId: bigint) => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'canFinalizeUnstake',
      args: [positionId],
    });
  };

  const useGetPortfolioValue = (user: Address) => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getPortfolioValue',
      args: [user],
    });
  };

  const useGetKintsuBalance = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getKintsuBalance',
    });
  };

  const useGetTotalAssets = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getTotalAssets',
    });
  };

  const useGetActivePositionCount = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getActivePositionCount',
    });
  };

  const useGetPendingWithdrawalCount = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'getPendingWithdrawalCount',
    });
  };

  // Global stats
  const useTotalMonStaked = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'totalMonStaked',
    });
  };

  const useTotalYieldHarvested = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'totalYieldHarvested',
    });
  };

  const useAccYieldPerShare = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'accYieldPerShare',
    });
  };

  const useEstimatedCooldownPeriod = () => {
    return useReadContract({
      ...yieldStrategyConfig,
      functionName: 'ESTIMATED_COOLDOWN_PERIOD',
    });
  };

  // ============================================
  // Write Functions
  // ============================================

  /**
   * Stake MON with NFT collateral
   * @param nftAddress The whitelisted NFT contract address
   * @param nftTokenId The NFT token ID
   * @param beneficiary Address that owns the NFT
   * @param monAmount Amount of MON to stake (in wei)
   */
  const stakeWithDeposit = (
    nftAddress: Address,
    nftTokenId: bigint,
    beneficiary: Address,
    monAmount: bigint
  ) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'stakeWithDeposit',
      args: [nftAddress, nftTokenId, beneficiary],
      value: monAmount,
    });
  };

  /**
   * Request unstaking (Step 1 of 2)
   * @param positionId The position ID to unstake
   */
  const requestUnstake = (positionId: bigint) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'requestUnstake',
      args: [positionId],
    });
  };

  /**
   * Cancel pending unstake request
   * @param positionId The position ID to cancel
   */
  const cancelUnstake = (positionId: bigint) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'cancelUnstake',
      args: [positionId],
    });
  };

  /**
   * Finalize unstaking and claim rewards (Step 2 of 2)
   * @param positionId The position ID to finalize
   */
  const finalizeUnstake = (positionId: bigint) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'finalizeUnstake',
      args: [positionId],
    });
  };

  // ============================================
  // Keeper Functions (Admin only)
  // ============================================

  const harvest = () => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'harvest',
    });
  };

  const withdrawYield = (yieldAmount: bigint) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'withdrawYield',
      args: [yieldAmount],
    });
  };

  const redeemYield = (unlockIndex: bigint) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'redeemYield',
      args: [unlockIndex],
    });
  };

  const convertAndAllocateYield = (monAmount: bigint, location: string) => {
    writeContract({
      ...yieldStrategyConfig,
      functionName: 'convertAndAllocateYield',
      args: [monAmount, location],
    });
  };

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Calculate estimated time when unstake can be finalized
   * @param requestTime Unix timestamp when unstake was requested
   * @param cooldownPeriod Cooldown period in seconds
   * @returns Estimated ready time as Unix timestamp
   */
  const getEstimatedReadyTime = (requestTime: number, cooldownPeriod: bigint): number => {
    return requestTime + Number(cooldownPeriod);
  };

  /**
   * Check if unstake is ready based on time
   * @param requestTime Unix timestamp when unstake was requested
   * @param cooldownPeriod Cooldown period in seconds
   * @returns Boolean indicating if cooldown has elapsed
   */
  const isUnstakeReady = (requestTime: number, cooldownPeriod: bigint): boolean => {
    const readyTime = getEstimatedReadyTime(requestTime, cooldownPeriod);
    return Date.now() / 1000 >= readyTime;
  };

  /**
   * Get remaining cooldown time in seconds
   * @param requestTime Unix timestamp when unstake was requested
   * @param cooldownPeriod Cooldown period in seconds
   * @returns Remaining time in seconds (0 if ready)
   */
  const getRemainingCooldown = (requestTime: number, cooldownPeriod: bigint): number => {
    const readyTime = getEstimatedReadyTime(requestTime, cooldownPeriod);
    const now = Date.now() / 1000;
    return Math.max(0, readyTime - now);
  };

  /**
   * Format cooldown remaining time as human-readable string
   * @param seconds Remaining seconds
   * @returns Formatted string like "6d 23h 45m"
   */
  const formatCooldownRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Ready';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || '< 1m';
  };

  return {
    // Read hooks
    useGetPosition,
    useGetUserPositions,
    useGetPositionState,
    useCanFinalizeUnstake,
    useGetPortfolioValue,
    useGetKintsuBalance,
    useGetTotalAssets,
    useGetActivePositionCount,
    useGetPendingWithdrawalCount,
    useTotalMonStaked,
    useTotalYieldHarvested,
    useAccYieldPerShare,
    useEstimatedCooldownPeriod,

    // Write functions
    stakeWithDeposit,
    requestUnstake,
    cancelUnstake,
    finalizeUnstake,

    // Keeper functions
    harvest,
    withdrawYield,
    redeemYield,
    convertAndAllocateYield,

    // Helper functions
    getEstimatedReadyTime,
    isUnstakeReady,
    getRemainingCooldown,
    formatCooldownRemaining,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
