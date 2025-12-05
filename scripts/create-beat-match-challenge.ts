import { createPublicClient, createWalletClient, http, defineChain, Address, encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import MusicBeatMatchABI from '../src/abis/MusicBeatMatch.json';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  testnet: true,
});

const MUSIC_BEAT_MATCH = '0xee83AC7E916f4feBDb7297363B47eE370FE2EC87' as Address;

// You'll need to provide the deployer private key or use Platform Safe via delegation
async function createChallenge() {
  console.log('\n========================================');
  console.log('   CREATE MUSIC BEAT MATCH CHALLENGE');
  console.log('========================================\n');

  // Check if deployer key is available
  const deployerKey = process.env.DEPLOYER_KEY;
  if (!deployerKey) {
    console.error('❌ DEPLOYER_KEY not found in environment variables');
    console.log('\nTo create a challenge, you need to either:');
    console.log('1. Add DEPLOYER_KEY to .env.local (owner of the contract)');
    console.log('2. Or use the keeper address (Platform Safe)');
    console.log('\nKeeper address: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20');
    console.log('Owner address: 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9\n');
    return;
  }

  const account = privateKeyToAccount(deployerKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  console.log(`Using account: ${account.address}\n`);

  // Example challenge data - you can customize these
  const artistId = 1n; // Use an actual music NFT token ID from your platform
  const songTitle = "Mystery Track of the Day";
  const ipfsAudioHash = "QmExampleIPFSHash123"; // Replace with actual IPFS hash

  console.log('Challenge details:');
  console.log(`  Artist ID: ${artistId}`);
  console.log(`  Song Title: ${songTitle}`);
  console.log(`  IPFS Hash: ${ipfsAudioHash}\n`);

  try {
    // Simulate the transaction first
    console.log('⏳ Simulating transaction...');
    const { request } = await publicClient.simulateContract({
      account: account.address,
      address: MUSIC_BEAT_MATCH,
      abi: MusicBeatMatchABI,
      functionName: 'createDailyChallenge',
      args: [artistId, songTitle, ipfsAudioHash],
    });

    console.log('✅ Simulation successful\n');

    // Execute the transaction
    console.log('⏳ Creating challenge...');
    const hash = await walletClient.writeContract(request);
    console.log(`Transaction hash: ${hash}\n`);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ Challenge created successfully!');
      console.log(`Block: ${receipt.blockNumber}`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);
      console.log('View on MonadScan:');
      console.log(`https://testnet.monadscan.com/tx/${hash}\n`);
    } else {
      console.log('❌ Transaction failed');
    }

  } catch (error: any) {
    console.error('❌ Error creating challenge:', error.message);

    if (error.message.includes('Not keeper or owner')) {
      console.log('\n⚠️  Your address is not authorized. The contract requires either:');
      console.log('   - Owner: 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9');
      console.log('   - Keeper: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20\n');
    }
  }
}

createChallenge()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
