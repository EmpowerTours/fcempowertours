import { 
  createSmartAccountClient,
  SmartAccountClient,
  PaymasterActions,
} from 'permissionless';
import { createPimlicoBundlerClient, createPaymasterClient } from 'permissionless/clients/pimlico';
import { createPublicClient, http, Address, Hex, Chain } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';

const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY!;
const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL!;
const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;
const SAFE_OWNER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`;

if (!PIMLICO_BUNDLER_URL) throw new Error('NEXT_PUBLIC_PIMLICO_BUNDLER_URL missing');
if (!ENTRYPOINT_ADDRESS) throw new Error('NEXT_PUBLIC_ENTRYPOINT_ADDRESS missing');
if (!SAFE_ACCOUNT) throw new Error('NEXT_PUBLIC_SAFE_ACCOUNT missing');
if (!SAFE_OWNER_PRIVATE_KEY) throw new Error('SAFE_OWNER_PRIVATE_KEY missing');

console.log('🔐 Initializing Safe AA Client');
console.log('  EntryPoint:', ENTRYPOINT_ADDRESS);
console.log('  Safe Account:', SAFE_ACCOUNT);
console.log('  Bundler:', PIMLICO_BUNDLER_URL);

// Public client for Monad
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// Bundler client
export const bundlerClient = createPimlicoBundlerClient({
  chain: monadTestnet,
  transport: http(PIMLICO_BUNDLER_URL),
  entryPoint: ENTRYPOINT_ADDRESS,
});

// Paymaster client (if using Pimlico paymaster)
export const paymasterClient = createPaymasterClient({
  chain: monadTestnet,
  transport: http(PIMLICO_BUNDLER_URL),
});

// Safe owner account (signs UserOps)
const safeOwnerAccount = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);

console.log('✅ Safe owner account:', safeOwnerAccount.address);

// Create Smart Account Client for Safe + AA
export async function createSafeSmartAccountClient(): Promise<
  SmartAccountClient<Address, Chain, typeof publicClient>
> {
  console.log('📝 Creating Smart Account Client for Safe...');

  // Import safe account implementation
  const { signerToSafeSmartAccount } = await import('permissionless/accounts');

  const safeSmartAccount = await signerToSafeSmartAccount(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS,
    signer: safeOwnerAccount,
    safeVersion: '1.4.1', // Adjust based on your Safe version
    saltNonce: 0n, // Use 0 if Safe already deployed
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeSmartAccount,
    chain: monadTestnet,
    bundlerTransport: http(PIMLICO_BUNDLER_URL),
    bundlerClient: bundlerClient,
    middleware: {
      gasPrice: async () => {
        // Get gas price from Monad
        const gasPrice = await publicClient.getGasPrice();
        return {
          slow: { maxFeePerGas: gasPrice, maxPriorityFeePerGas: 0n },
          standard: { maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: gasPrice },
          fast: { maxFeePerGas: gasPrice * 3n, maxPriorityFeePerGas: gasPrice * 2n },
        };
      },
    },
  });

  console.log('✅ Smart Account Client created');
  return smartAccountClient;
}

// Alternative: Direct UserOp approach if you prefer manual control
export async function prepareUserOpForSafe(params: {
  to: Address;
  value: bigint;
  data: Hex;
}) {
  console.log('📝 Preparing UserOp for Safe...');

  const { signerToSafeSmartAccount } = await import('permissionless/accounts');

  const safeSmartAccount = await signerToSafeSmartAccount(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS,
    signer: safeOwnerAccount,
    safeVersion: '1.4.1',
    saltNonce: 0n,
  });

  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_ADDRESS,
    abi: [{
      inputs: [{ name: 'sender', type: 'address' }, { name: 'key', type: 'uint192' }],
      name: 'getNonce',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    }],
    functionName: 'getNonce',
    args: [safeSmartAccount.address, 0n],
  });

  // Get gas price
  const gasPrice = await publicClient.getGasPrice();

  const userOp = {
    sender: safeSmartAccount.address,
    nonce,
    initCode: '0x' as Hex, // Already deployed
    callData: '0x' as Hex, // Will be set by prepareUserOperation
    callGasLimit: 3_000_000n,
    verificationGasLimit: 3_000_000n, // High for Safe validation
    preVerificationGas: 1_000_000n,
    maxFeePerGas: gasPrice * 2n,
    maxPriorityFeePerGas: gasPrice,
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex,
  };

  return userOp;
}

// Helper: Send transaction through Safe SmartAccount
export async function sendSafeTransaction(params: {
  to: Address;
  value?: bigint;
  data?: Hex;
}) {
  try {
    console.log('📤 Sending transaction through Safe SmartAccount...');

    const smartAccountClient = await createSafeSmartAccountClient();

    const hash = await smartAccountClient.sendTransaction({
      calls: [{
        to: params.to,
        value: params.value || 0n,
        data: params.data || '0x',
      }],
      callGasLimit: 3_000_000n,
      verificationGasLimit: 3_000_000n,
    });

    console.log('✅ Transaction sent:', hash);
    return hash;
  } catch (error: any) {
    console.error('❌ Transaction error:', error.message);
    throw error;
  }
}

// Helper: Check Safe balance
export async function getSafeBalance(): Promise<bigint> {
  try {
    const balance = await publicClient.getBalance({
      address: SAFE_ACCOUNT,
    });
    console.log('💰 Safe balance:', balance.toString());
    return balance;
  } catch (error: any) {
    console.error('❌ Error getting Safe balance:', error.message);
    return 0n;
  }
}

export async function checkSafeBalance(requiredAmount: bigint): Promise<boolean> {
  const balance = await getSafeBalance();
  const hasBalance = balance >= requiredAmount;
  console.log(`✅ Balance check: ${balance.toString()} >= ${requiredAmount.toString()} = ${hasBalance}`);
  return hasBalance;
}
