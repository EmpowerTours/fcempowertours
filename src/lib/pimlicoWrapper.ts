/**
 * Pimlico Gasless Transaction Wrapper
 *
 * This utility wraps contract interactions with Pimlico's account abstraction
 * to enable gasless transactions for users.
 */

import { encodeFunctionData, type Address, type Hex } from 'viem';
import { createUserSmartAccount } from '@/lib/pimlico/smartAccount';
import {
  passportNFTv3Config,
  yieldStrategyConfig,
  dragonRouterConfig,
  demandSignalEngineConfig,
  smartEventManifestConfig,
  tandaYieldGroupConfig,
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
 * Mint PassportNFT with gasless transaction
 */
export async function mintPassportGasless(
  userPrivateKey: Hex,
  to: Address,
  name: string,
  country: string,
  pfp: string,
  bio: string,
  metadataUri: string
): Promise<Hex> {
  return executeGaslessTransaction(
    userPrivateKey,
    passportNFTv3Config.address,
    passportNFTv3Config.abi,
    'mint',
    [to, name, country, pfp, bio, metadataUri]
  );
}

/**
 * Stake TOURS tokens with gasless transaction
 */
export async function stakeToursGasless(
  userPrivateKey: Hex,
  amount: bigint
): Promise<Hex> {
  return executeGaslessTransaction(
    userPrivateKey,
    yieldStrategyConfig.address,
    yieldStrategyConfig.abi,
    'stake',
    [amount]
  );
}

/**
 * Submit demand signal with gasless transaction
 */
export async function submitDemandGasless(
  userPrivateKey: Hex,
  eventId: bigint,
  demandAmount: bigint
): Promise<Hex> {
  return executeGaslessTransaction(
    userPrivateKey,
    demandSignalEngineConfig.address,
    demandSignalEngineConfig.abi,
    'submitDemand',
    [eventId, demandAmount]
  );
}

/**
 * Purchase event ticket with gasless transaction
 */
export async function purchaseTicketGasless(
  userPrivateKey: Hex,
  eventId: bigint,
  quantity: bigint
): Promise<Hex> {
  return executeGaslessTransaction(
    userPrivateKey,
    smartEventManifestConfig.address,
    smartEventManifestConfig.abi,
    'purchaseTicket',
    [eventId, quantity]
  );
}

/**
 * Join Tanda group with gasless transaction
 */
export async function joinTandaGroupGasless(
  userPrivateKey: Hex,
  groupId: bigint
): Promise<Hex> {
  return executeGaslessTransaction(
    userPrivateKey,
    tandaYieldGroupConfig.address,
    tandaYieldGroupConfig.abi,
    'joinGroup',
    [groupId]
  );
}

/**
 * Approve TOURS tokens for spending (required before staking)
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
