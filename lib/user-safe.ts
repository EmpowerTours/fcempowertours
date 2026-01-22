/**
 * User-Funded Safe Management
 *
 * Each user gets a deterministic Safe address based on their wallet.
 * Bot is the owner/signer of all user Safes (can execute transactions).
 * Gas is paid from user's Safe balance, NOT the bot's funds.
 */

import {
  createSmartAccountClient,
  SmartAccountClient,
} from 'permissionless';
import { createPublicClient, http, Address, Hex, keccak256, encodePacked, parseEther, parseAbi, encodeFunctionData } from 'viem';
import { activeChain } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { env } from '@/lib/env';

const PIMLICO_BUNDLER_URL = env.PIMLICO_BUNDLER_URL;
const ENTRYPOINT_ADDRESS = env.ENTRYPOINT_ADDRESS as Address;

// Public client for Monad
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(env.MONAD_RPC),
});

// Bot's signer account - this is the OWNER of all user Safes
let _botSignerAccount: ReturnType<typeof privateKeyToAccount> | null = null;

function getBotSignerAccount() {
  if (!_botSignerAccount) {
    const SAFE_OWNER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`;
    if (!SAFE_OWNER_PRIVATE_KEY) {
      throw new Error('SAFE_OWNER_PRIVATE_KEY is not set');
    }
    _botSignerAccount = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);
    console.log('🔐 Bot signer initialized:', _botSignerAccount.address);
  }
  return _botSignerAccount;
}

/**
 * Generate deterministic salt for user's Safe
 */
function getUserSaltNonce(userAddress: string): bigint {
  const normalized = userAddress.toLowerCase();
  return BigInt(keccak256(encodePacked(['string', 'address'], ['empowertours-safe-v1', normalized as Address])));
}

/**
 * Get user's Safe address (lightweight - doesn't create client)
 */
export async function getUserSafeAddress(userAddress: string): Promise<Address> {
  const normalizedUser = userAddress.toLowerCase();

  // Compute deterministic Safe address
  const botSigner = getBotSignerAccount();
  const saltNonce = getUserSaltNonce(normalizedUser);

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [botSigner],
    entryPoint: {
      address: ENTRYPOINT_ADDRESS,
      version: '0.7',
    },
    version: '1.4.1',
    saltNonce,
  });

  return safeAccount.address;
}

/**
 * Get user's Safe address and status
 */
export async function getUserSafeInfo(userAddress: string): Promise<{
  safeAddress: Address;
  isDeployed: boolean;
  balance: string;
  balanceWei: bigint;
  isFunded: boolean;
  minRequired: string;
}> {
  const safeAddress = await getUserSafeAddress(userAddress);

  // Get current state
  const [code, balance] = await Promise.all([
    publicClient.getCode({ address: safeAddress }),
    publicClient.getBalance({ address: safeAddress }),
  ]);

  const isDeployed = !!(code && code !== '0x');
  const balanceFormatted = (Number(balance) / 1e18).toFixed(4);

  // Minimum 0.1 MON recommended for gas
  const MIN_FUNDED = parseEther('0.1');
  const isFunded = balance >= MIN_FUNDED;

  return {
    safeAddress,
    isDeployed,
    balance: balanceFormatted,
    balanceWei: balance,
    isFunded,
    minRequired: '0.1',
  };
}

/**
 * Create Smart Account Client for a user's Safe
 */
export async function createUserSafeClient(userAddress: string): Promise<{
  client: SmartAccountClient;
  safeAddress: Address;
  balance: bigint;
}> {
  const normalizedUser = userAddress.toLowerCase();
  const botSigner = getBotSignerAccount();
  const saltNonce = getUserSaltNonce(normalizedUser);

  console.log('📝 Creating User Safe Client...');
  console.log('   User:', normalizedUser);
  console.log('   Bot Signer:', botSigner.address);

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [botSigner],
    entryPoint: {
      address: ENTRYPOINT_ADDRESS,
      version: '0.7',
    },
    version: '1.4.1',
    saltNonce,
  });

  const client = createSmartAccountClient({
    account: safeAccount,
    chain: activeChain,
    bundlerTransport: http(PIMLICO_BUNDLER_URL, { timeout: 120000 }),
    pollingInterval: 2000,
  });

  // Get balance
  const balance = await publicClient.getBalance({ address: safeAccount.address });

  console.log('✅ User Safe Client created');
  console.log('   Safe Address:', safeAccount.address);
  console.log('   Balance:', (Number(balance) / 1e18).toFixed(4), 'MON');

  return {
    client,
    safeAddress: safeAccount.address,
    balance,
  };
}

/**
 * Fetch gas prices from Pimlico
 */
async function getPimlicoGasPrices(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  try {
    const response = await fetch(PIMLICO_BUNDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pimlico_getUserOperationGasPrice',
        params: [],
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const { fast } = data.result;
    return {
      maxFeePerGas: BigInt(fast.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas),
    };
  } catch (error: any) {
    console.warn('⚠️ Pimlico gas price fetch failed, using fallback');
    const gasPrice = await publicClient.getGasPrice();
    return {
      maxFeePerGas: (gasPrice * 150n) / 100n,
      maxPriorityFeePerGas: gasPrice / 10n,
    };
  }
}

/**
 * Check if user Safe has sufficient balance
 */
export async function checkUserSafeBalance(
  userAddress: string,
  requiredValue: bigint = 0n,
  gasBuffer: bigint = parseEther('0.05')
): Promise<{
  hasSufficientBalance: boolean;
  safeAddress: Address;
  currentBalance: string;
  requiredBalance: string;
  shortfall: string;
}> {
  const { safeAddress, balanceWei } = await getUserSafeInfo(userAddress);

  const totalRequired = requiredValue + gasBuffer;
  const hasSufficientBalance = balanceWei >= totalRequired;

  const shortfall = hasSufficientBalance ? 0n : totalRequired - balanceWei;

  return {
    hasSufficientBalance,
    safeAddress,
    currentBalance: (Number(balanceWei) / 1e18).toFixed(4),
    requiredBalance: (Number(totalRequired) / 1e18).toFixed(4),
    shortfall: (Number(shortfall) / 1e18).toFixed(4),
  };
}

/**
 * Send transaction from user's Safe
 */
export async function sendUserSafeTransaction(
  userAddress: string,
  calls: Array<{ to: Address; value: bigint; data: Hex }>
): Promise<{
  txHash: string;
  safeAddress: Address;
  gasUsed?: string;
}> {
  console.log('📤 [USER-SAFE] Sending transaction...');
  console.log('   User:', userAddress);
  console.log('   Calls:', calls.length);

  // Get user's Safe client
  const { client, safeAddress, balance } = await createUserSafeClient(userAddress);

  if (!client.account) {
    throw new Error('Failed to create Safe client');
  }

  // Check balance
  const balanceMON = (Number(balance) / 1e18).toFixed(4);
  console.log('💰 User Safe balance:', balanceMON, 'MON');

  // Calculate total value needed
  const totalValue = calls.reduce((sum, c) => sum + c.value, 0n);
  const MIN_GAS_BUFFER = parseEther('0.05');
  const minRequired = totalValue + MIN_GAS_BUFFER;

  if (balance < minRequired) {
    const requiredMON = (Number(minRequired) / 1e18).toFixed(4);
    throw new Error(
      `Insufficient MON in your Safe. ` +
      `Balance: ${balanceMON} MON, Required: ${requiredMON} MON. ` +
      `Please send MON to your Safe: ${safeAddress}`
    );
  }

  // Get gas prices
  const gasPrices = await getPimlicoGasPrices();

  console.log('🚀 Submitting UserOperation...');

  try {
    // Submit UserOperation
    const userOpHash = await client.sendUserOperation({
      account: client.account,
      calls,
      maxFeePerGas: gasPrices.maxFeePerGas,
      maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
    });

    console.log('✅ UserOp submitted:', userOpHash);

    // Wait for mining
    console.log('⏳ Waiting for confirmation...');
    const receipt = await client.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 300_000,
    });

    const txHash = receipt.receipt.transactionHash;
    const gasUsed = receipt.receipt.gasUsed.toString();

    console.log('✅ Transaction mined:', txHash);

    return {
      txHash,
      safeAddress,
      gasUsed,
    };
  } catch (error: any) {
    console.error('❌ Transaction failed:', error.message);

    if (error.message?.includes('insufficient') || error.message?.includes('balance')) {
      throw new Error(
        `Transaction failed - insufficient funds in your Safe (${safeAddress}). ` +
        `Please add more MON to cover gas costs.`
      );
    }

    throw error;
  }
}

/**
 * Check if a User Safe is registered as an authorized burner in the NFT contract
 */
export async function isUserSafeAuthorizedBurner(userSafeAddress: Address): Promise<boolean> {
  const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address;
  if (!NFT_CONTRACT) {
    console.warn('⚠️ NFT contract address not configured');
    return false;
  }

  try {
    const isAuthorized = await publicClient.readContract({
      address: NFT_CONTRACT,
      abi: parseAbi(['function authorizedBurners(address) external view returns (bool)']),
      functionName: 'authorizedBurners',
      args: [userSafeAddress],
    });
    return isAuthorized as boolean;
  } catch (error: any) {
    console.error('❌ Failed to check burner authorization:', error.message);
    return false;
  }
}

/**
 * Register a User Safe as an authorized burner in the NFT contract.
 * This must be called from the Platform Safe (which is the platformOperator).
 */
export async function registerUserSafeAsBurner(
  userSafeAddress: Address
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address;
  if (!NFT_CONTRACT) {
    return { success: false, error: 'NFT contract address not configured' };
  }

  try {
    // Check if already registered
    const isAlreadyAuthorized = await isUserSafeAuthorizedBurner(userSafeAddress);
    if (isAlreadyAuthorized) {
      console.log('✅ User Safe already registered as authorized burner:', userSafeAddress);
      return { success: true };
    }

    console.log('📝 Registering User Safe as authorized burner...');
    console.log('   User Safe:', userSafeAddress);
    console.log('   NFT Contract:', NFT_CONTRACT);

    // Import sendSafeTransaction dynamically to avoid circular deps
    const { sendSafeTransaction } = await import('@/lib/pimlico-safe-aa');

    // Call registerUserSafeAsBurner from Platform Safe (platformOperator)
    const registerCalldata = encodeFunctionData({
      abi: parseAbi(['function registerUserSafeAsBurner(address userSafe) external']),
      functionName: 'registerUserSafeAsBurner',
      args: [userSafeAddress],
    });

    const txHash = await sendSafeTransaction([
      {
        to: NFT_CONTRACT,
        value: 0n,
        data: registerCalldata as Hex,
      },
    ]);

    console.log('✅ User Safe registered as authorized burner:', txHash);
    return { success: true, txHash };
  } catch (error: any) {
    console.error('❌ Failed to register User Safe as burner:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Ensure a User Safe is registered as an authorized burner.
 * Registers it if not already authorized.
 */
export async function ensureUserSafeCanBurn(
  userAddress: string
): Promise<{ success: boolean; safeAddress: Address; error?: string }> {
  try {
    const safeAddress = await getUserSafeAddress(userAddress);

    const isAuthorized = await isUserSafeAuthorizedBurner(safeAddress);
    if (isAuthorized) {
      console.log('✅ User Safe already authorized for burns:', safeAddress);
      return { success: true, safeAddress };
    }

    // Register the User Safe
    const result = await registerUserSafeAsBurner(safeAddress);
    if (!result.success) {
      return { success: false, safeAddress, error: result.error };
    }

    return { success: true, safeAddress };
  } catch (error: any) {
    return { success: false, safeAddress: '0x0' as Address, error: error.message };
  }
}
