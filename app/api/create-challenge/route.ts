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
const MUSIC_BEAT_MATCH_V2 = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2 as Address;
const COUNTRY_COLLECTOR_V2 = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V2 as Address;

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
          address: MUSIC_BEAT_MATCH_V2,
          abi: parseAbi([
            'function getCurrentChallenge() view returns (tuple(uint256 challengeId, uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash, uint256 startTime, uint256 endTime, uint256 correctGuesses, uint256 totalGuesses, uint256 rewardPool, bool active, bytes32 answerHash))'
          ]),
          functionName: 'getCurrentChallenge',
        }) as any;

        // Check if challenge is active
        if (currentChallenge.active) {
          if (currentChallenge.endTime > now) {
            return NextResponse.json({
              success: false,
              error: 'An active Beat Match challenge already exists. Wait for it to expire or be resolved.'
            }, { status: 400 });
          }

          // Finalize expired challenge first
          if (currentChallenge.endTime < now) {
            console.log(`[Beat Match] Finalizing expired challenge #${currentChallenge.challengeId}...`);
            await sendSafeTransaction([{
              to: MUSIC_BEAT_MATCH_V2,
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

      // Create new challenge with V2 (direct creation)
      const beatMatchResult = await createBeatMatchV2(client);
      actions.push(`Created Beat Match challenge: "${beatMatchResult.songTitle}"`);

      return NextResponse.json({
        success: true,
        type: 'beat-match',
        actions,
        tx: beatMatchResult.tx,
        songTitle: beatMatchResult.songTitle,
        artistUsername: beatMatchResult.artistUsername,
        message: 'Beat Match challenge created successfully!',
      });
    }

    if (type === 'country-collector') {
      // Check if there's already an active challenge using getCurrentChallenge()
      try {
        const currentChallenge = await client.readContract({
          address: COUNTRY_COLLECTOR_V2,
          abi: parseAbi([
            'function getCurrentChallenge() view returns (tuple(uint256 id, string countryCode, string countryName, uint256[3] artistIds, uint256 startTime, uint256 endTime, uint256 rewardPool, bool active, bool finalized))'
          ]),
          functionName: 'getCurrentChallenge',
        }) as any;

        // Check if challenge is active
        if (currentChallenge.active) {
          if (currentChallenge.endTime > now) {
            return NextResponse.json({
              success: false,
              error: 'An active Country Collector challenge already exists. Wait for it to expire or be resolved.'
            }, { status: 400 });
          }

          // Finalize expired challenge first
          if (currentChallenge.endTime < now) {
            console.log(`[Country Collector] Finalizing expired week #${currentChallenge.id}...`);
            await sendSafeTransaction([{
              to: COUNTRY_COLLECTOR_V2,
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

      // Create new challenge with V2 (direct creation)
      const collectorResult = await createCountryCollectorV2(client);
      actions.push(`Created Country Collector challenge: ${collectorResult.country}`);

      return NextResponse.json({
        success: true,
        type: 'country-collector',
        actions,
        tx: collectorResult.tx,
        country: collectorResult.country,
        countryCode: collectorResult.countryCode,
        artistIds: collectorResult.artistIds,
        message: 'Country Collector challenge created successfully!',
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
 * Create Beat Match challenge with V2 (direct creation)
 */
async function createBeatMatchV2(client: any) {
  // Fetch eligible music NFTs from Envio
  const musicNFTs = await fetchEligibleMusicNFTs();

  if (musicNFTs.length === 0) {
    throw new Error('No eligible music NFTs found. Please mint some music NFTs first!');
  }

  // Select random NFT using blockhash
  const latestBlock = await client.getBlock({ blockTag: 'latest' });
  const blockHashSeed = BigInt(latestBlock.hash);
  const selectedIndex = Number(blockHashSeed % BigInt(musicNFTs.length));
  const selectedNFT = musicNFTs[selectedIndex];

  console.log(`[Beat Match V2] Selected NFT #${selectedIndex}: ${selectedNFT.name}`);

  // Get artist username
  const artistUsername = await getArtistUsername(selectedNFT.artist);

  // Create challenge on-chain
  const tx = await sendSafeTransaction([{
    to: MUSIC_BEAT_MATCH_V2,
    value: 0n,
    data: encodeFunctionData({
      abi: parseAbi(['function createDailyChallenge(uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash) returns (uint256)']),
      functionName: 'createDailyChallenge',
      args: [
        BigInt(selectedNFT.tokenId), // Use tokenId as artistId
        selectedNFT.name || `Song #${selectedNFT.tokenId}`,
        artistUsername,
        selectedNFT.previewAudioUrl || selectedNFT.fullAudioUrl || '',
      ],
    }) as `0x${string}`,
  }]);

  return {
    tx,
    songTitle: selectedNFT.name || `Song #${selectedNFT.tokenId}`,
    artistUsername,
  };
}

/**
 * Fetch eligible music NFTs from Envio
 */
async function fetchEligibleMusicNFTs(): Promise<any[]> {
  const query = `
    query {
      MusicNFT(
        where: {
          isArt: { _eq: false },
          active: { _eq: true },
          isBurned: { _eq: false },
          metadataFetched: { _eq: true }
        }
        order_by: { mintedAt: desc }
      ) {
        tokenId
        artist
        name
        previewAudioUrl
        fullAudioUrl
        imageUrl
      }
    }
  `;

  const response = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const { data } = await response.json() as any;
  return data?.MusicNFT || [];
}

/**
 * Fetch countries with artists from Envio
 */
async function getCountriesWithArtists(): Promise<Set<string>> {
  const query = `
    query {
      PassportNFT(
        distinct_on: countryCode
        order_by: { countryCode: asc }
      ) {
        countryCode
      }
    }
  `;

  try {
    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const { data } = await response.json();
    const countryCodes = new Set<string>((data?.PassportNFT || []).map((p: any) => p.countryCode as string));
    console.log(`[Country Filter] Found ${countryCodes.size} countries with artists:`, Array.from(countryCodes));
    return countryCodes;
  } catch (error) {
    console.error('[Country Filter] Error fetching countries:', error);
    return new Set();
  }
}

/**
 * Create Country Collector challenge with V2 (direct creation)
 */
async function createCountryCollectorV2(client: any) {
  // Get countries that have artists
  const countriesWithArtists = await getCountriesWithArtists();

  // Filter ALL_COUNTRIES to only those with artists
  const eligibleCountries = ALL_COUNTRIES.filter(c => countriesWithArtists.has(c.code));

  if (eligibleCountries.length === 0) {
    throw new Error('No countries with artists found. Mint a passport NFT first!');
  }

  // Select random country using blockhash
  const latestBlock = await client.getBlock({ blockTag: 'latest' });
  const blockHashSeed = BigInt(latestBlock.hash);
  const selectedIndex = Number(blockHashSeed % BigInt(eligibleCountries.length));
  const randomCountry = eligibleCountries[selectedIndex];

  console.log(`[Country Collector V2] Selected country: ${randomCountry.name} (${randomCountry.code})`);

  // Fetch artists from country
  const artists = await fetchArtistsByCountry(randomCountry.code);

  if (artists.length === 0) {
    throw new Error(`No artists found for ${randomCountry.name}`);
  }

  // Select 3 random artists (allow duplicates if < 3 artists)
  let seed = blockHashSeed;
  const selectedArtistIds: [bigint, bigint, bigint] = [0n, 0n, 0n];

  for (let i = 0; i < 3; i++) {
    const artistIndex = Number(seed % BigInt(artists.length));
    selectedArtistIds[i] = BigInt(artists[artistIndex].artistId);
    seed = BigInt(latestBlock.hash.slice(0, 10 + i * 2)) + BigInt(i); // Vary the seed
  }

  console.log(`[Country Collector V2] Selected ${selectedArtistIds.length} artists:`, selectedArtistIds);

  // Create challenge on-chain
  const tx = await sendSafeTransaction([{
    to: COUNTRY_COLLECTOR_V2,
    value: 0n,
    data: encodeFunctionData({
      abi: parseAbi(['function createWeeklyChallenge(string country, string countryCode, uint256[3] artistIds) returns (uint256)']),
      functionName: 'createWeeklyChallenge',
      args: [randomCountry.name, randomCountry.code, selectedArtistIds],
    }) as `0x${string}`,
  }]);

  return {
    tx,
    country: randomCountry.name,
    countryCode: randomCountry.code,
    artistIds: selectedArtistIds,
  };
}

/**
 * Fetch artists by country from Envio
 */
async function fetchArtistsByCountry(countryCode: string): Promise<any[]> {
  const query = `
    query {
      PassportNFT(
        where: {
          countryCode: { _eq: "${countryCode.toUpperCase()}" }
        }
        order_by: { mintedAt: desc }
        limit: 50
      ) {
        tokenId
        owner
        countryCode
        countryName
      }
    }
  `;

  const response = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const { data } = await response.json() as any;

  // Use tokenId as artistId (in production, you'd have proper artist IDs)
  return (data?.PassportNFT || []).map((p: any) => ({
    artistId: p.tokenId,
    countryCode: p.countryCode,
  }));
}
