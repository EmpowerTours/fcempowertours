import { config } from 'dotenv';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../app/chains';

// Load .env.local
config({ path: '.env.local' });

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

if (!DEPLOYER_PRIVATE_KEY) {
  console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env.local');
  process.exit(1);
}

async function checkDeployer() {
  console.log('🔍 Checking Deployer Account\n');
  console.log('='.repeat(50));
  
  // Get deployer address from private key
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  
  console.log('\n📍 Deployer Address:', account.address);
  console.log('🔐 Derived from DEPLOYER_PRIVATE_KEY');
  
  // Check balance
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
  });
  
  const balance = await publicClient.getBalance({
    address: account.address,
  });
  
  const balanceMON = Number(balance) / 1e18;
  
  console.log('\n💰 Current Balance:', balanceMON.toFixed(4), 'MON');
  
  // Check if enough to fund Safe
  const MIN_FOR_FUNDING = 5.1; // 5 MON + gas
  
  if (balanceMON < MIN_FOR_FUNDING) {
    console.log('\n❌ INSUFFICIENT BALANCE');
    console.log(`   Need: ${MIN_FOR_FUNDING} MON (5 MON + gas)`);
    console.log(`   Have: ${balanceMON.toFixed(4)} MON`);
    console.log(`   Need: ${(MIN_FOR_FUNDING - balanceMON).toFixed(4)} more MON`);
    console.log('\n📥 Fund this address from a faucet:');
    console.log(`   ${account.address}`);
    console.log('\n🌊 Monad Testnet Faucet:');
    console.log('   https://faucet.monad.xyz/');
  } else {
    console.log('\n✅ BALANCE SUFFICIENT');
    console.log(`   Can fund Safe with 5 MON`);
    console.log(`   Remaining after: ${(balanceMON - 5).toFixed(4)} MON`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary:');
  console.log(`   Deployer: ${account.address}`);
  console.log(`   Safe:     ${process.env.NEXT_PUBLIC_SAFE_ACCOUNT || 'Not set'}`);
  console.log(`   Balance:  ${balanceMON.toFixed(4)} MON`);
  console.log(`   Status:   ${balanceMON >= MIN_FOR_FUNDING ? '✅ Ready' : '❌ Need funds'}`);
  
  if (balanceMON >= MIN_FOR_FUNDING) {
    console.log('\n🚀 Ready to fund Safe! Run:');
    console.log('   npm run fund-safe');
  }
}

checkDeployer().catch(console.error);
