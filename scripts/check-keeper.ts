import { createPublicClient, http, parseAbi } from 'viem';
import { monadTestnet } from '@/app/chains';

const MUSIC_BEAT_MATCH_V2 = '0x913E65B7742Da72972fB821468215E89F085F178';
const COUNTRY_COLLECTOR_V2 = '0xC7FfA579f66f6A3142b3e27427b04124F4b3cd61';

const PLATFORM_SAFE = '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20';
const BOT_SAFE = '0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5';

async function main() {
  const client = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  console.log('=== Checking Keeper Configuration ===\n');
  console.log('Platform Safe:', PLATFORM_SAFE);
  console.log('Bot Safe:     ', BOT_SAFE);
  console.log('');

  // Check MusicBeatMatchV2
  console.log('--- MusicBeatMatchV2 ---');
  console.log('Contract:', MUSIC_BEAT_MATCH_V2);

  try {
    const keeper = await client.readContract({
      address: MUSIC_BEAT_MATCH_V2 as `0x${string}`,
      abi: parseAbi(['function keeper() view returns (address)']),
      functionName: 'keeper',
    });

    const owner = await client.readContract({
      address: MUSIC_BEAT_MATCH_V2 as `0x${string}`,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    });

    console.log('Current Keeper:', keeper);
    console.log('Current Owner: ', owner);
    console.log('Keeper matches Platform Safe:', keeper === PLATFORM_SAFE);
    console.log('Keeper matches Bot Safe:     ', keeper === BOT_SAFE);
    console.log('Owner matches Platform Safe: ', owner === PLATFORM_SAFE);
    console.log('');

    if (keeper !== PLATFORM_SAFE && keeper !== BOT_SAFE) {
      console.log('⚠️  WARNING: Keeper is set to an unknown address!');
    } else if (keeper !== PLATFORM_SAFE) {
      console.log('⚠️  WARNING: Keeper is not set to Platform Safe (which is making the calls)');
      console.log('   The Platform Safe needs to be set as keeper, or we need to use the Bot Safe for transactions');
    }
  } catch (error) {
    console.error('Error reading MusicBeatMatchV2:', error);
  }

  console.log('');

  // Check CountryCollectorV2
  console.log('--- CountryCollectorV2 ---');
  console.log('Contract:', COUNTRY_COLLECTOR_V2);

  try {
    const keeper = await client.readContract({
      address: COUNTRY_COLLECTOR_V2 as `0x${string}`,
      abi: parseAbi(['function keeper() view returns (address)']),
      functionName: 'keeper',
    });

    const owner = await client.readContract({
      address: COUNTRY_COLLECTOR_V2 as `0x${string}`,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    });

    console.log('Current Keeper:', keeper);
    console.log('Current Owner: ', owner);
    console.log('Keeper matches Platform Safe:', keeper === PLATFORM_SAFE);
    console.log('Keeper matches Bot Safe:     ', keeper === BOT_SAFE);
    console.log('Owner matches Platform Safe: ', owner === PLATFORM_SAFE);
    console.log('');

    if (keeper !== PLATFORM_SAFE && keeper !== BOT_SAFE) {
      console.log('⚠️  WARNING: Keeper is set to an unknown address!');
    } else if (keeper !== PLATFORM_SAFE) {
      console.log('⚠️  WARNING: Keeper is not set to Platform Safe (which is making the calls)');
      console.log('   The Platform Safe needs to be set as keeper, or we need to use the Bot Safe for transactions');
    }
  } catch (error) {
    console.error('Error reading CountryCollectorV2:', error);
  }

  console.log('\n=== Recommendation ===');
  console.log('The manage-games cron uses Platform Safe (0x2217...4F20).');
  console.log('Either:');
  console.log('  1. Set Platform Safe as keeper on both contracts, OR');
  console.log('  2. Update manage-games route to use Bot Safe for transactions');
}

main().catch(console.error);
