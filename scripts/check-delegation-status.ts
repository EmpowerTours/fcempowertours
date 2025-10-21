import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function makeRedisCall(command: string[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
  }

  // Upstash REST API: POST to base URL with command as path
  const endpoint = `${url}/${command.map(arg => encodeURIComponent(arg)).join('/')}`;
  
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Redis call failed: ${response.status} ${error}`);
  }

  const result = await response.json();
  return result.result;
}

async function checkDelegationStatus() {
  console.log('🔍 Checking delegation status...\n');

  try {
    // 1. Check Redis connection
    console.log('1️⃣  Checking Upstash Redis...');
    try {
      await makeRedisCall(['PING']);
      console.log('   ✅ Upstash Redis connected\n');
    } catch (error) {
      console.log('   ❌ Upstash Redis connection failed');
      console.log(`   Error: ${error}\n`);
      throw error;
    }

    // 2. Check stored delegations
    console.log('2️⃣  Checking stored delegations...');
    try {
      const keysResult = await makeRedisCall(['KEYS', 'delegation:*']);
      const keys = keysResult;

      if (!keys || keys.length === 0) {
        console.log('   ⚠️  No delegations found in Redis');
        console.log('   💡 Tip: Users need to run "/create-delegation" command first\n');
      } else {
        console.log(`   ✅ Found ${keys.length} delegation(s):\n`);

        for (const key of keys) {
          const delegationResult = await makeRedisCall(['GET', key]);
          const delegation = delegationResult;

          if (delegation) {
            try {
              const parsed = JSON.parse(delegation);
              console.log(`   • ${key}`);
              console.log(`     User: ${parsed.user}`);
              console.log(`     Bot: ${parsed.bot}`);
              if (parsed.expiresAt) {
                console.log(
                  `     Expires: ${new Date(parsed.expiresAt).toLocaleString()}`
                );
              }
              console.log('');
            } catch {
              console.log(`   • ${key}: ${delegation}\n`);
            }
          }
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not read delegations: ${error}\n`);
    }

    // 3. Check Safe balance
    console.log('3️⃣  Checking Safe account balance...');
    try {
      const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'
      );

      const safeAddress = process.env.NEXT_PUBLIC_SAFE_ACCOUNT;
      if (!safeAddress) {
        console.log('   ⚠️  NEXT_PUBLIC_SAFE_ACCOUNT not set in env');
      } else {
        const balance = await provider.getBalance(safeAddress);
        const monadBalance = ethers.formatEther(balance);
        console.log(`   ✅ Safe Balance: ${monadBalance} MON`);
        console.log(`   Address: ${safeAddress}\n`);

        if (parseFloat(monadBalance) < 0.01) {
          console.log('   ⚠️  Low balance! Fund your Safe to execute transactions');
          console.log(
            '   💡 Get testnet MON from: https://testnet-faucet.monad.xyz\n'
          );
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not check balance: ${error}\n`);
    }

    // 4. Check Pimlico config
    console.log('4️⃣  Checking Pimlico configuration...');
    const pimlicoKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
    const pimlicoUrl = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL;

    if (pimlicoKey) {
      console.log('   ✅ NEXT_PUBLIC_PIMLICO_API_KEY configured');
    } else {
      console.log('   ⚠️  NEXT_PUBLIC_PIMLICO_API_KEY not set');
    }

    if (pimlicoUrl) {
      console.log('   ✅ NEXT_PUBLIC_PIMLICO_BUNDLER_URL configured');
    } else {
      console.log('   ⚠️  NEXT_PUBLIC_PIMLICO_BUNDLER_URL not set');
    }

    if (process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS) {
      console.log('   ✅ NEXT_PUBLIC_ENTRYPOINT_ADDRESS configured\n');
    } else {
      console.log('   ⚠️  NEXT_PUBLIC_ENTRYPOINT_ADDRESS not set\n');
    }

    // 5. Summary
    console.log('📋 Summary:');
    console.log(`   ✅ Upstash Redis: Connected`);
    console.log(`   ✅ Pimlico: ${pimlicoKey && pimlicoUrl ? 'Configured' : 'Missing config'}`);
    console.log(
      `   ✅ Safe Address: ${process.env.NEXT_PUBLIC_SAFE_ACCOUNT ? 'Set' : 'Not configured'}`
    );

    console.log('\n🎯 Next Steps for Hackathon:');
    console.log('   1. Create a delegation: User runs "/create-delegation"');
    console.log('   2. Bot checks Redis for active delegations');
    console.log('   3. Bot executes swaps gaslessly via Safe + Pimlico');
    console.log('   4. Show judges the delegation in Redis + transaction on chain ✨');
  } catch (error) {
    console.error('❌ Error checking delegation status:', error);
    process.exit(1);
  }
}

checkDelegationStatus();
