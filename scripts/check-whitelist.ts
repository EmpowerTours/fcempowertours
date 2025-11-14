/**
 * Check if Passport NFT is whitelisted in V2 YieldStrategy
 * and find the function to whitelist it
 */

import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { monadTestnet } from '../app/chains';
import 'dotenv/config';

const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as Address;
const YIELD_STRATEGY = '0xe1895d0A166cf750E5e8620A63445661C67112d5' as Address;

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

async function checkWhitelist() {
  console.log('🔍 Checking NFT whitelist status...\n');
  console.log('YieldStrategy:', YIELD_STRATEGY);
  console.log('Passport NFT:', PASSPORT_NFT);
  console.log('');

  // Try different common whitelist function names
  const checkFunctions = [
    { name: 'acceptedNFTs', abi: ['function acceptedNFTs(address) view returns (bool)'] },
    { name: 'isAcceptedNFT', abi: ['function isAcceptedNFT(address) view returns (bool)'] },
    { name: 'whitelistedNFTs', abi: ['function whitelistedNFTs(address) view returns (bool)'] },
    { name: 'isWhitelisted', abi: ['function isWhitelisted(address) view returns (bool)'] },
  ];

  let isWhitelisted = false;
  let whitelistFunction = '';

  for (const func of checkFunctions) {
    try {
      const result = await client.readContract({
        address: YIELD_STRATEGY,
        abi: parseAbi(func.abi),
        functionName: func.name,
        args: [PASSPORT_NFT],
      });

      console.log(`✅ Found whitelist check function: ${func.name}()`);
      console.log(`   Passport NFT whitelisted: ${result}`);
      isWhitelisted = result as boolean;
      whitelistFunction = func.name;
      break;
    } catch (err) {
      // Function doesn't exist, try next one
    }
  }

  if (!whitelistFunction) {
    console.log('❌ Could not find whitelist check function');
    console.log('\n📋 Possible reasons:');
    console.log('   - Contract uses a different function name');
    console.log('   - Contract has no NFT whitelist (accepts all NFTs)');
    console.log('   - Contract may need to be redeployed with whitelist feature');
    return;
  }

  console.log('\n---\n');

  if (isWhitelisted) {
    console.log('✅ Passport NFT is already whitelisted!');
    console.log('   The "Invalid NFT address" error might be from a different issue.');
    return;
  }

  console.log('❌ Passport NFT is NOT whitelisted');
  console.log('\n📝 To whitelist the Passport NFT, you need to call one of these functions as the contract owner:\n');

  // Suggest admin functions to whitelist
  const adminFunctions = [
    `addAcceptedNFT(address ${PASSPORT_NFT})`,
    `setAcceptedNFT(address ${PASSPORT_NFT}, bool true)`,
    `addWhitelistedNFT(address ${PASSPORT_NFT})`,
    `setWhitelisted(address ${PASSPORT_NFT}, bool true)`,
  ];

  adminFunctions.forEach((fn, i) => {
    console.log(`   ${i + 1}. ${fn}`);
  });

  console.log('\n💡 Check the contract owner:');
  try {
    const owner = await client.readContract({
      address: YIELD_STRATEGY,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    });
    console.log(`   Contract owner: ${owner}`);
  } catch (err) {
    console.log('   Could not determine contract owner');
  }
}

checkWhitelist().catch(console.error);
