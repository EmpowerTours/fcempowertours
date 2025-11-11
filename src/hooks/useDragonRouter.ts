import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { dragonRouterConfig } from '../config/contracts';

export function useDragonRouter() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetAmountsOut = (amountIn: bigint, path: Address[]) => {
    return useReadContract({
      ...dragonRouterConfig,
      functionName: 'getAmountsOut',
      args: [amountIn, path],
    });
  };

  const useGetAmountsIn = (amountOut: bigint, path: Address[]) => {
    return useReadContract({
      ...dragonRouterConfig,
      functionName: 'getAmountsIn',
      args: [amountOut, path],
    });
  };

  // Write functions
  const swapExactTokensForTokens = (
    amountIn: bigint,
    amountOutMin: bigint,
    path: Address[],
    to: Address,
    deadline: bigint
  ) => {
    writeContract({
      ...dragonRouterConfig,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, amountOutMin, path, to, deadline],
    });
  };

  const swapTokensForExactTokens = (
    amountOut: bigint,
    amountInMax: bigint,
    path: Address[],
    to: Address,
    deadline: bigint
  ) => {
    writeContract({
      ...dragonRouterConfig,
      functionName: 'swapTokensForExactTokens',
      args: [amountOut, amountInMax, path, to, deadline],
    });
  };

  const addLiquidity = (
    tokenA: Address,
    tokenB: Address,
    amountADesired: bigint,
    amountBDesired: bigint,
    amountAMin: bigint,
    amountBMin: bigint,
    to: Address,
    deadline: bigint
  ) => {
    writeContract({
      ...dragonRouterConfig,
      functionName: 'addLiquidity',
      args: [tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline],
    });
  };

  const removeLiquidity = (
    tokenA: Address,
    tokenB: Address,
    liquidity: bigint,
    amountAMin: bigint,
    amountBMin: bigint,
    to: Address,
    deadline: bigint
  ) => {
    writeContract({
      ...dragonRouterConfig,
      functionName: 'removeLiquidity',
      args: [tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline],
    });
  };

  return {
    // Read hooks
    useGetAmountsOut,
    useGetAmountsIn,

    // Write functions
    swapExactTokensForTokens,
    swapTokensForExactTokens,
    addLiquidity,
    removeLiquidity,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
