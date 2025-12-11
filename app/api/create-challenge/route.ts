import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, Address, parseAbi, encodeFunctionData } from 'viem';
import { monadTestnet } from '@/app/chains';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const neynar = new NeynarAPIClient({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
      // Check if there's already an active challenge
      try {
        const currentChallenge = await client.readContract({
          address: MUSIC_BEAT_MATCH_V2,
          abi: parseAbi([
            'function getCurrentChallenge() view returns (tuple(uint256 challengeId, uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash, uint256 startTime, uint256 endTime, uint256 correctGuesses, uint256 totalGuesses, uint256 rewardPool, bool active, bytes32 answerHash))'
          ]),
          functionName: 'getCurrentChallenge',
        }) as any;

        if (currentChallenge.active && currentChallenge.endTime > now) {
          return NextResponse.json({
            success: false,
            error: 'An active Beat Match challenge already exists. Wait for it to expire before creating a new one.'
          }, { status: 400 });
        }

        // Finalize expired challenge first
        if (currentChallenge.active && currentChallenge.endTime < now) {
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
      } catch (error) {
        console.log('[Beat Match] No current challenge found');
      }

      // Create new challenge
      const beatMatchResult = await createBeatMatchWithGemini(client);
      actions.push(`Created Beat Match: ${beatMatchResult.songTitle} by @${beatMatchResult.artistUsername}`);

      return NextResponse.json({
        success: true,
        type: 'beat-match',
        actions,
        challenge: beatMatchResult,
      });
    }

    if (type === 'country-collector') {
      // Check if there's already an active challenge
      try {
        const currentWeek = await client.readContract({
          address: COUNTRY_COLLECTOR_V2,
          abi: parseAbi([
            'function getCurrentChallenge() view returns (tuple(uint256 id, string countryCode, string countryName, uint256[3] artistIds, uint256 startTime, uint256 endTime, uint256 rewardPool, bool active, bool finalized))'
          ]),
          functionName: 'getCurrentChallenge',
        }) as any;

        if (currentWeek.active && !currentWeek.finalized && currentWeek.endTime > now) {
          return NextResponse.json({
            success: false,
            error: 'An active Country Collector challenge already exists. Wait for it to expire before creating a new one.'
          }, { status: 400 });
        }

        // Finalize expired challenge first
        if (currentWeek.active && !currentWeek.finalized && currentWeek.endTime < now) {
          console.log(`[Country Collector] Finalizing expired week #${currentWeek.id}...`);
          await sendSafeTransaction([{
            to: COUNTRY_COLLECTOR_V2,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function finalizeChallenge(uint256 weekId)']),
              functionName: 'finalizeChallenge',
              args: [currentWeek.id],
            }) as `0x${string}`,
          }]);
          actions.push(`Finalized expired week #${currentWeek.id}`);
        }
      } catch (error) {
        console.log('[Country Collector] No current challenge found');
      }

      // Create new challenge
      const collectorResult = await createCountryCollectorWithGemini(client);
      actions.push(`Created Country Collector: ${collectorResult.country}`);

      return NextResponse.json({
        success: true,
        type: 'country-collector',
        actions,
        challenge: collectorResult,
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
 * Create Beat Match challenge using Gemini AI for intelligent selection
 */
async function createBeatMatchWithGemini(client: any) {
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
    throw new Error('No music NFTs available. Please mint some music first.');
  }

  let selectedMusic;
  let selectionReason = 'Random selection';

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `
You are selecting music for today's "Music Beat Match" game challenge.

Available songs:
${musicNFTs.map((m: any, i: number) => `${i + 1}. "${m.name}" (Token #${m.tokenId}) - Artist: ${m.artist.slice(0, 6)}...${m.artist.slice(-4)}`).join('\n')}

Select ONE song that would make an engaging, fun daily challenge. Consider:
- Variety from previous days
- Appeal to diverse audience
- Interesting enough to guess

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{"index": <number 0-${musicNFTs.length - 1}>, "reason": "<brief reason>"}
`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();

    responseText = responseText.replace(/```json\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) responseText = jsonMatch[0];

    const selection = JSON.parse(responseText);
    selectedMusic = musicNFTs[selection.index];
    selectionReason = selection.reason;
  } catch (error) {
    console.log('[Beat Match] Gemini AI failed, using random selection:', error);
    const randomIndex = Math.floor(Math.random() * musicNFTs.length);
    selectedMusic = musicNFTs[randomIndex];
    selectionReason = `Random selection from ${musicNFTs.length} available tracks`;
  }

  const artistUsername = await getArtistUsername(selectedMusic.artist);
  const artistId = BigInt(selectedMusic.tokenId);
  const songTitle = selectedMusic.name;
  const ipfsHash = selectedMusic.previewAudioUrl || selectedMusic.fullAudioUrl || `placeholder-${Date.now()}`;

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
    reason: selectionReason,
    tx,
  };
}

/**
 * Create Country Collector challenge using Gemini AI for intelligent selection
 */
async function createCountryCollectorWithGemini(client: any) {
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
    throw new Error('No countries with enough artists (need at least 3). Please mint more passports and music.');
  }

  let selectedCountry;
  let selectionReason = 'Random selection';
  let artistIds: bigint[] = [];

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt === 0) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

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

        responseText = responseText.replace(/```json\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
        const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) responseText = jsonMatch[0];

        const selection = JSON.parse(responseText);
        selectedCountry = countries[selection.index];
        selectionReason = selection.reason;
      } catch (error) {
        console.log('[Country Collector] Gemini AI failed, using random selection:', error);
        const randomIndex = Math.floor(Math.random() * countries.length);
        selectedCountry = countries[randomIndex];
        selectionReason = `Random selection from ${countries.length} available countries`;
      }
    } else {
      const randomIndex = Math.floor(Math.random() * countries.length);
      selectedCountry = countries[randomIndex];
      selectionReason = `Random selection (attempt ${attempt + 1}) from ${countries.length} available countries`;
      console.log(`[Country Collector] Retry #${attempt}: Trying ${selectedCountry.name}...`);
    }

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
      break;
    }

    console.log(`[Country Collector] ⚠️  ${selectedCountry.name} only has ${artistIds.length} music NFTs`);
  }

  if (artistIds.length < 3) {
    throw new Error(`Could not find a country with 3+ music NFTs after 5 attempts. Please mint more music.`);
  }

  if (!selectedCountry) {
    throw new Error('No country was selected during retry loop');
  }

  const tx = await sendSafeTransaction([{
    to: COUNTRY_COLLECTOR_V2,
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
