/**
 * Pimlico Gasless Transaction Wrapper
 *
 * This utility wraps contract interactions with Pimlico's account abstraction
 * to enable gasless transactions for users.
 */

import { encodeFunctionData, type Address, type Hex } from 'viem';
import { createUserSmartAccount } from '@/lib/pimlico/smartAccount';
import {
  creditScoreCalculatorConfig,
  toursTokenConfig,
} from '../config/contracts';

/**
 * Execute a gasless transaction using Pimlico
 * @param userPrivateKey User's private key (should be retrieved securely)
 * @param contractAddress Target contract address
 * @param abi Contract ABI
 * @param functionName Function to call
 * @param args Function arguments
 * @returns Transaction hash
 */
export async function executeGaslessTransaction(
  userPrivateKey: Hex,
  contractAddress: Address,
  abi: any,
  functionName: string,
  args: any[]
): Promise<Hex> {
  try {
    // Create smart account client with Pimlico paymaster
    const { smartAccountClient } = await createUserSmartAccount(userPrivateKey);

    // Encode function data
    const data = encodeFunctionData({
      abi,
      functionName,
      args,
    });

    // Send gasless transaction
    const txHash = await smartAccountClient.sendTransaction({
      to: contractAddress,
      data,
      value: 0n,
    });

    console.log('✅ Gasless transaction sent:', txHash);
    return txHash;
  } catch (error) {
    console.error('❌ Gasless transaction failed:', error);
    throw error;
  }
}

/**
 * Approve TOURS tokens for spending
 */
export async function approveToursGasless(
  userPrivateKey: Hex,
  spender: Address,
  amount: bigint
): Promise<Hex> {
  return executeGaslessTransaction(
    userPrivateKey,
    toursTokenConfig.address,
    toursTokenConfig.abi,
    'approve',
    [spender, amount]
  );
}
