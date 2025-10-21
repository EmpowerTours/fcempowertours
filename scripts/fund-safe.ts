import { config } from 'dotenv';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../app/chains';

// Load .env.local
config({ path: '.env.local' });

const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as `0x${string}`;
const FUNDER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

async function fundSafe() {
  console.log('💰 Funding Safe Account...');
  console.log('Safe Address:', SAFE_ACCOUNT);
  
  const account = privateKeyToAccount(FUNDER_PRIVATE_KEY);
  
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
  });
  
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
  });
  
  // Check current balance
  const currentBalance = await publicClient.getBalance({
    address: SAFE_ACCOUNT,
  });
  
  console.log(`Current Safe balance: ${(Number(currentBalance) / 1e18).toFixed(4)} MON`);
  
  // Fund with 5 MON (enough for multiple operations)
  const fundAmount = parseEther('5');
  
  console.log(`\nSending ${Number(fundAmount) / 1e18} MON to Safe...`);
  console.log(`From: ${account.address}`);
  
  const hash = await walletClient.sendTransaction({
    to: SAFE_ACCOUNT,
    value: fundAmount,
  });
  
  console.log('Transaction sent:', hash);
  console.log('Explorer:', `https://testnet.monadexplorer.com/tx/${hash}`);
  console.log('\nWaiting for confirmation...');
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status === 'success') {
    const newBalance = await publicClient.getBalance({
      address: SAFE_ACCOUNT,
    });
    
    console.log('\n✅ Funding successful!');
    console.log(`New Safe balance: ${(Number(newBalance) / 1e18).toFixed(4)} MON`);
    console.log(`\n🎉 Safe is ready for ~${Math.floor((Number(newBalance) / 1e18) / 0.01)} passport mints!`);
  } else {
    console.error('\n❌ Transaction failed');
  }
}

fundSafe().catch(console.error);
