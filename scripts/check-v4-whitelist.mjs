/**
 * Check if Passport NFT is whitelisted in V4 YieldStrategy
 */

import { createPublicClient, http, parseAbi, defineChain } from 'viem';
import dotenv from 'dotenv';

dotenv.config();

const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT || '0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8';
const YIELD_STRATEGY_V4 = '0xe3d8E4358aD401F857100aB05747Ed91e78D6913';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
});

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

async function checkV4Whitelist() {
  console.log('🔍 Checking V4 YieldStrategy whitelist status...\n');
  console.log('YieldStrategy V4:', YIELD_STRATEGY_V4);
  console.log('Passport NFT:', PASSPORT_NFT);
  console.log('');

  try {
    // V4 uses acceptedNFTs mapping
    const isWhitelisted = await client.readContract({
      address: YIELD_STRATEGY_V4,
      abi: parseAbi(['function acceptedNFTs(address) view returns (bool)']),
      functionName: 'acceptedNFTs',
      args: [PASSPORT_NFT],
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (isWhitelisted) {
      console.log('✅ Passport NFT IS whitelisted in V4!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n🎉 Delegation should be able to stake TOURS!\n');
    } else {
      console.log('❌ Passport NFT is NOT whitelisted in V4');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n⚠️  This is blocking delegation from staking!\n');
      console.log('📝 To whitelist, run:');
      console.log('   node scripts/whitelist-execute.mjs addAcceptedNFT', PASSPORT_NFT);
      console.log('');
    }

    // Check contract owner
    const owner = await client.readContract({
      address: YIELD_STRATEGY_V4,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    });
    console.log('Contract owner:', owner);

  } catch (err) {
    console.error('❌ Error checking whitelist:', err.message);
  }
}

checkV4Whitelist().catch(console.error);
