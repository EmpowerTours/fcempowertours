/**
 * Execute whitelist transaction
 * Usage: node scripts/whitelist-execute.mjs <functionName> <nftAddress> [true/false]
 */

import { createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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

const YIELD_STRATEGY = '0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c';
const OWNER_PRIVATE_KEY = '0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6';

const functionName = process.argv[2];
const nftAddress = process.argv[3];
const boolArg = process.argv[4] === 'true';

if (!functionName || !nftAddress) {
  console.error('Usage: node scripts/whitelist-execute.mjs <functionName> <nftAddress> [true/false]');
  process.exit(1);
}

async function main() {
  const account = privateKeyToAccount(OWNER_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  console.log('🚀 Whitelisting NFT...');
  console.log('Function:', functionName);
  console.log('NFT:', nftAddress);
  console.log('Sender:', account.address);
  console.log('');

  try {
    let hash;
    if (process.argv[4]) {
      // Two-argument function
      hash = await walletClient.writeContract({
        address: YIELD_STRATEGY,
        abi: parseAbi([`function ${functionName}(address nftAddress, bool accepted) external`]),
        functionName: functionName,
        args: [nftAddress, boolArg],
      });
    } else {
      // One-argument function
      hash = await walletClient.writeContract({
        address: YIELD_STRATEGY,
        abi: parseAbi([`function ${functionName}(address nftAddress) external`]),
        functionName: functionName,
        args: [nftAddress],
      });
    }

    console.log('✅ Transaction sent!');
    console.log('TX hash:', hash);
    console.log('');
    console.log('Waiting for confirmation...');

    const { createPublicClient } = await import('viem');
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ NFT whitelisted successfully!');
      console.log('Block:', receipt.blockNumber);
    } else {
      console.log('❌ Transaction reverted');
    }
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main().catch(console.error);
