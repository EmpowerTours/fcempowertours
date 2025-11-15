/**
 * Deploy YieldStrategy V5 using viem (no Hardhat needed)
 *
 * IMPORTANT: You must first flatten the contract for deployment:
 * 1. Go to https://remix.ethereum.org
 * 2. Upload contracts/contracts/EmpowerToursYieldStrategyV5.sol
 * 3. Compile with Solidity 0.8.20, optimizer enabled (200 runs)
 * 4. Deploy or get bytecode
 *
 * OR use this script after manually setting the bytecode
 */

import { createWalletClient, createPublicClient, http, parseAbi, bytecode as Bytecode } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC!;
const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

// Contract addresses (constructor args)
const TOURS_TOKEN = (process.env.NEXT_PUBLIC_TOURS_TOKEN || '0xa123600c82E69cB311B0e068B06Bfa9F787699B7') as `0x${string}`;
const KINTSU = (process.env.NEXT_PUBLIC_KINTSU || '0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626') as `0x${string}`;
const TOKEN_SWAP = (process.env.NEXT_PUBLIC_SWAP || '0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2') as `0x${string}`;
const DRAGON_ROUTER = (process.env.NEXT_PUBLIC_DRAGON_ROUTER || '0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e') as `0x${string}`;
const KEEPER = (process.env.NEXT_PUBLIC_SAFE_ACCOUNT || '') as `0x${string}`;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC),
});

const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
const walletClient = createWalletClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC),
  account,
});

async function deployV5() {
  console.log('🚀 Deploying YieldStrategy V5 to Monad Testnet\n');
  console.log('📝 Deployer:', account.address);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log('💰 Balance:', (Number(balance) / 1e18).toFixed(4), 'MON\n');

  if (balance < 100000000000000000n) { // 0.1 MON
    console.error('❌ Insufficient balance for deployment!');
    console.error('   Need at least 0.1 MON');
    console.error('   Send MON to:', account.address);
    return;
  }

  console.log('📋 Constructor Parameters:');
  console.log('   TOURS Token:', TOURS_TOKEN);
  console.log('   Kintsu:', KINTSU);
  console.log('   Token Swap:', TOKEN_SWAP);
  console.log('   Dragon Router:', DRAGON_ROUTER);
  console.log('   Keeper:', KEEPER);
  console.log('');

  console.log('═══════════════════════════════════════════════════════');
  console.log('⚠️  MANUAL DEPLOYMENT REQUIRED');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Due to environment restrictions, please deploy manually:');
  console.log('');
  console.log('1️⃣  Open Remix IDE: https://remix.ethereum.org');
  console.log('');
  console.log('2️⃣  Upload the contract:');
  console.log('   File: contracts/contracts/EmpowerToursYieldStrategyV5.sol');
  console.log('');
  console.log('3️⃣  Compile settings:');
  console.log('   - Solidity version: 0.8.20');
  console.log('   - Optimizer: Enabled (200 runs)');
  console.log('   - EVM version: Default');
  console.log('');
  console.log('4️⃣  Deploy with constructor arguments:');
  console.log(`   _toursToken: ${TOURS_TOKEN}`);
  console.log(`   _kintsu: ${KINTSU}`);
  console.log(`   _tokenSwap: ${TOKEN_SWAP}`);
  console.log(`   _dragonRouter: ${DRAGON_ROUTER}`);
  console.log(`   _keeper: ${KEEPER}`);
  console.log('');
  console.log('5️⃣  Connect to network:');
  console.log('   - Network: Custom RPC');
  console.log(`   - RPC URL: ${MONAD_RPC}`);
  console.log('   - Chain ID: 41454');
  console.log(`   - Private Key: Use your deployer key`);
  console.log('');
  console.log('6️⃣  After deployment:');
  console.log('   - Save the deployed contract address');
  console.log('   - Run: npm run whitelist-nft-v5 <address>');
  console.log('   - Update .env.local with NEXT_PUBLIC_YIELD_STRATEGY=<address>');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('📝 For verification on MonadScan, save these details:');
  console.log('');
  console.log('Constructor ABI-encoded args:');
  console.log('You will need to provide these for verification');
  console.log('');
}

deployV5()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
