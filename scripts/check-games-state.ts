import { createPublicClient, http } from 'viem';
import { monadTestnet } from '@/app/chains';

const MUSIC_BEAT_MATCH_V2 = '0x913E65B7742Da72972fB821468215E89F085F178';
const COUNTRY_COLLECTOR_V2 = '0xC7FfA579f66f6A3142b3e27427b04124F4b3cd61';

async function main() {
  const client = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  console.log('=== Checking Game States ===\n');

  // Check Beat Match
  console.log('--- MusicBeatMatchV2 ---');
  try {
    const challenge = await client.readContract({
      address: MUSIC_BEAT_MATCH_V2 as `0x${string}`,
      abi: [{
        name: 'getCurrentChallenge',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{
          type: 'tuple',
          components: [
            { type: 'uint256', name: 'challengeId' },
            { type: 'uint256', name: 'artistId' },
            { type: 'string', name: 'songTitle' },
            { type: 'string', name: 'artistUsername' },
            { type: 'string', name: 'ipfsAudioHash' },
            { type: 'uint256', name: 'startTime' },
            { type: 'uint256', name: 'endTime' },
            { type: 'uint256', name: 'correctGuesses' },
            { type: 'uint256', name: 'totalGuesses' },
            { type: 'uint256', name: 'rewardPool' },
            { type: 'bool', name: 'active' },
            { type: 'bytes32', name: 'answerHash' },
          ]
        }]
      }],
      functionName: 'getCurrentChallenge',
    }) as any;

    console.log('Raw challenge data:', challenge);
    console.log('\nCurrent Challenge:', {
      challengeId: challenge.challengeId?.toString(),
      artistId: challenge.artistId?.toString(),
      songTitle: challenge.songTitle,
      artistUsername: challenge.artistUsername,
      ipfsAudioHash: challenge.ipfsAudioHash,
      startTime: challenge.startTime ? new Date(Number(challenge.startTime) * 1000).toISOString() : 'N/A',
      endTime: challenge.endTime ? new Date(Number(challenge.endTime) * 1000).toISOString() : 'N/A',
      correctGuesses: challenge.correctGuesses?.toString(),
      totalGuesses: challenge.totalGuesses?.toString(),
      rewardPool: challenge.rewardPool?.toString(),
      active: challenge.active,
      answerHash: challenge.answerHash,
    });
  } catch (error: any) {
    console.error('Error reading Beat Match:', error.message);
  }

  console.log('\n--- CountryCollectorV2 ---');
  try {
    const week = await client.readContract({
      address: COUNTRY_COLLECTOR_V2 as `0x${string}`,
      abi: [{
        name: 'getCurrentChallenge',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{
          type: 'tuple',
          components: [
            { type: 'uint256', name: 'id' },
            { type: 'string', name: 'countryCode' },
            { type: 'string', name: 'countryName' },
            { type: 'uint256[3]', name: 'artistIds' },
            { type: 'uint256', name: 'startTime' },
            { type: 'uint256', name: 'endTime' },
            { type: 'uint256', name: 'rewardPool' },
            { type: 'bool', name: 'active' },
            { type: 'bool', name: 'finalized' },
          ]
        }]
      }],
      functionName: 'getCurrentChallenge',
    }) as any;

    console.log('Raw challenge data:', week);
    console.log('\nCurrent Challenge:', {
      id: week.id?.toString(),
      countryCode: week.countryCode,
      countryName: week.countryName,
      artistIds: week.artistIds?.map((id: bigint) => id.toString()),
      startTime: week.startTime ? new Date(Number(week.startTime) * 1000).toISOString() : 'N/A',
      endTime: week.endTime ? new Date(Number(week.endTime) * 1000).toISOString() : 'N/A',
      rewardPool: week.rewardPool?.toString(),
      active: week.active,
      finalized: week.finalized,
    });
  } catch (error: any) {
    console.error('Error reading Country Collector:', error.message);
  }
}

main().catch(console.error);
