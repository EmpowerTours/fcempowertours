import {
  createSmartAccountClient,
  SmartAccountClient,
} from 'permissionless';
import { createPublicClient, http, Address, Hex, parseAbi } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';

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
console.log(' EntryPoint:', ENTRYPOINT_ADDRESS);
console.log(' Safe Account:', SAFE_ACCOUNT);
console.log(' Bundler:', PIMLICO_BUNDLER_URL);

// Public client for Monad
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// Safe owner account (signs UserOps)
const safeOwnerAccount = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);
console.log('✅ Safe owner account:', safeOwnerAccount.address);

// Create Smart Account Client for Safe + AA
export async function createSafeSmartAccountClient(): Promise<SmartAccountClient> {
  console.log('📝 Creating Smart Account Client for Safe...');
  try {
    const safeSmartAccount = await toSafeSmartAccount({
      client: publicClient,
      owners: [safeOwnerAccount],
      entryPoint: {
        address: ENTRYPOINT_ADDRESS,
        version: '0.6',
      },
      version: '1.4.1',
      address: SAFE_ACCOUNT,
      saltNonce: 0n,
    });

    const smartAccountClient = createSmartAccountClient({
      account: safeSmartAccount,
      chain: monadTestnet,
      bundlerTransport: http(PIMLICO_BUNDLER_URL, { timeout: 60000 }),
      pollingInterval: 200,
    });

    const modulesAbi = parseAbi([
      'function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] array, address next)',
    ]);
    const [modules] = await publicClient.readContract({
      address: SAFE_ACCOUNT,
      abi: modulesAbi,
      functionName: 'getModulesPaginated',
      args: ['0x0000000000000000000000000000000000000001' as Address, 10n],
    });
    console.log('Enabled modules:', modules);

    const FALLBACK_HANDLER_STORAGE_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
    const storageValue = await publicClient.getStorageAt({
      address: SAFE_ACCOUNT,
      slot: FALLBACK_HANDLER_STORAGE_SLOT as `0x${string}`,
    });
    const fallbackHandler = storageValue
      ? ('0x' + storageValue.slice(-40)) as `0x${string}`
      : '0x0000000000000000000000000000000000000000';
    console.log('Fallback handler:', fallbackHandler);

    console.log('✅ Smart Account Client created');
    return smartAccountClient;
  } catch (error: any) {
    console.error('❌ Error creating Smart Account Client:', error.message);
    throw error;
  }
}

export async function sendSafeTransaction(
  calls: Array<{ to: Address; value: bigint; data: Hex }>
) {
  try {
    console.log('📤 Sending batched transaction through Safe SmartAccount...');
    console.log('📦 Number of calls:', calls.length);
    
    const smartAccountClient = await createSafeSmartAccountClient();

    const gasPrice = await publicClient.getGasPrice();
    const maxFeePerGas = (gasPrice * 120n) / 100n;
    const maxPriorityFeePerGas = gasPrice / 10n;

    console.log('⛽ Gas prices:', {
      gasPrice: gasPrice.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    });

    const hash = await smartAccountClient.sendUserOperation({
      calls,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log('✅ Transaction sent:', hash);
    return hash;
  } catch (error: any) {
    console.error('❌ Transaction error:', error.message);
    console.error(' Stack:', error.stack);
    throw error;
  }
}

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
