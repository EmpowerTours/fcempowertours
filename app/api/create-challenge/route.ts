import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, Address, parseAbi, encodeFunctionData } from 'viem';
import { monadTestnet } from '@/app/chains';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { ALL_COUNTRIES } from '@/lib/passport/countries';

const neynar = new NeynarAPIClient({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
});

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const MUSIC_BEAT_MATCH_V3 = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V3 as Address;
const COUNTRY_COLLECTOR_V3 = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V3 as Address;

/**
 * Public API for manually creating game challenges
 *
 * POST /api/create-challenge
 * Body: { type: "beat-match" | "country-collector" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body;

    if (!type || !['beat-match', 'country-collector'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "beat-match" or "country-collector"' },
        { status: 400 }
      );
    }

    console.log(`[Manual Challenge] Creating ${type} challenge...`);

    const client = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    const now = BigInt(Math.floor(Date.now() / 1000));
    const actions: string[] = [];

    if (type === 'beat-match') {
      // Check if there's already an active challenge using getCurrentChallenge()
      try {
        const currentChallenge = await client.readContract({
          address: MUSIC_BEAT_MATCH_V3,
          abi: parseAbi([
            'function getCurrentChallenge() view returns (tuple(uint256 challengeId, uint256 musicNFTTokenId, uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash, uint256 startTime, uint256 endTime, uint256 correctGuesses, uint256 totalGuesses, uint256 rewardPool, bool active, bool randomnessRequested, bool randomnessFulfilled, bytes32 answerHash))'
          ]),
          functionName: 'getCurrentChallenge',
        }) as any;

        // Check if challenge is active or pending randomness
        if (currentChallenge.active || (currentChallenge.randomnessRequested && !currentChallenge.randomnessFulfilled)) {
          if (currentChallenge.endTime > now) {
            return NextResponse.json({
              success: false,
              error: 'An active or pending Beat Match challenge already exists. Wait for it to expire or be resolved.'
            }, { status: 400 });
          }

          // Finalize expired challenge first
          if (currentChallenge.active && currentChallenge.endTime < now) {
            console.log(`[Beat Match] Finalizing expired challenge #${currentChallenge.challengeId}...`);
            await sendSafeTransaction([{
              to: MUSIC_BEAT_MATCH_V3,
              value: 0n,
              data: encodeFunctionData({
                abi: parseAbi(['function finalizeChallenge(uint256 challengeId)']),
                functionName: 'finalizeChallenge',
                args: [currentChallenge.challengeId],
              }) as `0x${string}`,
            }]);
            actions.push(`Finalized expired challenge #${currentChallenge.challengeId}`);
          }
        }
      } catch (error) {
        console.log('[Beat Match] No current challenge found');
      }

      // Create new challenge with V3 randomness
      const beatMatchResult = await createBeatMatchV3(client);
      actions.push(`Requested Beat Match randomness`);

      return NextResponse.json({
        success: true,
        type: 'beat-match',
        actions,
        tx: beatMatchResult.tx,
        message: 'Randomness requested. Challenge will be created once resolved by the bot.',
      });
    }

    if (type === 'country-collector') {
      // Check if there's already an active challenge using getCurrentChallenge()
      try {
        const currentChallenge = await client.readContract({
          address: COUNTRY_COLLECTOR_V3,
          abi: parseAbi([
            'function getCurrentChallenge() view returns (tuple(uint256 id, string countryCode, string countryName, uint256[3] artistIds, uint256 startTime, uint256 endTime, uint256 rewardPool, bool active, bool finalized, bool randomnessRequested, bool randomnessFulfilled))'
          ]),
          functionName: 'getCurrentChallenge',
        }) as any;

        // Check if challenge is active or pending randomness
        if (currentChallenge.active || (currentChallenge.randomnessRequested && !currentChallenge.randomnessFulfilled)) {
          if (currentChallenge.endTime > now) {
            return NextResponse.json({
              success: false,
              error: 'An active or pending Country Collector challenge already exists. Wait for it to expire or be resolved.'
            }, { status: 400 });
          }

          // Finalize expired challenge first
          if (currentChallenge.active && currentChallenge.endTime < now) {
            console.log(`[Country Collector] Finalizing expired week #${currentChallenge.id}...`);
            await sendSafeTransaction([{
              to: COUNTRY_COLLECTOR_V3,
              value: 0n,
              data: encodeFunctionData({
                abi: parseAbi(['function finalizeChallenge(uint256 weekId)']),
                functionName: 'finalizeChallenge',
                args: [currentChallenge.id],
              }) as `0x${string}`,
            }]);
            actions.push(`Finalized expired week #${currentChallenge.id}`);
          }
        }
      } catch (error) {
        console.log('[Country Collector] No current challenge found');
      }

      // Create new challenge with V3 randomness
      const collectorResult = await createCountryCollectorV3(client);
      actions.push(`Requested Country Collector randomness for ${collectorResult.country}`);

      return NextResponse.json({
        success: true,
        type: 'country-collector',
        actions,
        tx: collectorResult.tx,
        country: collectorResult.country,
        countryCode: collectorResult.countryCode,
        message: 'Randomness requested. Challenge will be created once resolved by the bot.',
      });
    }

  } catch (error: any) {
    console.error('[Manual Challenge] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Helper: Fetch Farcaster username for an Ethereum address
 */
async function getArtistUsername(artistAddress: string): Promise<string> {
  try {
    const users = await neynar.fetchBulkUsersByEthOrSolAddress({ addresses: [artistAddress] });
    if (users?.users?.length > 0) {
      return users.users[0].username;
    }
  } catch (error) {
    console.warn('Could not fetch username for', artistAddress);
  }
  return `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
}

/**
 * Create Beat Match challenge with V3 Switchboard randomness
 */
async function createBeatMatchV3(client: any) {
  // V3: Just request randomness, bot will resolve and create challenge
  const tx = await sendSafeTransaction([{
    to: MUSIC_BEAT_MATCH_V3,
    value: 0n,
    data: encodeFunctionData({
      abi: parseAbi(['function requestRandomSongSelection() returns (uint256 challengeId)']),
      functionName: 'requestRandomSongSelection',
      args: [],
    }) as `0x${string}`,
  }]);

  return {
    tx,
  };
}

/**
 * Create Country Collector challenge with V3 Switchboard randomness
 */
async function createCountryCollectorV3(client: any) {
  // Select a random country
  const randomCountry = ALL_COUNTRIES[Math.floor(Math.random() * ALL_COUNTRIES.length)];

  console.log(`[Country Collector] Selected country: ${randomCountry.name} (${randomCountry.code})`);

  // V3: Just request randomness, bot will resolve and create challenge
  const tx = await sendSafeTransaction([{
    to: COUNTRY_COLLECTOR_V3,
    value: 0n,
    data: encodeFunctionData({
      abi: parseAbi(['function requestRandomArtistSelection(string country, string countryCode) returns (uint256 weekId)']),
      functionName: 'requestRandomArtistSelection',
      args: [randomCountry.name, randomCountry.code],
    }) as `0x${string}`,
  }]);

  return {
    tx,
    country: randomCountry.name,
    countryCode: randomCountry.code,
  };
}
