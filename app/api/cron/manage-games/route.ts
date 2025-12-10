import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createPublicClient, http, Address, parseAbi, encodeFunctionData } from 'viem';
import { monadTestnet } from '@/app/chains';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const neynar = new NeynarAPIClient({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
});

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const MUSIC_BEAT_MATCH_V2 = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2 as Address;
const COUNTRY_COLLECTOR_V2 = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V2 as Address;
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

    // ============= BEAT MATCH =============
    console.log('[Beat Match] Checking current challenge...');

    const currentChallenge = await client.readContract({
      address: MUSIC_BEAT_MATCH_V2,
      abi: parseAbi([
        'function getCurrentChallenge() view returns (uint256 challengeId, uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash, uint256 startTime, uint256 endTime, bool active, bool finalized, address winner)'
      ]),
      functionName: 'getCurrentChallenge',
    }) as any;

    const now = BigInt(Math.floor(Date.now() / 1000));

    // Finalize if expired
    if (currentChallenge.active && !currentChallenge.finalized && currentChallenge.endTime < now) {
      console.log(`[Beat Match] Finalizing expired challenge #${currentChallenge.challengeId}...`);

      const finalizeTx = await sendSafeTransaction([{
        to: MUSIC_BEAT_MATCH_V2,
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

    // Create new challenge if needed
    if (!currentChallenge.active || currentChallenge.endTime < now) {
      console.log('[Beat Match] Creating new challenge with Gemini AI...');

      const beatMatchResult = await createBeatMatchWithGemini(client);
      actions.push(`Created Beat Match challenge: ${beatMatchResult.reason}`);
      console.log(`[Beat Match] ✅ Created: ${beatMatchResult.songTitle} by @${beatMatchResult.artistUsername}`);
    }

    // ============= COUNTRY COLLECTOR =============
    console.log('[Country Collector] Checking current challenge...');

    const currentWeek = await client.readContract({
      address: COUNTRY_COLLECTOR_V2,
      abi: parseAbi([
        'function getCurrentWeek() view returns (uint256 weekId, string country, string countryCode, uint256[3] artistIds, uint256 startTime, uint256 endTime, bool active, bool finalized)'
      ]),
      functionName: 'getCurrentWeek',
    }) as any;

    // Finalize if expired
    if (currentWeek.active && !currentWeek.finalized && currentWeek.endTime < now) {
      console.log(`[Country Collector] Finalizing expired week #${currentWeek.weekId}...`);

      const finalizeTx = await sendSafeTransaction([{
        to: COUNTRY_COLLECTOR_V2,
        value: 0n,
        data: encodeFunctionData({
          abi: parseAbi(['function finalizeWeek(uint256 weekId)']),
          functionName: 'finalizeWeek',
          args: [currentWeek.weekId],
        }) as `0x${string}`,
      }]);

      actions.push(`Finalized Country Collector week #${currentWeek.weekId}: ${finalizeTx}`);
      console.log(`[Country Collector] ✅ Finalized`);
    }

    // Create new challenge if needed
    if (!currentWeek.active || currentWeek.endTime < now) {
      console.log('[Country Collector] Creating new challenge with Gemini AI...');

      const collectorResult = await createCountryCollectorWithGemini(client);
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
 * Create Beat Match challenge using Gemini AI for intelligent selection
 */
async function createBeatMatchWithGemini(client: any) {
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
        genre
        mood
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

  // Use Gemini to pick the best song
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
  const prompt = `
You are selecting music for today's "Music Beat Match" game challenge.

Available songs:
${musicNFTs.map((m: any, i: number) => `${i + 1}. "${m.name}" (Token #${m.tokenId}) - Genre: ${m.genre || 'Unknown'}, Mood: ${m.mood || 'Unknown'}`).join('\n')}

Select ONE song that would make an engaging, fun daily challenge. Consider:
- Variety from previous days
- Appeal to diverse audience
- Interesting enough to guess

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{"index": <number 0-${musicNFTs.length - 1}>, "reason": "<brief reason>"}
`;

  const result = await model.generateContent(prompt);
  let responseText = result.response.text().trim();

  // Clean up response
  responseText = responseText.replace(/```json\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
  const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
  if (jsonMatch) responseText = jsonMatch[0];

  const selection = JSON.parse(responseText);
  const selectedMusic = musicNFTs[selection.index];

  // Get artist's Farcaster username
  const artistUsername = await getArtistUsername(selectedMusic.artist);

  // Create challenge via bot Safe
  const artistId = BigInt(selectedMusic.tokenId);
  const songTitle = selectedMusic.name;
  const ipfsHash = selectedMusic.imageUrl || `placeholder-${Date.now()}`;

  const tx = await sendSafeTransaction([{
    to: MUSIC_BEAT_MATCH_V2,
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
    reason: selection.reason,
    tx,
  };
}

/**
 * Create Country Collector challenge using Gemini AI for intelligent selection
 */
async function createCountryCollectorWithGemini(client: any) {
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

  // Use Gemini to pick the best country
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
  const prompt = `
You are selecting a country for this week's "Country Collector" game challenge.

Available countries (with number of artists):
${countries.map((c, i) => `${i + 1}. ${c.name} (${c.code}) - ${c.count} artists`).join('\n')}

Select ONE country that would make an engaging weekly challenge. Consider:
- Cultural diversity
- Geographic variety
- Player interest

Respond ONLY with valid JSON in this exact format (no markdown):
{"index": <number 0-${countries.length - 1}>, "reason": "<brief reason>"}
`;

  const result = await model.generateContent(prompt);
  let responseText = result.response.text().trim();

  // Clean up response
  responseText = responseText.replace(/```json\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
  const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
  if (jsonMatch) responseText = jsonMatch[0];

  const selection = JSON.parse(responseText);
  const selectedCountry = countries[selection.index];

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
  const artistIds = musicData.data?.MusicNFT?.slice(0, 3).map((m: any) => BigInt(m.tokenId)) || [];

  if (artistIds.length < 3) {
    throw new Error(`Not enough artists for ${selectedCountry.name}`);
  }

  // Create challenge via bot Safe
  const tx = await sendSafeTransaction([{
    to: COUNTRY_COLLECTOR_V2,
    value: 0n,
    data: encodeFunctionData({
      abi: parseAbi(['function createWeeklyChallenge(string country, string countryCode, uint256[3] artistIds)']),
      functionName: 'createWeeklyChallenge',
      args: [selectedCountry.name, selectedCountry.code, artistIds],
    }) as `0x${string}`,
  }]);

  return {
    country: selectedCountry.name,
    reason: selection.reason,
    tx,
  };
}

export async function POST(req: NextRequest) {
  return GET(req);
}
