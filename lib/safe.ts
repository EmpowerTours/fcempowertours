import { createPublicClient, createWalletClient, http, Address, encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';

const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL!;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// Check Safe account balance
export async function getSafeBalance(): Promise<bigint> {
  try {
    const balance = await publicClient.getBalance({
      address: SAFE_ACCOUNT,
    });
    return balance;
  } catch (error) {
    console.error('Error getting Safe balance:', error);
    return 0n;
  }
}

// Check if Safe has enough balance for operation
export async function checkSafeBalance(requiredAmount: bigint): Promise<boolean> {
  const balance = await getSafeBalance();
  return balance >= requiredAmount;
}

// Get Safe account info
export async function getSafeInfo() {
  const balance = await getSafeBalance();
  
  return {
    address: SAFE_ACCOUNT,
    balance: balance.toString(),
    balanceFormatted: Number(balance) / 1e18,
  };
}
