/**
 * Check all preconditions for staking
 */
import { createPublicClient, http } from 'viem';
import { monadTestnet } from '../app/chains.js';
import 'dotenv/config';

const PASSPORT_NFT = '0x54e935c5f1ec987bb87f36fc046cf13fb393acc8';
const YIELD_STRATEGY = '0x2804add55b205Ce5930D7807Ad6183D8f3345974';
const USER = '0x33ffccb1802e13a7eead232bcd4706a2269582b0';
const NFT_TOKEN_ID = 1n;

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

console.log('🔍 Checking staking preconditions...\n');
console.log('User:', USER);
console.log('Passport NFT:', PASSPORT_NFT);
console.log('Token ID:', NFT_TOKEN_ID.toString());
console.log('YieldStrategy:', YIELD_STRATEGY);
console.log('');

// 1. Check NFT ownership
console.log('1️⃣ Checking NFT ownership...');
try {
  const owner = await client.readContract({
    address: PASSPORT_NFT,
    abi: [{ type: 'function', name: 'ownerOf', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' }],
    functionName: 'ownerOf',
    args: [NFT_TOKEN_ID],
  });

  console.log('   Current owner:', owner);
  console.log('   Expected owner:', USER);

  if (owner.toLowerCase() === USER.toLowerCase()) {
    console.log('   ✅ User owns the NFT');
  } else {
    console.log('   ❌ User does NOT own this NFT!');
    console.log('   This is likely the problem - you cannot stake with an NFT you don\'t own.');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
  console.log('   NFT might not exist');
}

// 2. Check if NFT is whitelisted
console.log('\n2️⃣ Checking if NFT is whitelisted...');
try {
  const isWhitelisted = await client.readContract({
    address: YIELD_STRATEGY,
    abi: [{ type: 'function', name: 'acceptedNFTs', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
    functionName: 'acceptedNFTs',
    args: [PASSPORT_NFT],
  });

  if (isWhitelisted) {
    console.log('   ✅ NFT is whitelisted');
  } else {
    console.log('   ❌ NFT is NOT whitelisted');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

// 3. Check if NFT is already used as collateral
console.log('\n3️⃣ Checking if NFT is already used as collateral...');
try {
  const isUsed = await client.readContract({
    address: YIELD_STRATEGY,
    abi: [{ type: 'function', name: 'nftCollateralUsed', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
    functionName: 'nftCollateralUsed',
    args: [PASSPORT_NFT, NFT_TOKEN_ID],
  });

  if (isUsed) {
    console.log('   ❌ NFT is already being used as collateral!');
    console.log('   You cannot stake with the same NFT twice.');
    console.log('   You need to unstake the existing position first.');
  } else {
    console.log('   ✅ NFT is available for staking');
  }
} catch (err) {
  console.log('   ⚠️  Error:', err.message);
  console.log('   (Function might not exist on this contract version)');
}

// 4. Check YieldStrategy state
console.log('\n4️⃣ Checking YieldStrategy state...');
const checks = [
  { name: 'paused', abi: [{ type: 'function', name: 'paused', outputs: [{ type: 'bool' }], stateMutability: 'view' }] },
  { name: 'minStakeAmount', abi: [{ type: 'function', name: 'minStakeAmount', outputs: [{ type: 'uint256' }], stateMutability: 'view' }] },
  { name: 'maxStakeAmount', abi: [{ type: 'function', name: 'maxStakeAmount', outputs: [{ type: 'uint256' }], stateMutability: 'view' }] },
];

for (const check of checks) {
  try {
    const result = await client.readContract({
      address: YIELD_STRATEGY,
      abi: check.abi,
      functionName: check.name,
    });

    if (check.name === 'paused' && result) {
      console.log(`   ❌ ${check.name}: ${result} (Contract is PAUSED!)`);
    } else if (check.name.includes('Amount')) {
      const amount = Number(result) / 1e18;
      console.log(`   ${check.name}: ${amount} TOURS`);
    } else {
      console.log(`   ${check.name}: ${result}`);
    }
  } catch (err) {
    console.log(`   ${check.name}: N/A`);
  }
}

console.log('\n✅ Diagnostic complete');
