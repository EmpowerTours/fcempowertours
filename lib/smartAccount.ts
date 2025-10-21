import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';

// Your deployed contract addresses
const MUSIC_NFT_ADDRESS = '0xaD849874B0111131A30D7D2185Cc1519A83dd3D0';
const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA';

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY!;
const PIMLICO_URL = `https://api.pimlico.io/v2/10143/rpc?apikey=${PIMLICO_API_KEY}`;

// Initialize clients
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
});

const botWalletClient = createWalletClient({
  account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`),
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
});

// Execute gasless transaction via Pimlico
export async function executeGaslessTx(params: {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}) {
  try {
    // For now, use regular wallet client (upgrade to Pimlico bundler later)
    const hash = await botWalletClient.sendTransaction({
      to: params.to,
      data: params.data,
      value: params.value || 0n,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { success: true, hash };
  } catch (error: any) {
    console.error('Transaction error:', error);
    return { success: false, error: error.message };
  }
}

// Mint Music NFT
export async function mintMusicNFT(recipient: `0x${string}`, tokenURI: string) {
  const MusicNFTABI = [
    {
      inputs: [
        { name: 'artist', type: 'address' },
        { name: 'tokenURI', type: 'string' },
        { name: 'price', type: 'uint256' }
      ],
      name: 'mintMaster',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ];

  const data = encodeFunctionData({
    abi: MusicNFTABI,
    functionName: 'mintMaster',
    args: [recipient, tokenURI, parseEther('0.01')], // 0.01 ETH default price
  });

  return executeGaslessTx({
    to: MUSIC_NFT_ADDRESS,
    data,
  });
}

// Mint Passport NFT
export async function mintPassportNFT(recipient: `0x${string}`) {
  const PassportNFTABI = [
    {
      inputs: [{ name: 'to', type: 'address' }],
      name: 'mint',
      outputs: [],
      stateMutability: 'payable',
      type: 'function',
    },
  ];

  const data = encodeFunctionData({
    abi: PassportNFTABI,
    functionName: 'mint',
    args: [recipient],
  });

  return executeGaslessTx({
    to: PASSPORT_NFT_ADDRESS,
    data,
    value: parseEther('0.01'), // 0.01 MON mint cost
  });
}

// Swap MON for TOURS
export async function swapTokens(amount: string) {
  const TokenSwapABI = [
    {
      inputs: [],
      name: 'swap',
      outputs: [],
      stateMutability: 'payable',
      type: 'function',
    },
  ];

  const data = encodeFunctionData({
    abi: TokenSwapABI,
    functionName: 'swap',
    args: [],
  });

  return executeGaslessTx({
    to: TOKEN_SWAP_ADDRESS,
    data,
    value: parseEther(amount),
  });
}
