/**
 * Compute Mainnet Safe Address
 *
 * This script computes what your Safe (Smart Account) address will be on mainnet
 * BEFORE you deploy, so you can:
 * 1. Fund the Safe with MON before first use
 * 2. Configure contracts with the correct Safe address
 * 3. Update environment variables
 *
 * IMPORTANT: The Safe uses deterministic deployment, so the address is predictable
 * based on the owner key and saltNonce.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPublicClient, http, defineChain } from 'viem';

// ========================================
// CONFIGURATION - UPDATE THESE FOR MAINNET
// ========================================

// Monad Mainnet details (UPDATE WHEN MAINNET LAUNCHES)
const MAINNET_CHAIN_ID = 10141; // TODO: Get actual mainnet chain ID from Monad
const MAINNET_RPC = 'https://rpc.monad.xyz'; // TODO: Get actual mainnet RPC URL
const MAINNET_NAME = 'Monad Mainnet';

// Safe configuration (KEEP SAME AS TESTNET)
const SAFE_VERSION = '1.4.1'; // Same as testnet
const SALT_NONCE = 0n; // Same as testnet - CRITICAL!
const ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const; // EntryPoint v0.7 (canonical)

// Owner private key (from env or hardcoded for computation)
const SAFE_OWNER_PRIVATE_KEY = (process.env.SAFE_OWNER_PRIVATE_KEY ||
  '0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2') as `0x${string}`;

// ========================================
// SCRIPT
// ========================================

const monadMainnet = defineChain({
  id: MAINNET_CHAIN_ID,
  name: MAINNET_NAME,
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: { http: [MAINNET_RPC] },
    public: { http: [MAINNET_RPC] },
  },
  blockExplorers: {
    default: {
      name: 'MonadScan',
      url: 'https://monadscan.com', // TODO: Update with actual mainnet explorer
    },
  },
  testnet: false,
});

async function computeMainnetSafeAddress() {
  console.log('\n========================================');
  console.log('   MAINNET SAFE ADDRESS COMPUTATION');
  console.log('========================================\n');

  try {
    // Create public client for mainnet
    const publicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(MAINNET_RPC),
    });

    console.log('⚙️  Configuration:');
    console.log(`   Chain ID: ${MAINNET_CHAIN_ID}`);
    console.log(`   RPC URL: ${MAINNET_RPC}`);
    console.log(`   Safe Version: ${SAFE_VERSION}`);
    console.log(`   Salt Nonce: ${SALT_NONCE}`);
    console.log(`   EntryPoint: ${ENTRYPOINT_ADDRESS}\n`);

    // Create owner account from private key
    const ownerAccount = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);
    console.log('🔑 Safe Owner (EOA):');
    console.log(`   Address: ${ownerAccount.address}\n`);

    // Compute deterministic Safe address
    console.log('🔍 Computing Safe address...');
    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      owners: [ownerAccount],
      entryPoint: {
        address: ENTRYPOINT_ADDRESS,
        version: '0.7',
      },
      version: SAFE_VERSION,
      saltNonce: SALT_NONCE,
    });

    console.log('✅ Computation complete!\n');

    console.log('========================================');
    console.log('   RESULTS');
    console.log('========================================\n');

    console.log('🏦 Mainnet Safe Address:');
    console.log(`   ${safeAccount.address}\n`);

    console.log('📋 Next Steps:\n');
    console.log('   1. ⚠️  FUND THIS SAFE WITH MON BEFORE ANY OPERATIONS!');
    console.log('      Minimum: 100 MON');
    console.log('      Recommended: 500+ MON for reliable operation\n');

    console.log('   2. Update .env.mainnet:');
    console.log(`      NEXT_PUBLIC_SAFE_ACCOUNT="${safeAccount.address}"\n`);

    console.log('   3. Deploy contracts with this Safe address as platformSafe:');
    console.log('      - DailyPassLotteryV2');
    console.log('      - Other contracts that need the platform Safe\n');

    console.log('   4. The Safe will deploy automatically on first UserOperation');
    console.log('      No manual deployment script needed!\n');

    console.log('========================================');
    console.log('   COMPARISON WITH TESTNET');
    console.log('========================================\n');

    console.log('Testnet Safe:  0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20');
    console.log(`Mainnet Safe:  ${safeAccount.address}`);
    console.log(`Same Address:  ${safeAccount.address.toLowerCase() === '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20'.toLowerCase() ? '✅ YES' : '❌ NO (different)'}\n`);

    if (safeAccount.address.toLowerCase() !== '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20'.toLowerCase()) {
      console.log('⚠️  IMPORTANT: Mainnet Safe address is DIFFERENT from testnet!');
      console.log('   You MUST update all contract deployments and env vars.\n');
    }

    console.log('========================================');
    console.log('   FUNDING INSTRUCTIONS');
    console.log('========================================\n');

    console.log('Send MON to this address:');
    console.log(`${safeAccount.address}\n`);

    console.log('Recommended amounts:');
    console.log('   - Minimum (testing):      100 MON');
    console.log('   - Recommended (launch):   500 MON');
    console.log('   - Enterprise (high load): 1000+ MON\n');

    console.log('Check balance anytime:');
    console.log(`   curl -X POST ${MAINNET_RPC} \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["${safeAccount.address}","latest"],"id":1}'\n`);

    return {
      ownerAddress: ownerAccount.address,
      safeAddress: safeAccount.address,
      chainId: MAINNET_CHAIN_ID,
      rpcUrl: MAINNET_RPC,
    };

  } catch (error: any) {
    console.error('\n❌ Error computing Safe address:', error.message);
    console.error('\nPossible issues:');
    console.error('   1. Mainnet RPC URL is incorrect or not available yet');
    console.error('   2. SAFE_OWNER_PRIVATE_KEY is invalid');
    console.error('   3. Network connection issues\n');

    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.error('⚠️  Cannot connect to mainnet RPC. This is normal if mainnet hasn\'t launched yet.');
      console.error('   You can still compute the address once mainnet RPC is available.\n');
    }

    throw error;
  }
}

// Run the script
computeMainnetSafeAddress()
  .then((result) => {
    console.log('✅ Script completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
