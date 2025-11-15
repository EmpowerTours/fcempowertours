/**
 * Whitelist Passport NFT in YieldStrategy V3
 */
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../app/chains';
import 'dotenv/config';

const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as `0x${string}`;
const YIELD_STRATEGY = '0x2804add55b205Ce5930D7807Ad6183D8f3345974' as `0x${string}`;
const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

if (!DEPLOYER_PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY not set in .env.local');
  process.exit(1);
}

const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

async function whitelistNFT() {
  console.log('🔧 Whitelisting Passport NFT in YieldStrategy V3...\n');
  console.log('YieldStrategy:', YIELD_STRATEGY);
  console.log('Passport NFT:', PASSPORT_NFT);
  console.log('Deployer:', account.address);
  console.log('');

  // Check if already whitelisted
  try {
    const isWhitelisted = await publicClient.readContract({
      address: YIELD_STRATEGY,
      abi: parseAbi(['function acceptedNFTs(address) view returns (bool)']),
      functionName: 'acceptedNFTs',
      args: [PASSPORT_NFT],
    });

    if (isWhitelisted) {
      console.log('✅ Passport NFT is already whitelisted!');
      return;
    }

    console.log('❌ Passport NFT is NOT whitelisted. Adding it now...\n');
  } catch (err: any) {
    console.error('⚠️  Could not check whitelist status:', err.message);
    console.log('Attempting to whitelist anyway...\n');
  }

  // Whitelist the NFT
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: YIELD_STRATEGY,
      abi: parseAbi(['function whitelistNFT(address nftAddress, bool accepted) external']),
      functionName: 'whitelistNFT',
      args: [PASSPORT_NFT, true],
    });

    console.log('📤 Sending whitelist transaction...');
    const hash = await walletClient.writeContract(request);
    console.log('📝 TX Hash:', hash);

    console.log('⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ Passport NFT successfully whitelisted!');
      console.log('📊 Gas used:', receipt.gasUsed.toString());
      console.log('');
      console.log('You can now stake with your Passport NFT!');
    } else {
      console.log('❌ Transaction failed');
    }
  } catch (err: any) {
    console.error('❌ Whitelist transaction failed:', err.message);

    if (err.message.includes('Ownable')) {
      console.log('\n💡 TIP: Only the contract owner can whitelist NFTs.');
      console.log('   Make sure you\'re using the deployer account that owns the YieldStrategy.');
    }
  }
}

whitelistNFT().catch(console.error);
