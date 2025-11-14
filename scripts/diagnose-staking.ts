/**
 * Diagnostic script to debug stake_tours UserOperation failure
 *
 * This script checks:
 * 1. YieldStrategy contract deployment and state
 * 2. Safe's TOURS balance
 * 3. Passport NFT ownership
 * 4. YieldStrategy requirements
 */

import { createPublicClient, http, parseUnits, parseAbi, type Address, type Hex } from 'viem';
import { monadTestnet } from '../app/chains';
import 'dotenv/config';

const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;
const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as Address;
const YIELD_STRATEGY = '0x2804add55b205Ce5930D7807Ad6183D8f3345974' as Address; // V3 deployed with Foundry
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

// Example user who's trying to stake
const USER_ADDRESS = '0x33ffccb1802e13a7eead232bcd4706a2269582b0' as Address;

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

async function diagnoseStakingIssue() {
  console.log('🔍 DIAGNOSING STAKE_TOURS FAILURE\n');
  console.log('Configuration:');
  console.log('  Safe Account:', SAFE_ACCOUNT);
  console.log('  TOURS Token:', TOURS_TOKEN);
  console.log('  Passport NFT:', PASSPORT_NFT);
  console.log('  YieldStrategy:', YIELD_STRATEGY);
  console.log('  User Address:', USER_ADDRESS);
  console.log('');

  // 1. Check YieldStrategy deployment
  console.log('1️⃣ Checking YieldStrategy contract...');
  try {
    const code = await client.getCode({ address: YIELD_STRATEGY });
    if (!code || code === '0x') {
      console.log('   ❌ YieldStrategy is NOT deployed at', YIELD_STRATEGY);
      console.log('   This is the ROOT CAUSE of the issue!');
      console.log('   The contract needs to be deployed before staking can work.');
      return;
    }
    console.log('   ✅ YieldStrategy is deployed (code length:', code.length, 'bytes)');
  } catch (err: any) {
    console.log('   ❌ Error checking YieldStrategy:', err.message);
    return;
  }

  // 2. Check Safe's TOURS balance
  console.log('\n2️⃣ Checking Safe TOURS balance...');
  try {
    const balance = await client.readContract({
      address: TOURS_TOKEN,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [SAFE_ACCOUNT],
    });

    const balanceTours = Number(balance) / 1e18;
    console.log('   Balance:', balanceTours.toFixed(4), 'TOURS');

    if (balanceTours >= 100) {
      console.log('   ✅ Safe has enough TOURS for 100 TOURS stake');
    } else {
      console.log('   ❌ Safe does NOT have enough TOURS (needs 100, has', balanceTours, ')');
    }
  } catch (err: any) {
    console.log('   ❌ Error checking balance:', err.message);
  }

  // 3. Query user's passport from Envio
  console.log('\n3️⃣ Checking user passport NFTs...');
  try {
    const passportQuery = `
      query GetUserPassports($owner: String!, $contract: String!) {
        PassportNFT(
          where: {
            owner: { _eq: $owner }
            contract: { _eq: $contract }
          },
          limit: 1,
          order_by: { mintedAt: desc }
        ) {
          tokenId
          countryCode
          countryName
          contract
          owner
        }
      }
    `;

    const passportRes = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: passportQuery,
        variables: {
          owner: USER_ADDRESS.toLowerCase(),
          contract: PASSPORT_NFT.toLowerCase()
        }
      })
    });

    const passportData = await passportRes.json();
    const passport = passportData.data?.PassportNFT?.[0];

    if (!passport) {
      console.log('   ❌ No passport found for user in Envio indexer');
      console.log('   User needs to mint a passport first');
      return;
    }

    console.log('   ✅ Found passport:', {
      tokenId: passport.tokenId,
      country: passport.countryCode,
      owner: passport.owner
    });

    // 4. Verify passport ownership on-chain
    console.log('\n4️⃣ Verifying passport ownership on-chain...');
    try {
      const owner = await client.readContract({
        address: PASSPORT_NFT,
        abi: parseAbi(['function ownerOf(uint256) view returns (address)']),
        functionName: 'ownerOf',
        args: [BigInt(passport.tokenId)],
      });

      console.log('   On-chain owner:', owner);
      console.log('   Expected owner:', USER_ADDRESS);

      if (owner.toLowerCase() === USER_ADDRESS.toLowerCase()) {
        console.log('   ✅ User owns the passport NFT');
      } else {
        console.log('   ❌ User does NOT own this passport NFT');
        console.log('   Owner mismatch - this could cause staking to fail');
      }
    } catch (err: any) {
      console.log('   ❌ Error checking ownership:', err.message);
      console.log('   Token may not exist on-chain');
    }

    // 5. Try to simulate the stakeWithNFT call
    console.log('\n5️⃣ Simulating stakeWithNFT call...');
    const stakeAmount = parseUnits('100', 18);

    try {
      // First check if the function exists (V2 contract with beneficiary parameter)
      const result = await client.simulateContract({
        address: YIELD_STRATEGY,
        abi: parseAbi(['function stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary) external returns (uint256)']),
        functionName: 'stakeWithNFT',
        args: [PASSPORT_NFT, BigInt(passport.tokenId), stakeAmount, USER_ADDRESS],
        account: SAFE_ACCOUNT,
      });

      console.log('   ✅ Simulation succeeded! Position ID would be:', result.result.toString());
    } catch (err: any) {
      console.log('   ❌ Simulation FAILED:', err.message);

      // Check for common issues
      if (err.message.includes('0x')) {
        console.log('\n   🔍 Possible causes for empty revert (0x):');
        console.log('   - YieldStrategy may not have stakeWithNFT function');
        console.log('   - Contract may be paused or not initialized');
        console.log('   - Passport NFT address is not whitelisted in YieldStrategy');
        console.log('   - Safe may need to approve TOURS first');
        console.log('   - YieldStrategy may require MON instead of TOURS');
      }

      // Try to get more details
      console.log('\n   Attempting to call stakeWithNFT to get detailed error...');
      try {
        const data = await client.readContract({
          address: YIELD_STRATEGY,
          abi: parseAbi(['function stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary) external returns (uint256)']),
          functionName: 'stakeWithNFT',
          args: [PASSPORT_NFT, BigInt(passport.tokenId), stakeAmount, USER_ADDRESS],
        });
        console.log('   Unexpected success:', data);
      } catch (detailErr: any) {
        console.log('   Detailed error:', detailErr.message);
      }
    }

    // 6. Check YieldStrategy configuration
    console.log('\n6️⃣ Checking YieldStrategy configuration...');

    // Try common configuration functions
    const configChecks = [
      { name: 'paused', abi: ['function paused() view returns (bool)'] },
      { name: 'toursToken', abi: ['function toursToken() view returns (address)'] },
      { name: 'acceptedNFTs', abi: ['function acceptedNFTs(address) view returns (bool)'], args: [PASSPORT_NFT] },
      { name: 'minStakeAmount', abi: ['function minStakeAmount() view returns (uint256)'] },
      { name: 'maxStakeAmount', abi: ['function maxStakeAmount() view returns (uint256)'] },
    ];

    for (const check of configChecks) {
      try {
        const result = await client.readContract({
          address: YIELD_STRATEGY,
          abi: parseAbi(check.abi),
          functionName: check.name,
          args: check.args || [],
        });
        console.log(`   ${check.name}:`, String(result));
      } catch (err: any) {
        console.log(`   ${check.name}: N/A (function may not exist)`);
      }
    }

  } catch (err: any) {
    console.log('   ❌ Error querying passport:', err.message);
  }

  console.log('\n✅ Diagnostic complete');
}

diagnoseStakingIssue().catch(console.error);
