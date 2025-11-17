/**
 * End-to-End Test Script for Itinerary NFT Marketplace
 *
 * This script tests the complete itinerary marketplace flow:
 * 1. Generate test user addresses
 * 2. Mint passports for each user
 * 3. Create itineraries with different locations
 * 4. Purchase itineraries
 * 5. Check in with GPS verification
 * 6. Verify passport stamps
 *
 * Usage: npx tsx scripts/test-itinerary-marketplace.ts
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../app/chains';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const API_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/5e18e81/v1/graphql';
const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as `0x${string}`;
const ITINERARY_NFT = process.env.NEXT_PUBLIC_ITINERARY_NFT as `0x${string}`;

// Test data
const TEST_LOCATIONS = [
  {
    locationName: 'Zocalo Square',
    city: 'Mexico City',
    country: 'MX',
    countryName: 'Mexico',
    description: 'Historic central square with Aztec ruins and colonial architecture',
    experienceType: 'culture',
    price: '5',
    latitude: 19.4326,
    longitude: -99.1332,
    proximityRadius: 200
  },
  {
    locationName: 'Shibuya Crossing',
    city: 'Tokyo',
    country: 'JP',
    countryName: 'Japan',
    description: 'Worlds busiest pedestrian crossing',
    experienceType: 'culture',
    price: '10',
    latitude: 35.6595,
    longitude: 139.7004,
    proximityRadius: 150
  },
  {
    locationName: 'Machu Picchu',
    city: 'Cusco',
    country: 'PE',
    countryName: 'Peru',
    description: 'Ancient Incan citadel in the Andes Mountains',
    experienceType: 'adventure',
    price: '20',
    latitude: -13.1631,
    longitude: -72.5450,
    proximityRadius: 500
  }
];

interface TestUser {
  name: string;
  account: ReturnType<typeof privateKeyToAccount>;
  passportTokenId?: string;
  createdItineraries: string[];
  purchasedItineraries: string[];
  stamps: any[];
}

interface TestResult {
  timestamp: string;
  users: any[];
  itineraries: any[];
  purchases: any[];
  checkins: any[];
  errors: any[];
  success: boolean;
}

// Utility functions
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callDelegationAPI(userAddress: string, action: string, params: any) {
  console.log(`\n📤 Calling delegation API: ${action}`);
  console.log(`   User: ${userAddress}`);
  console.log(`   Params:`, params);

  try {
    const response = await fetch(`${API_URL}/api/execute-delegated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress,
        action,
        params
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API returned ${response.status}`);
    }

    console.log(`✅ Success:`, data);
    return data;
  } catch (error: any) {
    console.error(`❌ API call failed:`, error.message);
    throw error;
  }
}

async function queryEnvio(query: string, variables: any = {}) {
  console.log(`\n🔍 Querying Envio...`);

  try {
    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    console.log(`✅ Query successful`);
    return data;
  } catch (error: any) {
    console.error(`❌ Envio query failed:`, error.message);
    throw error;
  }
}

async function uploadTestImage(imagePath: string) {
  console.log(`\n📤 Uploading test image: ${imagePath}`);

  // Create a mock image if none exists
  const imageData = 'test-image-data';

  // For now, return a placeholder IPFS hash
  // In a real test, you would upload to Pinata
  return 'QmTest123...';
}

async function createDelegation(userAddress: string) {
  console.log(`\n🔐 Creating delegation for ${userAddress}`);

  try {
    const response = await fetch(`${API_URL}/api/create-delegation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress,
        durationHours: 24,
        maxTransactions: 100,
        permissions: ['mint_passport', 'create_itinerary', 'purchase_itinerary', 'checkin_itinerary']
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to create delegation');
    }

    console.log(`✅ Delegation created`);
    return data;
  } catch (error: any) {
    console.error(`❌ Delegation creation failed:`, error.message);
    throw error;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting Itinerary Marketplace E2E Tests\n');
  console.log('='.repeat(60));

  const results: TestResult = {
    timestamp: new Date().toISOString(),
    users: [],
    itineraries: [],
    purchases: [],
    checkins: [],
    errors: [],
    success: false
  };

  try {
    // Step 1: Generate test users
    console.log('\n📋 STEP 1: Generate Test Users');
    console.log('='.repeat(60));

    const testUsers: TestUser[] = [
      {
        name: 'Alice',
        account: privateKeyToAccount('0x1234567890123456789012345678901234567890123456789012345678901234'),
        createdItineraries: [],
        purchasedItineraries: [],
        stamps: []
      },
      {
        name: 'Bob',
        account: privateKeyToAccount('0x2234567890123456789012345678901234567890123456789012345678901234'),
        createdItineraries: [],
        purchasedItineraries: [],
        stamps: []
      },
      {
        name: 'Charlie',
        account: privateKeyToAccount('0x3234567890123456789012345678901234567890123456789012345678901234'),
        createdItineraries: [],
        purchasedItineraries: [],
        stamps: []
      }
    ];

    testUsers.forEach(user => {
      console.log(`\n👤 ${user.name}: ${user.account.address}`);
      results.users.push({
        name: user.name,
        address: user.account.address
      });
    });

    // Step 2: Mint passports for each user
    console.log('\n\n📋 STEP 2: Mint Passports for Test Users');
    console.log('='.repeat(60));

    for (const user of testUsers) {
      try {
        console.log(`\n🎫 Minting passport for ${user.name}...`);

        // Create delegation first
        await createDelegation(user.account.address);
        await sleep(1000);

        // Mint passport
        const mintResult = await callDelegationAPI(
          user.account.address,
          'mint_passport',
          {
            countryCode: 'US',
            countryName: 'United States',
            fid: Math.floor(Math.random() * 1000000)
          }
        );

        console.log(`✅ Passport minted: TX ${mintResult.txHash}`);

        // Wait for indexing
        await sleep(3000);

        // Query for token ID
        const passportQuery = `
          query GetPassport($owner: String!) {
            PassportNFT(where: {owner: {_eq: $owner}}, order_by: {mintedAt: desc}, limit: 1) {
              tokenId
              countryCode
              countryName
            }
          }
        `;

        const passportData = await queryEnvio(passportQuery, { owner: user.account.address.toLowerCase() });
        const passport = passportData.data?.PassportNFT?.[0];

        if (passport) {
          user.passportTokenId = passport.tokenId;
          console.log(`✅ Passport Token ID: ${user.passportTokenId}`);
        } else {
          console.warn(`⚠️ Could not find passport in Envio for ${user.name}`);
        }

        await sleep(2000);
      } catch (error: any) {
        console.error(`❌ Failed to mint passport for ${user.name}:`, error.message);
        results.errors.push({
          step: 'mint_passport',
          user: user.name,
          error: error.message
        });
      }
    }

    // Step 3: Create itineraries
    console.log('\n\n📋 STEP 3: Create Itineraries');
    console.log('='.repeat(60));

    // Alice creates Mexico City experience
    try {
      console.log(`\n🗺️ Alice creating ${TEST_LOCATIONS[0].locationName}...`);

      const createResult = await callDelegationAPI(
        testUsers[0].account.address,
        'create_itinerary',
        {
          ...TEST_LOCATIONS[0],
          imageHash: await uploadTestImage('test-images/mexico-city.jpg')
        }
      );

      console.log(`✅ Itinerary created: ID ${createResult.itineraryId}, TX ${createResult.txHash}`);
      testUsers[0].createdItineraries.push(createResult.itineraryId);

      results.itineraries.push({
        id: createResult.itineraryId,
        creator: testUsers[0].name,
        location: TEST_LOCATIONS[0].locationName,
        txHash: createResult.txHash
      });

      await sleep(3000);
    } catch (error: any) {
      console.error(`❌ Failed to create itinerary:`, error.message);
      results.errors.push({
        step: 'create_itinerary',
        user: 'Alice',
        location: TEST_LOCATIONS[0].locationName,
        error: error.message
      });
    }

    // Bob creates Tokyo experience
    try {
      console.log(`\n🗺️ Bob creating ${TEST_LOCATIONS[1].locationName}...`);

      const createResult = await callDelegationAPI(
        testUsers[1].account.address,
        'create_itinerary',
        {
          ...TEST_LOCATIONS[1],
          imageHash: await uploadTestImage('test-images/tokyo.jpg')
        }
      );

      console.log(`✅ Itinerary created: ID ${createResult.itineraryId}, TX ${createResult.txHash}`);
      testUsers[1].createdItineraries.push(createResult.itineraryId);

      results.itineraries.push({
        id: createResult.itineraryId,
        creator: testUsers[1].name,
        location: TEST_LOCATIONS[1].locationName,
        txHash: createResult.txHash
      });

      await sleep(3000);
    } catch (error: any) {
      console.error(`❌ Failed to create itinerary:`, error.message);
      results.errors.push({
        step: 'create_itinerary',
        user: 'Bob',
        location: TEST_LOCATIONS[1].locationName,
        error: error.message
      });
    }

    // Charlie creates Peru experience
    try {
      console.log(`\n🗺️ Charlie creating ${TEST_LOCATIONS[2].locationName}...`);

      const createResult = await callDelegationAPI(
        testUsers[2].account.address,
        'create_itinerary',
        {
          ...TEST_LOCATIONS[2],
          imageHash: await uploadTestImage('test-images/peru.jpg')
        }
      );

      console.log(`✅ Itinerary created: ID ${createResult.itineraryId}, TX ${createResult.txHash}`);
      testUsers[2].createdItineraries.push(createResult.itineraryId);

      results.itineraries.push({
        id: createResult.itineraryId,
        creator: testUsers[2].name,
        location: TEST_LOCATIONS[2].locationName,
        txHash: createResult.txHash
      });

      await sleep(3000);
    } catch (error: any) {
      console.error(`❌ Failed to create itinerary:`, error.message);
      results.errors.push({
        step: 'create_itinerary',
        user: 'Charlie',
        location: TEST_LOCATIONS[2].locationName,
        error: error.message
      });
    }

    // Step 4: Purchase itineraries (cross-purchases)
    console.log('\n\n📋 STEP 4: Purchase Itineraries');
    console.log('='.repeat(60));

    // Alice purchases Bob's Tokyo itinerary
    if (testUsers[1].createdItineraries.length > 0) {
      try {
        const itineraryId = testUsers[1].createdItineraries[0];
        console.log(`\n💰 Alice purchasing itinerary ${itineraryId} (Tokyo)...`);

        const purchaseResult = await callDelegationAPI(
          testUsers[0].account.address,
          'purchase_itinerary',
          { itineraryId }
        );

        console.log(`✅ Purchase successful: TX ${purchaseResult.txHash}`);
        testUsers[0].purchasedItineraries.push(itineraryId);

        results.purchases.push({
          buyer: testUsers[0].name,
          itineraryId,
          location: 'Tokyo',
          txHash: purchaseResult.txHash
        });

        await sleep(3000);
      } catch (error: any) {
        console.error(`❌ Purchase failed:`, error.message);
        results.errors.push({
          step: 'purchase_itinerary',
          buyer: 'Alice',
          error: error.message
        });
      }
    }

    // Bob purchases Charlie's Peru itinerary
    if (testUsers[2].createdItineraries.length > 0) {
      try {
        const itineraryId = testUsers[2].createdItineraries[0];
        console.log(`\n💰 Bob purchasing itinerary ${itineraryId} (Peru)...`);

        const purchaseResult = await callDelegationAPI(
          testUsers[1].account.address,
          'purchase_itinerary',
          { itineraryId }
        );

        console.log(`✅ Purchase successful: TX ${purchaseResult.txHash}`);
        testUsers[1].purchasedItineraries.push(itineraryId);

        results.purchases.push({
          buyer: testUsers[1].name,
          itineraryId,
          location: 'Peru',
          txHash: purchaseResult.txHash
        });

        await sleep(3000);
      } catch (error: any) {
        console.error(`❌ Purchase failed:`, error.message);
        results.errors.push({
          step: 'purchase_itinerary',
          buyer: 'Bob',
          error: error.message
        });
      }
    }

    // Step 5: Check-ins (simulated GPS)
    console.log('\n\n📋 STEP 5: Check-In to Itineraries');
    console.log('='.repeat(60));

    // Alice checks in to Tokyo (simulate being at location)
    if (testUsers[0].purchasedItineraries.length > 0 && testUsers[0].passportTokenId) {
      try {
        const itineraryId = testUsers[0].purchasedItineraries[0];
        const location = TEST_LOCATIONS[1]; // Tokyo

        console.log(`\n📍 Alice checking in to ${location.locationName}...`);
        console.log(`   Simulated GPS: ${location.latitude}, ${location.longitude}`);

        const checkinResult = await callDelegationAPI(
          testUsers[0].account.address,
          'checkin_itinerary',
          {
            itineraryId,
            passportTokenId: testUsers[0].passportTokenId,
            userLatitude: location.latitude,
            userLongitude: location.longitude
          }
        );

        console.log(`✅ Check-in successful: TX ${checkinResult.txHash}`);

        results.checkins.push({
          user: testUsers[0].name,
          itineraryId,
          location: location.locationName,
          passportTokenId: testUsers[0].passportTokenId,
          txHash: checkinResult.txHash
        });

        await sleep(3000);
      } catch (error: any) {
        console.error(`❌ Check-in failed:`, error.message);
        results.errors.push({
          step: 'checkin',
          user: 'Alice',
          error: error.message
        });
      }
    }

    // Step 6: Verify passport stamps
    console.log('\n\n📋 STEP 6: Verify Passport Stamps');
    console.log('='.repeat(60));

    for (const user of testUsers) {
      if (!user.passportTokenId) continue;

      try {
        console.log(`\n🔍 Checking stamps for ${user.name} (Passport #${user.passportTokenId})...`);

        const stampsQuery = `
          query GetPassportStamps($passportId: String!) {
            ItineraryNFT_PassportStamped(where: {passportTokenId: {_eq: $passportId}}) {
              itineraryId
              locationName
              city
              country
              timestamp
            }
          }
        `;

        const stampsData = await queryEnvio(stampsQuery, { passportId: user.passportTokenId });
        const stamps = stampsData.data?.ItineraryNFT_PassportStamped || [];

        console.log(`✅ Found ${stamps.length} stamp(s)`);
        stamps.forEach((stamp: any, index: number) => {
          console.log(`   ${index + 1}. ${stamp.locationName} (${stamp.city}, ${stamp.country})`);
          console.log(`      Stamped: ${new Date(stamp.timestamp * 1000).toLocaleString()}`);
        });

        user.stamps = stamps;
      } catch (error: any) {
        console.error(`❌ Failed to verify stamps for ${user.name}:`, error.message);
        results.errors.push({
          step: 'verify_stamps',
          user: user.name,
          error: error.message
        });
      }
    }

    // Mark as successful if no critical errors
    results.success = results.errors.length === 0;

    // Save results
    console.log('\n\n📋 SAVING TEST RESULTS');
    console.log('='.repeat(60));

    const resultsPath = path.join(process.cwd(), 'TEST_RESULTS.md');
    const markdown = generateResultsMarkdown(results, testUsers);

    fs.writeFileSync(resultsPath, markdown);
    console.log(`✅ Results saved to: ${resultsPath}`);

  } catch (error: any) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    results.errors.push({
      step: 'critical',
      error: error.message
    });
    results.success = false;
  }

  // Print summary
  console.log('\n\n📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Users: ${results.users.length}`);
  console.log(`Itineraries Created: ${results.itineraries.length}`);
  console.log(`Purchases: ${results.purchases.length}`);
  console.log(`Check-ins: ${results.checkins.length}`);
  console.log(`Errors: ${results.errors.length}`);
  console.log(`\nStatus: ${results.success ? '✅ SUCCESS' : '❌ FAILED'}`);

  return results;
}

function generateResultsMarkdown(results: TestResult, users: TestUser[]): string {
  return `# Itinerary NFT Marketplace - Test Results

**Date:** ${new Date(results.timestamp).toLocaleString()}
**Status:** ${results.success ? '✅ PASSED' : '❌ FAILED'}

## Summary

- **Users:** ${results.users.length}
- **Itineraries Created:** ${results.itineraries.length}
- **Purchases:** ${results.purchases.length}
- **Check-ins:** ${results.checkins.length}
- **Errors:** ${results.errors.length}

## Test Users

${results.users.map((user, i) => `
### ${i + 1}. ${user.name}
- **Address:** \`${user.address}\`
- **Passport ID:** ${users[i].passportTokenId || 'N/A'}
- **Created Itineraries:** ${users[i].createdItineraries.length}
- **Purchased Itineraries:** ${users[i].purchasedItineraries.length}
- **Stamps Collected:** ${users[i].stamps.length}
`).join('\n')}

## Itineraries Created

${results.itineraries.map((item, i) => `
### ${i + 1}. ${item.location}
- **ID:** ${item.id}
- **Creator:** ${item.creator}
- **Transaction:** [\`${item.txHash}\`](https://testnet.monadscan.com/tx/${item.txHash})
`).join('\n')}

## Purchases

${results.purchases.map((item, i) => `
### ${i + 1}. ${item.buyer} → ${item.location}
- **Itinerary ID:** ${item.itineraryId}
- **Transaction:** [\`${item.txHash}\`](https://testnet.monadscan.com/tx/${item.txHash})
`).join('\n')}

## Check-ins

${results.checkins.map((item, i) => `
### ${i + 1}. ${item.user} @ ${item.location}
- **Itinerary ID:** ${item.itineraryId}
- **Passport ID:** ${item.passportTokenId}
- **Transaction:** [\`${item.txHash}\`](https://testnet.monadscan.com/tx/${item.txHash})
`).join('\n')}

## Errors

${results.errors.length === 0 ? 'None! 🎉' : results.errors.map((err, i) => `
### ${i + 1}. ${err.step}${err.user ? ` (${err.user})` : ''}
\`\`\`
${err.error}
\`\`\`
`).join('\n')}

## Verification Checklist

- [${results.itineraries.length > 0 ? 'x' : ' '}] Itineraries created successfully
- [${results.purchases.length > 0 ? 'x' : ' '}] Purchases executed
- [${results.checkins.length > 0 ? 'x' : ' '}] Check-ins completed
- [${users.some(u => u.stamps.length > 0) ? 'x' : ' '}] Passport stamps rendered
- [${results.errors.length === 0 ? 'x' : ' '}] No errors encountered

## Next Steps

1. Review transaction hashes on Monad testnet explorer
2. Verify events indexed in Envio
3. Check passport SVG rendering with stamps
4. Test GPS proximity validation with different locations
5. Verify IPFS images display correctly

---

*Generated by test-itinerary-marketplace.ts*
`;
}

// Run tests
runTests()
  .then(results => {
    console.log('\n✅ Tests completed successfully');
    process.exit(results.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  });
