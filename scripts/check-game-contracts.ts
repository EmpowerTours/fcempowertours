import { createPublicClient, http, formatEther, defineChain, Address } from 'viem';
import MusicBeatMatchABI from '../src/abis/MusicBeatMatch.json';
import CountryCollectorABI from '../src/abis/CountryCollector.json';

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
const COUNTRY_COLLECTOR = '0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200' as Address;
const TOURS_TOKEN = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7' as Address;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function checkGameContracts() {
  console.log('\n========================================');
  console.log('   GAME CONTRACTS DIAGNOSTICS');
  console.log('========================================\n');

  // Check Music Beat Match
  console.log('🎵 MUSIC BEAT MATCH');
  console.log(`Address: ${MUSIC_BEAT_MATCH}\n`);

  try {
    // Check if deployed
    const beatMatchCode = await publicClient.getCode({ address: MUSIC_BEAT_MATCH });
    if (!beatMatchCode || beatMatchCode === '0x') {
      console.error('❌ Music Beat Match contract NOT deployed!\n');
    } else {
      console.log('✅ Contract is deployed');

      // Check owner and keeper
      const owner = await publicClient.readContract({
        address: MUSIC_BEAT_MATCH,
        abi: MusicBeatMatchABI,
        functionName: 'owner',
      });
      console.log(`Owner: ${owner}`);

      const keeper = await publicClient.readContract({
        address: MUSIC_BEAT_MATCH,
        abi: MusicBeatMatchABI,
        functionName: 'keeper',
      });
      console.log(`Keeper: ${keeper}`);

      // Check TOURS balance
      const toursBalance = await publicClient.readContract({
        address: TOURS_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [MUSIC_BEAT_MATCH],
      });
      console.log(`TOURS Balance: ${formatEther(toursBalance)} TOURS`);

      // Check current challenge
      try {
        const challenge = await publicClient.readContract({
          address: MUSIC_BEAT_MATCH,
          abi: MusicBeatMatchABI,
          functionName: 'getCurrentChallenge',
        }) as any;

        if (challenge && challenge.active) {
          const now = Math.floor(Date.now() / 1000);
          const isActive = Number(challenge.endTime) > now;

          console.log(`\nCurrent Challenge:`);
          console.log(`  ID: ${challenge.challengeId}`);
          console.log(`  Song: "${challenge.songTitle}"`);
          console.log(`  Artist ID: ${challenge.artistId}`);
          console.log(`  Active: ${isActive ? '✅ YES' : '❌ NO (expired)'}`);
          console.log(`  End Time: ${new Date(Number(challenge.endTime) * 1000).toLocaleString()}`);
          console.log(`  Reward Pool: ${formatEther(challenge.rewardPool)} TOURS`);
          console.log(`  Guesses: ${challenge.totalGuesses} (${challenge.correctGuesses} correct)`);
        } else {
          console.log(`\n❌ No active challenge found`);
        }
      } catch (err) {
        console.log(`\n❌ Error reading challenge: ${(err as Error).message}`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Error checking Music Beat Match: ${(error as Error).message}`);
  }

  console.log('\n========================================\n');

  // Check Country Collector
  console.log('🌍 COUNTRY COLLECTOR');
  console.log(`Address: ${COUNTRY_COLLECTOR}\n`);

  try {
    // Check if deployed
    const collectorCode = await publicClient.getCode({ address: COUNTRY_COLLECTOR });
    if (!collectorCode || collectorCode === '0x') {
      console.error('❌ Country Collector contract NOT deployed!\n');
    } else {
      console.log('✅ Contract is deployed');

      // Check owner and keeper
      const owner = await publicClient.readContract({
        address: COUNTRY_COLLECTOR,
        abi: CountryCollectorABI,
        functionName: 'owner',
      });
      console.log(`Owner: ${owner}`);

      const keeper = await publicClient.readContract({
        address: COUNTRY_COLLECTOR,
        abi: CountryCollectorABI,
        functionName: 'keeper',
      });
      console.log(`Keeper: ${keeper}`);

      // Check TOURS balance
      const toursBalance = await publicClient.readContract({
        address: TOURS_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [COUNTRY_COLLECTOR],
      });
      console.log(`TOURS Balance: ${formatEther(toursBalance)} TOURS`);

      // Check current challenge
      try {
        const challenge = await publicClient.readContract({
          address: COUNTRY_COLLECTOR,
          abi: CountryCollectorABI,
          functionName: 'getCurrentChallenge',
        }) as any;

        if (challenge && challenge.active) {
          const now = Math.floor(Date.now() / 1000);
          const isActive = Number(challenge.endTime) > now;

          console.log(`\nCurrent Challenge:`);
          console.log(`  ID: ${challenge.id}`);
          console.log(`  Country: ${challenge.countryName} (${challenge.countryCode})`);
          console.log(`  Active: ${isActive ? '✅ YES' : '❌ NO (expired)'}`);
          console.log(`  End Time: ${new Date(Number(challenge.endTime) * 1000).toLocaleString()}`);
          console.log(`  Reward Pool: ${formatEther(challenge.rewardPool)} TOURS`);
          console.log(`  Artist IDs: ${challenge.artistIds.join(', ')}`);
        } else {
          console.log(`\n❌ No active challenge found`);
        }
      } catch (err) {
        console.log(`\n❌ Error reading challenge: ${(err as Error).message}`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Error checking Country Collector: ${(error as Error).message}`);
  }

  console.log('\n========================================');
  console.log('   RECOMMENDATIONS');
  console.log('========================================\n');

  console.log('To make the games functional:');
  console.log('');
  console.log('1. Fund both contracts with TOURS tokens:');
  console.log(`   - Transfer TOURS to ${MUSIC_BEAT_MATCH}`);
  console.log(`   - Transfer TOURS to ${COUNTRY_COLLECTOR}`);
  console.log('   - Recommended: 10,000+ TOURS each for rewards\n');
  console.log('2. Create challenges using keeper account:');
  console.log('   - Music Beat Match: Call createDailyChallenge()');
  console.log('   - Country Collector: Call createWeeklyChallenge()\n');
  console.log('3. Set up automated keeper to create new challenges periodically\n');
}

checkGameContracts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
