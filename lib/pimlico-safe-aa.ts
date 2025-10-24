import {
  createSmartAccountClient,
  SmartAccountClient,
} from 'permissionless';
import { createPublicClient, http, Address, Hex, Chain, parseAbi } from 'viem';
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
        version: '0.7',
      },
      version: '1.4.1', // Safe contract version
      address: SAFE_ACCOUNT, // Use existing Safe
      saltNonce: 0n, // Explicit default; change if needed for address match
    });

    const smartAccountClient = createSmartAccountClient({
      account: safeSmartAccount,
      chain: monadTestnet,
      bundlerTransport: http(PIMLICO_BUNDLER_URL, { timeout: 60000 }), // Increased timeout
      pollingInterval: 200, // Faster polling for inclusion
    });

    // Debug: Check enabled modules
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

    // Debug: Check fallback handler
    const fallbackAbi = parseAbi(['function fallbackHandler() external view returns (address)']);
    const fallback = await publicClient.readContract({
      address: SAFE_ACCOUNT,
      abi: fallbackAbi,
      functionName: 'fallbackHandler',
    });
    console.log('Fallback handler:', fallback);

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

    // Prepare with increased gas limits to avoid OOG/AA23, and enable Pimlico paymaster for gas sponsorship
    const userOp = await smartAccountClient.prepareUserOperation({
      account: smartAccountClient.account, // Explicitly pass account to satisfy types
      calls: [{
        to: params.to,
        value: params.value || 0n,
        data: params.data || '0x',
      }],
      paymaster: true, // Enable Pimlico paymaster sponsorship (assumes bundler supports pm_ methods)
      verificationGasLimit: 3000000n,
      callGasLimit: 3000000n,
      preVerificationGas: 600000n,
    });

    const signedUserOp = await smartAccountClient.signUserOperation(userOp);
    const hash = await smartAccountClient.sendUserOperation(signedUserOp);

    console.log('✅ Transaction sent:', hash);
    return hash;
  } catch (error: any) {
    console.error('❌ Transaction error:', error.message);
    console.error(' Stack:', error.stack);
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
