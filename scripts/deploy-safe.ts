import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createPublicClient, http, defineChain, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createSmartAccountClient } from 'permissionless';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';
import { writeFileSync } from 'fs';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
});

async function deploySafe() {
  const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  if (!apiKey) throw new Error('Missing PIMLICO_API_KEY');

  // Test specific key
  const privateKey = '0x8462ebb5b399c1e97b7fc78c3bcc198fc95d262e389fdc66121e7f91a77db6ee' as Hex;

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http('https://testnet-rpc.monad.xyz'),
  });

  const pimlicoUrl = `https://api.pimlico.io/v2/10143/rpc?apikey=${apiKey}`;

  const pimlicoClient = createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });

  const account = await toSafeSmartAccount({
    client: publicClient,
    owners: [privateKeyToAccount(privateKey)],
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
    version: '1.4.1',
  });

  console.log(`\nOwner EOA: ${privateKeyToAccount(privateKey).address}`);
  console.log(`Safe address: ${account.address}`);

  const smartAccountClient = createSmartAccountClient({
    account,
    chain: monadTestnet,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  });

  console.log('Target: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20');
  const match = account.address.toLowerCase() === '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20'.toLowerCase();
  console.log('Match:', match ? '✅ YES!' : '❌ NO');

  if (match) {
    console.log('\nDeploying Safe...');
    const txHash = await smartAccountClient.sendTransaction({
      to: account.address,
      value: 0n,
      data: '0x',
    });
    console.log(`✅ Safe deployed! TX: https://testnet.monadscan.com/tx/${txHash}`);
  }
}

deploySafe().catch(console.error);
