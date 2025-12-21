import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, Address, parseAbi, encodeFunctionData } from 'viem';
import { monadTestnet } from '@/app/chains';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const neynar = new NeynarAPIClient({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
});

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const MUSIC_BEAT_MATCH = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH as Address;
const COUNTRY_COLLECTOR = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR as Address;
const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret-change-in-production';

/**
 * Autonomous Game Management Cron
 *
 * Runs hourly to:
 * 1. Finalize expired Beat Match challenges
 * 2. Create new Beat Match challenges (using Gemini AI)
 * 3. Finalize expired Country Collector challenges
 * 4. Create new Country Collector challenges (using Gemini AI)
 *
 * Called by:
 * - Railway cron (hourly via railway.json)
 * - node-cron scheduler (backup via instrumentation.ts)
 */
export async function GET(req: NextRequest) {
  try {
    // Security check
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Game Manager] Running autonomous game management...');

    const client = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    const actions: string[] = [];
    const now = BigInt(Math.floor(Date.now() / 1000));

    // ============= BEAT MATCH =============
    console.log('[Beat Match] Checking current challenge...');

    let currentChallenge: any = null;
    let needsNewChallenge = false;

    try {
      currentChallenge = await client.readContract({
        address: MUSIC_BEAT_MATCH,
        abi: parseAbi([
          'function getCurrentChallenge() view returns (tuple(uint256 challengeId, uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash, uint256 startTime, uint256 endTime, uint256 correctGuesses, uint256 totalGuesses, uint256 rewardPool, bool active, bytes32 answerHash))'
        ]),
        functionName: 'getCurrentChallenge',
      }) as any;

      // Finalize if expired
      if (currentChallenge.active && currentChallenge.endTime < now) {
        console.log(`[Beat Match] Finalizing expired challenge #${currentChallenge.challengeId}...`);

        const finalizeTx = await sendSafeTransaction([{
          to: MUSIC_BEAT_MATCH,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function finalizeChallenge(uint256 challengeId)']),
            functionName: 'finalizeChallenge',
            args: [currentChallenge.challengeId],
          }) as `0x${string}`,
        }]);

        actions.push(`Finalized Beat Match challenge #${currentChallenge.challengeId}: ${finalizeTx}`);
        console.log(`[Beat Match] ✅ Finalized`);
      }

      // Check if new challenge needed
      needsNewChallenge = !currentChallenge.active || currentChallenge.endTime < now;
    } catch (error) {
      console.log('[Beat Match] No current challenge found (first time)');
      needsNewChallenge = true;
    }

    // Create new challenge if needed
    if (needsNewChallenge) {
      console.log('[Beat Match] Creating new challenge...');

      const beatMatchResult = await createBeatMatch(client);
      actions.push(`Created Beat Match challenge: ${beatMatchResult.reason}`);
      console.log(`[Beat Match] ✅ Created: ${beatMatchResult.songTitle} by @${beatMatchResult.artistUsername}`);
    }

    // ============= COUNTRY COLLECTOR =============
    console.log('[Country Collector] Checking current challenge...');

    let currentWeek: any = null;
    let needsNewWeek = false;

    try {
      currentWeek = await client.readContract({
        address: COUNTRY_COLLECTOR,
        abi: parseAbi([
          'function getCurrentChallenge() view returns (tuple(uint256 id, string countryCode, string countryName, uint256[3] artistIds, uint256 startTime, uint256 endTime, uint256 rewardPool, bool active, bool finalized))'
        ]),
        functionName: 'getCurrentChallenge',
      }) as any;

      // Finalize if expired
      if (currentWeek.active && !currentWeek.finalized && currentWeek.endTime < now) {
        console.log(`[Country Collector] Finalizing expired week #${currentWeek.id}...`);

        const finalizeTx = await sendSafeTransaction([{
          to: COUNTRY_COLLECTOR,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function finalizeChallenge(uint256 weekId)']),
            functionName: 'finalizeChallenge',
            args: [currentWeek.id],
          }) as `0x${string}`,
        }]);

        actions.push(`Finalized Country Collector week #${currentWeek.id}: ${finalizeTx}`);
        console.log(`[Country Collector] ✅ Finalized`);
      }

      // Check if new challenge needed
      needsNewWeek = !currentWeek.active || currentWeek.endTime < now;
    } catch (error) {
      console.log('[Country Collector] No current challenge found (first time)');
      needsNewWeek = true;
    }

    // Create new challenge if needed
    if (needsNewWeek) {
      console.log('[Country Collector] Creating new challenge...');

      const collectorResult = await createCountryCollector(client);
      actions.push(`Created Country Collector challenge: ${collectorResult.country} (${collectorResult.reason})`);
      console.log(`[Country Collector] ✅ Created: ${collectorResult.country}`);
    }

    console.log('[Game Manager] ✅ Complete');

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      actions,
    });

  } catch (error: any) {
    console.error('[Game Manager] Error:', error);
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
 * Create Beat Match challenge with random selection
 */
async function createBeatMatch(client: any) {
  // Fetch available music
  const query = `
    query GetMusic {
      MusicNFT(
        where: {
          isBurned: {_eq: false},
          isArt: {_eq: false}
        },
        limit: 20,
        order_by: {mintedAt: desc}
      ) {
        tokenId
        name
        artist
        previewAudioUrl
        fullAudioUrl
      }
    }
  `;

  const response = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();
  const musicNFTs = data.data?.MusicNFT || [];

  if (musicNFTs.length === 0) {
    throw new Error('No music NFTs available');
  }

  // Random selection
  const randomIndex = Math.floor(Math.random() * musicNFTs.length);
  const selectedMusic = musicNFTs[randomIndex];
  const selectionReason = `Random selection from ${musicNFTs.length} available tracks`;

  // Get artist's Farcaster username
  const artistUsername = await getArtistUsername(selectedMusic.artist);

  // Create challenge via bot Safe
  const artistId = BigInt(selectedMusic.tokenId);
  const songTitle = selectedMusic.name;
  const ipfsHash = selectedMusic.previewAudioUrl || selectedMusic.fullAudioUrl || `placeholder-${Date.now()}`;

  const tx = await sendSafeTransaction([{
    to: MUSIC_BEAT_MATCH,
    value: 0n,
    data: encodeFunctionData({
      abi: parseAbi(['function createDailyChallenge(uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash)']),
      functionName: 'createDailyChallenge',
      args: [artistId, songTitle, artistUsername, ipfsHash],
    }) as `0x${string}`,
  }]);

  return {
    songTitle,
    artistUsername,
    reason: selectionReason,
    tx,
  };
}

/**
 * Create Country Collector challenge with random selection
 */
async function createCountryCollector(client: any) {
  // Get passport distribution by country
  const query = `
    query GetCountries {
      PassportNFT(limit: 1000) {
        countryCode
        countryName
        owner
      }
    }
  `;

  const response = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();
  const passports = data.data?.PassportNFT || [];

  // Count passports per country
  const countryMap = new Map<string, { name: string; count: number; owners: Set<string> }>();
  passports.forEach((p: any) => {
    if (!p.countryCode || !p.countryName) return;
    const existing = countryMap.get(p.countryCode);
    if (existing) {
      existing.count++;
      existing.owners.add(p.owner);
    } else {
      countryMap.set(p.countryCode, { name: p.countryName, count: 1, owners: new Set([p.owner]) });
    }
  });

  const countries = Array.from(countryMap.entries())
    .map(([code, info]) => ({ code, name: info.name, count: info.count, owners: Array.from(info.owners) }))
    .filter(c => c.count >= 3);

  if (countries.length === 0) {
    throw new Error('No countries with enough artists');
  }

  let selectedCountry;
  let selectionReason = 'Random selection';
  let artistIds: bigint[] = [];

  // Try up to 5 different countries to find one with 3+ music NFTs
  for (let attempt = 0; attempt < 5; attempt++) {
    const randomIndex = Math.floor(Math.random() * countries.length);
    selectedCountry = countries[randomIndex];
    selectionReason = `Random selection from ${countries.length} available countries`;

    if (attempt > 0) {
      console.log(`[Country Collector] Retry #${attempt}: Trying ${selectedCountry.name}...`);
    }

    // Get music from artists in this country
    const musicQuery = `
      query GetMusic($artists: [String!]!) {
        MusicNFT(
          where: {
            artist: {_in: $artists},
            isBurned: {_eq: false},
            isArt: {_eq: false}
          },
          limit: 5
        ) {
          tokenId
        }
      }
    `;

    const musicResponse = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: musicQuery,
        variables: { artists: selectedCountry.owners },
      }),
    });

    const musicData = await musicResponse.json();
    artistIds = musicData.data?.MusicNFT?.slice(0, 3).map((m: any) => BigInt(m.tokenId)) || [];

    if (artistIds.length >= 3) {
      console.log(`[Country Collector] ✅ Found ${artistIds.length} artists for ${selectedCountry.name}`);
      break; // Success! Exit retry loop
    }

    console.log(`[Country Collector] ⚠️  ${selectedCountry.name} only has ${artistIds.length} music NFTs`);
  }

  if (artistIds.length < 3) {
    throw new Error(`Could not find a country with 3+ music NFTs after 5 attempts`);
  }

  // Type guard: ensure selectedCountry is defined
  if (!selectedCountry) {
    throw new Error('No country was selected during retry loop');
  }

  // Create challenge via bot Safe
  const tx = await sendSafeTransaction([{
    to: COUNTRY_COLLECTOR,
    value: 0n,
    data: encodeFunctionData({
      abi: parseAbi(['function createWeeklyChallenge(string country, string countryCode, uint256[3] artistIds)']),
      functionName: 'createWeeklyChallenge',
      args: [selectedCountry.name, selectedCountry.code, artistIds as [bigint, bigint, bigint]],
    }) as `0x${string}`,
  }]);

  return {
    country: selectedCountry.name,
    reason: selectionReason,
    tx,
  };
}

export async function POST(req: NextRequest) {
  return GET(req);
}
