import { config } from 'dotenv';
config({ path: '.env.local' });

import { createPublicClient, http, parseAbi } from 'viem';

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};

const SAFE_ADDRESS = '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20' as `0x${string}`;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz')
});

async function checkSafe() {
  console.log('🔍 Checking Safe contract at:', SAFE_ADDRESS);
  console.log('');

  // Check if contract exists
  const code = await publicClient.getBytecode({ address: SAFE_ADDRESS });
  
  if (!code || code === '0x') {
    console.log('❌ No contract code found at this address!');
    console.log('The Safe might not have been deployed successfully.');
    return;
  }
  
  console.log('✅ Contract exists');
  console.log('📄 Bytecode length:', code.length, 'characters');
  console.log('');

  // Check balance
  const balance = await publicClient.getBalance({ address: SAFE_ADDRESS });
  console.log('💰 Current balance:', balance.toString(), 'wei');
  console.log('💰 Current balance:', (Number(balance) / 1e18).toFixed(4), 'MON');
  console.log('');

  // Try to read owner
  try {
    const owner = await publicClient.readContract({
      address: SAFE_ADDRESS,
      abi: parseAbi(['function getOwners() view returns (address[])']),
      functionName: 'getOwners',
    });
    console.log('✅ Safe owners:', owner);
  } catch (error: any) {
    console.log('⚠️  Could not read owners:', error.message.split('\n')[0]);
  }

  // Try to read threshold
  try {
    const threshold = await publicClient.readContract({
      address: SAFE_ADDRESS,
      abi: parseAbi(['function getThreshold() view returns (uint256)']),
      functionName: 'getThreshold',
    });
    console.log('✅ Safe threshold:', threshold.toString());
  } catch (error: any) {
    console.log('⚠️  Could not read threshold:', error.message.split('\n')[0]);
  }

  // Check if it's a Safe by checking for nonce
  try {
    const nonce = await publicClient.readContract({
      address: SAFE_ADDRESS,
      abi: parseAbi(['function nonce() view returns (uint256)']),
      functionName: 'nonce',
    });
    console.log('✅ Safe nonce:', nonce.toString());
  } catch (error: any) {
    console.log('⚠️  Could not read nonce:', error.message.split('\n')[0]);
  }

  console.log('');
  console.log('🔗 View on explorer:');
  console.log(`https://testnet.monadexplorer.com/address/${SAFE_ADDRESS}`);
}

checkSafe();
