/**
 * Check owner and whitelist the Passport NFT
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
});

const YIELD_STRATEGY = '0xe1895d0A166cf750E5e8620A63445661C67112d5';
const OLD_PASSPORT_NFT = '0x54e935c5f1ec987bb87f36fc046cf13fb393acc8'; // From indexer
const NEW_PASSPORT_NFT = '0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08'; // From .env
const OWNER_PRIVATE_KEY = '0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

async function main() {
  console.log('🔍 Checking YieldStrategy V2 contract...\n');
  console.log('Contract:', YIELD_STRATEGY);
  console.log('');

  // 1. Check owner
  console.log('1️⃣ Checking contract owner...');
  try {
    const owner = await publicClient.readContract({
      address: YIELD_STRATEGY,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    });
    console.log('   Owner:', owner);

    const account = privateKeyToAccount(OWNER_PRIVATE_KEY);
    console.log('   Your account:', account.address);

    if (owner.toLowerCase() !== account.address.toLowerCase()) {
      console.log('   ❌ You are NOT the owner! Cannot whitelist NFTs.');
      console.log('   Contact the owner:', owner);
      return;
    }
    console.log('   ✅ You are the owner!\n');
  } catch (err) {
    console.log('   ⚠️ Could not read owner() - trying alternative checks...\n');
  }

  // 2. Check current whitelist status
  console.log('2️⃣ Checking whitelist status...');

  const checkFunctions = [
    'acceptedNFTs',
    'isAcceptedNFT',
    'whitelistedNFTs',
    'isWhitelisted',
  ];

  let whitelistCheckFunc = null;
  for (const funcName of checkFunctions) {
    try {
      const isWhitelisted = await publicClient.readContract({
        address: YIELD_STRATEGY,
        abi: parseAbi([`function ${funcName}(address) view returns (bool)`]),
        functionName: funcName,
        args: [OLD_PASSPORT_NFT],
      });

      console.log(`   ✅ Found: ${funcName}()`);
      console.log(`   Old Passport (${OLD_PASSPORT_NFT}): ${isWhitelisted ? '✅ Whitelisted' : '❌ NOT whitelisted'}`);
      whitelistCheckFunc = funcName;

      const isNewWhitelisted = await publicClient.readContract({
        address: YIELD_STRATEGY,
        abi: parseAbi([`function ${funcName}(address) view returns (bool)`]),
        functionName: funcName,
        args: [NEW_PASSPORT_NFT],
      });
      console.log(`   New Passport (${NEW_PASSPORT_NFT}): ${isNewWhitelisted ? '✅ Whitelisted' : '❌ NOT whitelisted'}\n`);
      break;
    } catch (err) {
      // Function doesn't exist, try next
    }
  }

  if (!whitelistCheckFunc) {
    console.log('   ❌ Could not find whitelist check function\n');
  }

  // 3. Try to find the whitelist function
  console.log('3️⃣ Finding whitelist function...');

  const whitelistFunctions = [
    { name: 'addAcceptedNFT', sig: 'function addAcceptedNFT(address nftAddress) external', argsCount: 1 },
    { name: 'setAcceptedNFT', sig: 'function setAcceptedNFT(address nftAddress, bool accepted) external', argsCount: 2 },
    { name: 'addWhitelistedNFT', sig: 'function addWhitelistedNFT(address nftAddress) external', argsCount: 1 },
    { name: 'setWhitelisted', sig: 'function setWhitelisted(address nftAddress, bool whitelisted) external', argsCount: 2 },
  ];

  const account = privateKeyToAccount(OWNER_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  for (const func of whitelistFunctions) {
    try {
      console.log(`   Trying: ${func.name}()`);

      // Try to simulate the call
      const args = func.argsCount === 1
        ? [OLD_PASSPORT_NFT]
        : [OLD_PASSPORT_NFT, true];

      await publicClient.simulateContract({
        address: YIELD_STRATEGY,
        abi: parseAbi([func.sig]),
        functionName: func.name,
        args: args,
        account: account.address,
      });

      console.log(`   ✅ Found working function: ${func.name}()\n`);

      // Ask if they want to whitelist
      console.log('4️⃣ Ready to whitelist!');
      console.log(`   Function: ${func.name}`);
      console.log(`   Old Passport: ${OLD_PASSPORT_NFT}`);
      console.log(`   New Passport: ${NEW_PASSPORT_NFT}`);
      console.log('');
      console.log('Run these commands to whitelist:');
      console.log('');

      if (func.argsCount === 1) {
        console.log(`# Whitelist old passport:`);
        console.log(`node scripts/whitelist-execute.mjs ${func.name} ${OLD_PASSPORT_NFT}`);
        console.log('');
        console.log(`# Whitelist new passport:`);
        console.log(`node scripts/whitelist-execute.mjs ${func.name} ${NEW_PASSPORT_NFT}`);
      } else {
        console.log(`# Whitelist old passport:`);
        console.log(`node scripts/whitelist-execute.mjs ${func.name} ${OLD_PASSPORT_NFT} true`);
        console.log('');
        console.log(`# Whitelist new passport:`);
        console.log(`node scripts/whitelist-execute.mjs ${func.name} ${NEW_PASSPORT_NFT} true`);
      }

      return;
    } catch (err) {
      console.log(`   ❌ ${func.name}() failed:`, err.message);
    }
  }

  console.log('\n❌ Could not find working whitelist function');
  console.log('The contract may need to be redeployed with whitelist functionality.');
}

main().catch(console.error);
