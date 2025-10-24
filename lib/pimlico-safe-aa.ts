import { 
  createSmartAccountClient,
  SmartAccountClient,
} from 'permissionless';
import { createPublicClient, http, Address, Hex, Chain } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { signerToSafeSmartAccount } from 'permissionless/accounts';

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

// Safe owner account (signs UserOps)
const safeOwnerAccount = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);

console.log('✅ Safe owner account:', safeOwnerAccount.address);

// Create Smart Account Client for Safe + AA
export async function createSafeSmartAccountClient(): Promise<SmartAccountClient> {
  console.log('📝 Creating Smart Account Client for Safe...');

  try {
    const safeSmartAccount = await signerToSafeSmartAccount(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS,
      signer: safeOwnerAccount,
      safeVersion: '1.4.1',
      saltNonce: 0n,
    });

    const smartAccountClient = createSmartAccountClient({
      account: safeSmartAccount,
      chain: monadTestnet,
      bundlerTransport: http(PIMLICO_BUNDLER_URL),
    });

    console.log('✅ Smart Account Client created');
    return smartAccountClient;
  } catch (error: any) {
    console.error('❌ Error creating Smart Account Client:', error.message);
    throw error;
  }
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
      to: params.to,
      value: params.value || 0n,
      data: params.data || '0x',
    });

    console.log('✅ Transaction sent:', hash);
    return hash;
  } catch (error: any) {
    console.error('❌ Transaction error:', error.message);
    console.error('   Stack:', error.stack);
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
