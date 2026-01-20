import 'dotenv/config';
import { createPublicClient, http, parseEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createSmartAccountClient } from 'permissionless';
import { defineChain } from 'viem';

const monadTestnet = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID || '10143'),
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC || 'https://rpc-testnet.monadinfra.com'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' } },
  testnet: true,
});

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC || 'https://rpc-testnet.monadinfra.com'),
});

const pimlicoUrl = `https://api.pimlico.io/v2/10143/rpc?apikey=${process.env.PIMLICO_API_KEY}`;

const pimlicoClient = createPimlicoClient({
  transport: http(pimlicoUrl),
  entryPoint: { address: entryPoint07Address, version: '0.7' },
});

// Bot's smart account address (hardcoded from your generation)
const BOT_SMART_ACCOUNT_ADDRESS = '0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5' as `0x${string}`;

// Reusable SmartAccountClient (uses session keys for delegation)
export async function getDelegatedSmartAccountClient(sessionKey: `0x${string}`) {
  const account = await toSafeSmartAccount({
    client: publicClient,
    owners: [privateKeyToAccount(sessionKey)],  // Delegated session key as owner
    entryPoint: { address: entryPoint07Address, version: '0.7' },
    address: BOT_SMART_ACCOUNT_ADDRESS,  // Use your generated address
    version: '1.4.1',
  });

  return createSmartAccountClient({
    account,
    chain: monadTestnet,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });
}

// Example: Buy Music NFT function (adapt to your NFT ABI)
export async function buyMusicNFT(sessionKey: `0x${string}`, tokenId: bigint, price: string) {
  const client = await getDelegatedSmartAccountClient(sessionKey);
  const nftContract = process.env.NFT_CONTRACT_ADDRESS as `0x${string}`;  // Your MusicNFT contract

  const data = encodeFunctionData({
    abi: [  // Your MusicNFT ABI for 'purchaseLicense' or similar
      {
        name: 'purchaseLicense',
        inputs: [{ type: 'uint256', name: 'tokenId' }],
        outputs: [],
        stateMutability: 'payable',
      },
    ],
    functionName: 'purchaseLicense',
    args: [tokenId],
  });

  const txHash = await client.sendTransaction({
    to: nftContract,
    value: parseEther(price),
    data,
  });

  return txHash;
}
