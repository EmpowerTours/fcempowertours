import { config } from 'dotenv';
import { createPublicClient, http } from 'viem';
import { monadTestnet } from '../app/chains';

// Load .env.local
config({ path: '.env.local' });

const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as `0x${string}`;

async function checkBalance() {
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
  });
  
  console.log('🔍 Checking Safe Account Balance...\n');
  console.log('Safe Address:', SAFE_ACCOUNT);
  
  const balance = await publicClient.getBalance({
    address: SAFE_ACCOUNT,
  });
  
  const balanceMON = Number(balance) / 1e18;

  console.log(`\nBalance: ${balanceMON.toFixed(4)} MON\n`);

  // Pimlico bundler requirements
  const ABSOLUTE_MINIMUM = 3;
  const RECOMMENDED = 5;
  const OPTIMAL = 10;

  if (balanceMON < ABSOLUTE_MINIMUM) {
    console.log('❌ CRITICAL: Balance too low for Pimlico bundler operations');
    console.log(`   Current: ${balanceMON.toFixed(4)} MON`);
    console.log(`   Required: ${ABSOLUTE_MINIMUM} MON minimum`);
    console.log(`   Deficit: ${(ABSOLUTE_MINIMUM - balanceMON).toFixed(4)} MON needed\n`);
    console.log('⚠️  All delegated transactions will FAIL until funded');
    console.log('📖 See FUNDING_SAFE_WALLET.md for funding instructions');
  } else if (balanceMON < RECOMMENDED) {
    console.log('⚠️  WARNING: Balance below recommended level');
    console.log(`   Current: ${balanceMON.toFixed(4)} MON`);
    console.log(`   Recommended: ${RECOMMENDED} MON`);
    console.log(`   You may experience transaction failures`);
  } else if (balanceMON < OPTIMAL) {
    console.log('✅ Balance adequate (but not optimal)');
    console.log(`   Current: ${balanceMON.toFixed(4)} MON`);
    console.log(`   Optimal: ${OPTIMAL}+ MON for 24/7 operations`);
  } else {
    console.log('✅ Balance healthy for reliable operations');
    console.log(`   Current: ${balanceMON.toFixed(4)} MON`);
  }

  console.log('\n📊 Pimlico Bundler Status:');
  console.log(`  Absolute minimum (3 MON):  ${balanceMON >= ABSOLUTE_MINIMUM ? '✅' : '❌'}`);
  console.log(`  Recommended (5 MON):       ${balanceMON >= RECOMMENDED ? '✅' : '⚠️'}`);
  console.log(`  Optimal (10+ MON):         ${balanceMON >= OPTIMAL ? '✅' : '⚠️'}`);

  console.log('\n🔗 Funding Resources:');
  console.log('  Testnet Faucet: https://testnet.monad.xyz/faucet');
  console.log('  Safe Address:   ' + SAFE_ACCOUNT);
  console.log('  Documentation:  FUNDING_SAFE_WALLET.md');
}

checkBalance().catch(console.error);
