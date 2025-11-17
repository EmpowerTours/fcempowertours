/**
 * Whitelist MusicLicenseNFTv5 in YieldStrategyV8
 * This allows Music NFTs to be used as collateral for MON staking
 */

import { config } from 'dotenv';
import { createWalletClient, http, parseAbi, Address, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../app/chains';

// Load environment variables
config({ path: '.env.local' });

const YIELD_STRATEGY_V8 = '0xefbD7fE4DeA1280cc5a3a8Bc3762Aa251BBf5ADE' as Address;
const MUSIC_NFT_V5 = '0xEF5d0A0a01112D1d4e0C1A609405F4a359Ef77F5' as Address;

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error('DEPLOYER_PRIVATE_KEY not set in environment');
}

async function main() {
  console.log('🎵 Whitelisting MusicLicenseNFTv5 in YieldStrategyV8...\n');

  // Create account from private key
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY as `0x${string}`);

  // Create wallet client
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  console.log('📝 Configuration:');
  console.log('  YieldStrategyV8:', YIELD_STRATEGY_V8);
  console.log('  MusicNFTv5:', MUSIC_NFT_V5);
  console.log('  Deployer:', account.address);
  console.log();

  // Check current whitelist status
  console.log('🔍 Checking current whitelist status...');
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  try {
    const isWhitelisted = await publicClient.readContract({
      address: YIELD_STRATEGY_V8,
      abi: parseAbi(['function acceptedNFTs(address) external view returns (bool)']),
      functionName: 'acceptedNFTs',
      args: [MUSIC_NFT_V5],
    });

    console.log('  Current status:', isWhitelisted ? '✅ Already whitelisted' : '❌ Not whitelisted');

    if (isWhitelisted) {
      console.log('\n✅ MusicNFTv5 is already whitelisted!');
      return;
    }
  } catch (error) {
    console.log('  Could not check status, proceeding with whitelisting...');
  }

  // Whitelist the Music NFT contract
  console.log('\n💎 Executing whitelistNFT transaction...');

  const hash = await walletClient.writeContract({
    address: YIELD_STRATEGY_V8,
    abi: parseAbi(['function whitelistNFT(address nftAddress, bool accepted) external']),
    functionName: 'whitelistNFT',
    args: [MUSIC_NFT_V5, true],
  });

  console.log('📤 Transaction submitted:', hash);
  console.log('⏳ Waiting for confirmation...');

  // Wait for transaction receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log('\n✅ Transaction confirmed!');
  console.log('  Block:', receipt.blockNumber);
  console.log('  Gas used:', receipt.gasUsed.toString());
  console.log('  Status:', receipt.status === 'success' ? '✅ Success' : '❌ Failed');

  // Verify whitelisting
  console.log('\n🔍 Verifying whitelist status...');
  const verified = await publicClient.readContract({
    address: YIELD_STRATEGY_V8,
    abi: parseAbi(['function acceptedNFTs(address) external view returns (bool)']),
    functionName: 'acceptedNFTs',
    args: [MUSIC_NFT_V5],
  });

  console.log('  Verification:', verified ? '✅ Whitelisted successfully!' : '❌ Verification failed');

  console.log('\n🎉 MusicLicenseNFTv5 is now whitelisted in YieldStrategyV8!');
  console.log('\n📋 Next steps:');
  console.log('  1. Users can now stake Music NFTs with MON capital');
  console.log('  2. Music NFTs will earn Kintsu vault yields');
  console.log('  3. Yield can be allocated to DragonRouter locations');
  console.log('\n🔗 View transaction: https://testnet.monadscan.com/tx/' + hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
