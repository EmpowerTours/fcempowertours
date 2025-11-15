/**
 * Diagnose why staking is failing during gas estimation
 * This script checks all preconditions for the exact UserOperation that's failing
 */
import { createPublicClient, http, parseAbi, encodeFunctionData, parseEther } from 'viem';
import { monadTestnet } from '../app/chains.js';
import 'dotenv/config';

const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT;
const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN;
const PASSPORT_NFT = '0x54e935c5f1ec987bb87f36fc046cf13fb393acc8'; // From the logs
const YIELD_STRATEGY = '0x2804add55b205Ce5930D7807Ad6183D8f3345974';

// Example data from the error logs
const BENEFICIARY = '0x33ffccb1802e13a7eead232bcd4706a2269582b0';
const NFT_TOKEN_ID = 1n;
const STAKE_AMOUNT = parseEther('100'); // 100 TOURS

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

console.log('🔍 DIAGNOSING STAKE FAILURE\n');
console.log('Configuration:');
console.log('  Safe Account:', SAFE_ACCOUNT);
console.log('  Beneficiary:', BENEFICIARY);
console.log('  Passport NFT:', PASSPORT_NFT);
console.log('  NFT Token ID:', NFT_TOKEN_ID.toString());
console.log('  Stake Amount:', (Number(STAKE_AMOUNT) / 1e18).toFixed(2), 'TOURS');
console.log('  YieldStrategy:', YIELD_STRATEGY);
console.log('');

// 1. Check Safe TOURS balance
console.log('1️⃣ Checking Safe TOURS balance...');
try {
  const balance = await client.readContract({
    address: TOURS_TOKEN,
    abi: parseAbi(['function balanceOf(address) external view returns (uint256)']),
    functionName: 'balanceOf',
    args: [SAFE_ACCOUNT],
  });

  const balanceNum = Number(balance) / 1e18;
  const requiredNum = Number(STAKE_AMOUNT) / 1e18;

  console.log('   Safe TOURS balance:', balanceNum.toFixed(2), 'TOURS');
  console.log('   Required for stake:', requiredNum.toFixed(2), 'TOURS');

  if (balance >= STAKE_AMOUNT) {
    console.log('   ✅ Sufficient TOURS balance');
  } else {
    console.log('   ❌ INSUFFICIENT TOURS BALANCE');
    console.log('   This is the problem! Safe needs at least', requiredNum, 'TOURS');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

// 2. Check NFT ownership
console.log('\n2️⃣ Checking NFT ownership...');
try {
  const owner = await client.readContract({
    address: PASSPORT_NFT,
    abi: parseAbi(['function ownerOf(uint256) external view returns (address)']),
    functionName: 'ownerOf',
    args: [NFT_TOKEN_ID],
  });

  console.log('   Current owner:', owner);
  console.log('   Expected owner (beneficiary):', BENEFICIARY);

  if (owner.toLowerCase() === BENEFICIARY.toLowerCase()) {
    console.log('   ✅ Beneficiary owns the NFT');
  } else {
    console.log('   ❌ OWNERSHIP MISMATCH');
    console.log('   The beneficiary does not own this NFT!');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
  console.log('   NFT might not exist');
}

// 3. Check NFT whitelist
console.log('\n3️⃣ Checking if NFT is whitelisted...');
try {
  const isWhitelisted = await client.readContract({
    address: YIELD_STRATEGY,
    abi: parseAbi(['function acceptedNFTs(address) external view returns (bool)']),
    functionName: 'acceptedNFTs',
    args: [PASSPORT_NFT],
  });

  if (isWhitelisted) {
    console.log('   ✅ NFT is whitelisted');
  } else {
    console.log('   ❌ NFT IS NOT WHITELISTED');
    console.log('   This is the problem! Call addAcceptedNFT() first');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

// 4. Check if NFT is already used as collateral
console.log('\n4️⃣ Checking if NFT is already used as collateral...');
try {
  const isUsed = await client.readContract({
    address: YIELD_STRATEGY,
    abi: parseAbi(['function nftCollateralUsed(address, uint256) external view returns (bool)']),
    functionName: 'nftCollateralUsed',
    args: [PASSPORT_NFT, NFT_TOKEN_ID],
  });

  if (isUsed) {
    console.log('   ❌ NFT IS ALREADY USED AS COLLATERAL');
    console.log('   You cannot stake with the same NFT twice');
  } else {
    console.log('   ✅ NFT is available for staking');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

// 5. Simulate the approve call
console.log('\n5️⃣ Simulating approve call...');
try {
  const approveData = encodeFunctionData({
    abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
    functionName: 'approve',
    args: [YIELD_STRATEGY, STAKE_AMOUNT],
  });

  await client.call({
    account: SAFE_ACCOUNT,
    to: TOURS_TOKEN,
    data: approveData,
  });

  console.log('   ✅ Approve simulation passed');
} catch (err) {
  console.log('   ❌ Approve simulation failed:', err.shortMessage || err.message);
  if (err.data) {
    console.log('   Revert data:', err.data);
  }
}

// 6. Simulate the stakeWithNFT call
console.log('\n6️⃣ Simulating stakeWithNFT call...');
try {
  const stakeData = encodeFunctionData({
    abi: parseAbi(['function stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary) external returns (uint256)']),
    functionName: 'stakeWithNFT',
    args: [PASSPORT_NFT, NFT_TOKEN_ID, STAKE_AMOUNT, BENEFICIARY],
  });

  // Simulate AFTER approve (note: this doesn't actually set allowance in simulation)
  await client.call({
    account: SAFE_ACCOUNT,
    to: YIELD_STRATEGY,
    data: stakeData,
  });

  console.log('   ✅ stakeWithNFT simulation passed');
  console.log('   Note: This assumes approve was already called');
} catch (err) {
  console.log('   ❌ stakeWithNFT simulation failed:', err.shortMessage || err.message);
  if (err.data) {
    console.log('   Revert data:', err.data);
  }

  // Try to decode the error
  if (err.message.includes('Amount must be > 0')) {
    console.log('   Cause: Amount is zero or invalid');
  } else if (err.message.includes('Invalid NFT address')) {
    console.log('   Cause: NFT is not whitelisted');
  } else if (err.message.includes('Beneficiary must own NFT')) {
    console.log('   Cause: Beneficiary does not own the NFT');
  } else if (err.message.includes('NFT already used as collateral')) {
    console.log('   Cause: NFT is already being used in another stake');
  } else if (err.message.includes('ERC20: insufficient allowance') || err.message.includes('transferFrom')) {
    console.log('   Cause: Safe has not approved YieldStrategy to spend TOURS');
    console.log('   (This is expected - approve happens in the same transaction)');
  }
}

// 7. Check current allowance
console.log('\n7️⃣ Checking current TOURS allowance...');
try {
  const allowance = await client.readContract({
    address: TOURS_TOKEN,
    abi: parseAbi(['function allowance(address owner, address spender) external view returns (uint256)']),
    functionName: 'allowance',
    args: [SAFE_ACCOUNT, YIELD_STRATEGY],
  });

  console.log('   Current allowance:', (Number(allowance) / 1e18).toFixed(2), 'TOURS');

  if (allowance > 0) {
    console.log('   ℹ️  Safe already has an allowance set');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

// 8. Check TokenSwap and Kintsu addresses
console.log('\n8️⃣ Checking YieldStrategy configuration...');
try {
  const [toursAddr, kintsuAddr, tokenSwapAddr] = await Promise.all([
    client.readContract({
      address: YIELD_STRATEGY,
      abi: parseAbi(['function toursToken() external view returns (address)']),
      functionName: 'toursToken',
    }),
    client.readContract({
      address: YIELD_STRATEGY,
      abi: parseAbi(['function kintsu() external view returns (address)']),
      functionName: 'kintsu',
    }),
    client.readContract({
      address: YIELD_STRATEGY,
      abi: parseAbi(['function tokenSwap() external view returns (address)']),
      functionName: 'tokenSwap',
    }),
  ]);

  console.log('   TOURS Token:', toursAddr);
  console.log('   Kintsu:', kintsuAddr);
  console.log('   TokenSwap:', tokenSwapAddr);

  // Check if TokenSwap is deployed
  const swapCode = await client.getCode({ address: tokenSwapAddr });
  if (!swapCode || swapCode === '0x') {
    console.log('   ❌ TokenSwap is NOT deployed!');
    console.log('   This will cause staking to fail when trying to swap TOURS for MON');
  } else {
    console.log('   ✅ TokenSwap is deployed');
  }

  // Check if Kintsu is deployed
  const kintsuCode = await client.getCode({ address: kintsuAddr });
  if (!kintsuCode || kintsuCode === '0x') {
    console.log('   ❌ Kintsu is NOT deployed!');
    console.log('   This will cause staking to fail when trying to deposit MON');
  } else {
    console.log('   ✅ Kintsu is deployed');
  }
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

console.log('\n' + '='.repeat(70));
console.log('DIAGNOSIS COMPLETE\n');
console.log('Summary:');
console.log('- If NFT is not whitelisted: Call addAcceptedNFT() first');
console.log('- If Safe has insufficient TOURS: Fund the Safe with TOURS tokens');
console.log('- If beneficiary does not own NFT: Verify the correct NFT token ID');
console.log('- If TokenSwap/Kintsu not deployed: Deploy these contracts first');
console.log('');
