import {
  createSmartAccountClient,
  SmartAccountClient,
} from 'permissionless';
import { createPublicClient, http, Address, Hex, parseAbi, parseEther } from 'viem';
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

console.log('🔐 Initializing Safe AA Client (EntryPoint v0.7)');
console.log('   EntryPoint:', ENTRYPOINT_ADDRESS);
console.log('   Safe Account:', SAFE_ACCOUNT);
console.log('   Bundler:', PIMLICO_BUNDLER_URL);

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
        version: '0.7', // ✅ Using v0.7 to match Pimlico bundler
      },
      version: '1.4.1',
      address: SAFE_ACCOUNT,
      saltNonce: 0n,
    });

    const smartAccountClient = createSmartAccountClient({
      account: safeSmartAccount,
      chain: monadTestnet,
      bundlerTransport: http(PIMLICO_BUNDLER_URL, { timeout: 60000 }),
      pollingInterval: 2000, // 2 seconds (Monad testnet might be slow)
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
    console.log('   Enabled modules:', modules);

    const FALLBACK_HANDLER_STORAGE_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
    const storageValue = await publicClient.getStorageAt({
      address: SAFE_ACCOUNT,
      slot: FALLBACK_HANDLER_STORAGE_SLOT as `0x${string}`,
    });
    const fallbackHandler = storageValue
      ? ('0x' + storageValue.slice(-40)) as `0x${string}`
      : '0x0000000000000000000000000000000000000000';
    console.log('   Fallback handler:', fallbackHandler);

    console.log('✅ Smart Account Client created with EntryPoint v0.7');
    return smartAccountClient;
  } catch (error: any) {
    console.error('❌ Error creating Smart Account Client:', error.message);
    throw error;
  }
}

// ✅ NEW: Helper function to fetch gas prices from Pimlico
async function getPimlicoGasPrices(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  try {
    console.log('⛽ Fetching gas prices from Pimlico...');
    
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

    if (!response.ok) {
      throw new Error(`Pimlico API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Pimlico error: ${data.error.message}`);
    }

    // Pimlico returns gas prices in "fast", "standard", and "slow" tiers
    // Use "fast" for better chances of inclusion
    const { fast } = data.result;
    const maxFeePerGas = BigInt(fast.maxFeePerGas);
    const maxPriorityFeePerGas = BigInt(fast.maxPriorityFeePerGas);

    console.log('✅ Pimlico gas prices (fast tier):', {
      maxFeePerGas: maxFeePerGas.toString() + ' wei',
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString() + ' wei',
    });

    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch (error: any) {
    console.error('❌ Failed to fetch Pimlico gas prices:', error.message);
    
    // Fallback: use chain's gas price with 50% buffer (minimum Pimlico requirement)
    console.warn('⚠️ Falling back to chain gas price with 50% buffer...');
    const gasPrice = await publicClient.getGasPrice();
    const maxFeePerGas = (gasPrice * 150n) / 100n; // 50% buffer
    const maxPriorityFeePerGas = gasPrice / 10n;
    
    console.log('⚠️ Fallback gas prices:', {
      chainGasPrice: gasPrice.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    });
    
    return { maxFeePerGas, maxPriorityFeePerGas };
  }
}

export async function sendSafeTransaction(
  calls: Array<{ to: Address; value: bigint; data: Hex }>
) {
  try {
    console.log('📤 Sending batched transaction through Safe SmartAccount...');
    console.log('📦 Number of calls:', calls.length);
    console.log('📋 Call details:', JSON.stringify(calls.map(c => ({
      to: c.to,
      value: c.value.toString(),
      dataLength: c.data.length
    })), null, 2));

    const smartAccountClient = await createSafeSmartAccountClient();

    if (!smartAccountClient.account) {
      throw new Error('Failed to create smart account client - account is undefined');
    }

    console.log('🔍 Account details:', {
      address: smartAccountClient.account.address,
      entryPoint: smartAccountClient.account.entryPoint,
    });

    // Check if EntryPoint is deployed
    console.log('🔍 Checking if EntryPoint is deployed...');
    const entryPointCode = await publicClient.getCode({ address: ENTRYPOINT_ADDRESS });
    if (!entryPointCode || entryPointCode === '0x') {
      throw new Error(
        `EntryPoint ${ENTRYPOINT_ADDRESS} is NOT deployed on chain ${monadTestnet.id}! ` +
        `ERC-4337 EntryPoint v0.7 must be deployed before using Account Abstraction. ` +
        `Either deploy the EntryPoint or use a different AA solution.`
      );
    }
    console.log('✅ EntryPoint is deployed (code length: ' + entryPointCode.length + ')');

    // Check if account is deployed
    console.log('🔍 Checking if Safe account is deployed...');
    const accountCode = await publicClient.getCode({ address: SAFE_ACCOUNT });
    if (!accountCode || accountCode === '0x') {
      throw new Error(`Safe account ${SAFE_ACCOUNT} is NOT deployed! Deploy it first before using AA.`);
    }
    console.log('✅ Safe account is deployed (code length: ' + accountCode.length + ')');

    // Check Safe balance
    const safeBalance = await publicClient.getBalance({ address: SAFE_ACCOUNT });
    console.log('💰 Safe MON balance:', (Number(safeBalance) / 1e18).toFixed(4), 'MON');

    if (safeBalance < parseEther('0.001')) {
      console.warn('⚠️ WARNING: Safe has very low MON balance, transaction may fail due to insufficient gas');
    }

    // ✅ CRITICAL FIX: Fetch gas prices from Pimlico's API
    // Pimlico enforces minimum gas prices that may be higher than the chain's current price
    const { maxFeePerGas, maxPriorityFeePerGas } = await getPimlicoGasPrices();

    console.log('🚀 Submitting UserOperation with Pimlico gas prices...');
    console.log('   Max fee per gas:', maxFeePerGas.toString(), 'wei');
    console.log('   Max priority fee:', maxPriorityFeePerGas.toString(), 'wei');

    // ✅ CRITICAL FIX: Provide initial gas limits for estimation
    // Without these, the bundler simulation may fail with insufficient gas
    const initialGasLimits = {
      callGasLimit: 500_000n, // Gas for the actual execution
      verificationGasLimit: 500_000n, // Gas for signature verification
      preVerificationGas: 100_000n, // Gas for bundler overhead
    };

    // Try to manually estimate gas first to get better error messages
    let estimatedGas;
    try {
      console.log('🔍 Attempting manual gas estimation with initial limits...');
      console.log('   Initial callGasLimit:', initialGasLimits.callGasLimit.toString());
      console.log('   Initial verificationGasLimit:', initialGasLimits.verificationGasLimit.toString());
      console.log('   Initial preVerificationGas:', initialGasLimits.preVerificationGas.toString());

      estimatedGas = await smartAccountClient.estimateUserOperationGas({
        account: smartAccountClient.account,
        calls,
        maxFeePerGas,
        maxPriorityFeePerGas,
        ...initialGasLimits,
      });
      console.log('✅ Gas estimation successful:', JSON.stringify(estimatedGas, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
      ));
    } catch (gasErr: any) {
      console.error('❌ Manual gas estimation failed:', {
        message: gasErr.message,
        shortMessage: gasErr.shortMessage,
        details: gasErr.details,
        cause: gasErr.cause,
      });

      // Try to extract more details from the error
      if (gasErr.walk) {
        const baseError = gasErr.walk();
        console.error('   Base error:', {
          name: baseError.name,
          message: baseError.message,
        });
      }

      throw new Error(`Gas estimation failed: ${gasErr.shortMessage || gasErr.message}. This usually means the transaction would revert. Check: 1) Safe has sufficient TOURS tokens, 2) Safe has correct AA modules enabled, 3) All contract addresses are valid.`);
    }

    // ✅ Use estimated gas values (with 20% buffer for safety)
    const gasWithBuffer = {
      callGasLimit: (estimatedGas.callGasLimit * 120n) / 100n,
      verificationGasLimit: (estimatedGas.verificationGasLimit * 120n) / 100n,
      preVerificationGas: (estimatedGas.preVerificationGas * 120n) / 100n,
    };

    console.log('🚀 Using gas estimates with 20% buffer:');
    console.log('   callGasLimit:', gasWithBuffer.callGasLimit.toString());
    console.log('   verificationGasLimit:', gasWithBuffer.verificationGasLimit.toString());
    console.log('   preVerificationGas:', gasWithBuffer.preVerificationGas.toString());

    // sendUserOperation with explicit gas values
    const userOpHash = await smartAccountClient.sendUserOperation({
      account: smartAccountClient.account,
      calls,
      maxFeePerGas,
      maxPriorityFeePerGas,
      ...gasWithBuffer,
    });

    console.log('✅ UserOperation hash:', userOpHash);

    // Wait for the UserOperation to be included in a transaction
    // Monad testnet can be slow, so use a longer timeout (5 minutes)
    console.log('⏳ Waiting for UserOperation to be mined (timeout: 5 minutes)...');
    console.log('   Polling every 2 seconds...');

    try {
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 300_000, // 5 minutes (Monad testnet can be slow)
      });

      const txHash = receipt.receipt.transactionHash;
      console.log('✅ Transaction mined:', txHash);
      console.log('   Gas used:', receipt.receipt.gasUsed.toString());
      console.log('   Block:', receipt.receipt.blockNumber.toString());

      return txHash;
    } catch (timeoutErr: any) {
      // If timeout, try to manually check the receipt one more time
      console.warn('⚠️  Initial wait timed out, checking receipt manually...');

      try {
        // Manual check via Pimlico bundler
        const receiptCheck = await fetch(PIMLICO_BUNDLER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getUserOperationReceipt',
            params: [userOpHash],
          }),
        });

        const receiptData = await receiptCheck.json();
        console.log('📥 Manual receipt check:', receiptData);

        if (receiptData.result) {
          const txHash = receiptData.result.receipt.transactionHash;
          console.log('✅ Transaction was actually mined:', txHash);
          return txHash;
        }
      } catch (manualErr) {
        console.error('❌ Manual receipt check also failed:', manualErr);
      }

      // Re-throw the original timeout error
      throw timeoutErr;
    }
  } catch (error: any) {
    console.error('❌ Transaction error:', error.message);
    console.error('   Stack:', error.stack);
    
    // Log more details if available
    if (error.cause) {
      console.error('   Cause:', error.cause);
    }
    if (error.details) {
      console.error('   Details:', error.details);
    }
    if (error.shortMessage) {
      console.error('   Short message:', error.shortMessage);
    }
    
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
