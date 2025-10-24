import { config } from 'dotenv';
config({ path: '.env.local' });

import { createWalletClient, createPublicClient, http, encodeFunctionData, parseAbi, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};

const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as `0x${string}`;
const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as `0x${string}`;

const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.startsWith('0x')
  ? process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`
  : `0x${process.env.DEPLOYER_PRIVATE_KEY}` as `0x${string}`;

const account = privateKeyToAccount(privateKey);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz'),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz'),
});

async function sendToursToSafe(amount: string) {
  try {
    console.log('💰 Sending TOURS tokens to Safe');
    console.log('📤 From:', account.address);
    console.log('📥 To:', SAFE_ADDRESS);
    console.log('🪙 Amount:', amount, 'TOURS');

    const senderBalance = await publicClient.readContract({
      address: TOURS_TOKEN,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [account.address],
    });

    console.log('📊 Sender balance:', formatEther(senderBalance), 'TOURS');

    const amountWei = parseEther(amount);
    
    if (senderBalance < amountWei) {
      console.log('❌ Insufficient TOURS balance');
      process.exit(1);
    }

    const hash = await walletClient.sendTransaction({
      to: TOURS_TOKEN,
      data: encodeFunctionData({
        abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
        functionName: 'transfer',
        args: [SAFE_ADDRESS, amountWei],
      }),
      gas: 100000n,
    });

    console.log('✅ Transaction sent:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('✅ Confirmed in block:', receipt.blockNumber);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const amount = process.argv[2] || '100';
sendToursToSafe(amount);
