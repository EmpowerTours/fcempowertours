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
  
  if (balanceMON < 1) {
    console.log('⚠️  LOW BALANCE - Fund the Safe to enable delegated transactions');
    console.log('Run: npm run fund-safe');
  } else {
    console.log('✅ Balance sufficient for delegated transactions');
  }
  
  console.log('\nCapabilities:');
  console.log(`  Mint Passport (0.01 MON): ${balanceMON >= 0.01 ? '✅' : '❌'}`);
  console.log(`  Mint Music (free):        ✅`);
  console.log(`  Swap (0.1 MON):          ${balanceMON >= 0.1 ? '✅' : '❌'}`);
  
  console.log(`\n💡 Estimated operations: ~${Math.floor(balanceMON / 0.01)} passport mints`);
}

checkBalance().catch(console.error);
