import { createPublicClient, http } from 'viem';
import { defineChain } from 'viem';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
});

const CONTRACT_ADDRESS = '0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c';

async function checkDeployed() {
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  console.log('🔍 Checking deployed contract...');
  console.log('Address:', CONTRACT_ADDRESS);
  console.log('');

  const code = await publicClient.getBytecode({ address: CONTRACT_ADDRESS });

  if (code && code !== '0x') {
    console.log('✅ Contract is deployed');
    console.log('Bytecode length:', code.length);
    console.log('Bytecode (first 100 chars):', code.substring(0, 100));
    console.log('');

    // Try to get the contract creation code/transaction
    const balance = await publicClient.getBalance({ address: CONTRACT_ADDRESS });
    console.log('Contract MON balance:', balance.toString());
  } else {
    console.log('❌ Contract not found or not deployed');
  }
}

checkDeployed().catch(console.error);
