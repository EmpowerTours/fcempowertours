import 'dotenv/config';
import { createPublicClient, http, parseEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createSmartAccountClient } from 'permissionless';
import { defineChain } from 'viem';

const monadChain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID || '143'),
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC || 'https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadScan', url: 'https://monadscan.com' } },
  testnet: false,
});

const publicClient = createPublicClient({
  chain: monadChain,
  transport: http(process.env.MONAD_RPC || 'https://rpc.monad.xyz'),
});

const pimlicoUrl = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL || `https://api.pimlico.io/v2/143/rpc?apikey=${process.env.PIMLICO_API_KEY}`;

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
    chain: monadChain,
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
