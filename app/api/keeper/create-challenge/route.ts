import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createPublicClient, createWalletClient, http, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';
import MusicBeatMatchABI from '@/src/abis/MusicBeatMatch.json';
import CountryCollectorABI from '@/src/abis/CountryCollector.json';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const neynar = new NeynarAPIClient({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
});
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

// Use V2 contracts if available, fallback to V1
const MUSIC_BEAT_MATCH = (process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2 || process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH) as Address;
const COUNTRY_COLLECTOR = (process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V2 || process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR) as Address;

// Simple authentication - use a secret key
const KEEPER_SECRET = process.env.KEEPER_SECRET || 'your-secret-key-change-this';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const account = privateKeyToAccount(
  (process.env.PLATFORM_SAFE_KEY || process.env.DEPLOYER_PRIVATE_KEY)! as `0x${string}`
);

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

/**
 * API endpoint to create game challenges using Gemini AI
 *
 * Usage:
 *   POST /api/keeper/create-challenge
 *   Body: { type: "beat-match" | "collector", secret: "your-secret" }
 *
 * Can be triggered by:
 *   - cron-job.org (free external cron service)
 *   - GitHub Actions (free for public repos)
 *   - Any HTTP request scheduler
 */
export async function POST(req: NextRequest) {
  try {
    // Simple authentication
    const body = await req.json();
    const { type, secret } = body;

    if (secret !== KEEPER_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`🤖 Keeper: Creating ${type} challenge with Gemini AI...`);

    if (type === 'beat-match') {
      const result = await createBeatMatchChallengeWithGemini();
      return NextResponse.json(result);
    } else if (type === 'collector') {
      const result = await createCollectorChallengeWithGemini();
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Keeper challenge creation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    console.warn('Could not fetch username for', artistAddress, error);
  }
  // Fallback to truncated address
  return `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
}

/**
 * Use Gemini AI to intelligently select music and create Beat Match challenge
 */
async function createBeatMatchChallengeWithGemini() {
  console.log('🎵 Fetching music from Envio...');

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
        previewAudioUrl
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

  console.log(`Found ${musicNFTs.length} music NFTs`);

  // Use Gemini to pick the best one for today's challenge
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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
  const responseText = result.response.text().trim();

  // Clean up response if it has markdown code blocks
  const cleanedResponse = responseText
    .replace(/```json\n/g, '')
    .replace(/```\n/g, '')
    .replace(/```/g, '')
    .trim();

  const selection = JSON.parse(cleanedResponse);
  const selectedMusic = musicNFTs[selection.index];

  console.log(`✅ Gemini selected: "${selectedMusic.name}" (Token #${selectedMusic.tokenId})`);
  console.log(`   Reason: ${selection.reason}`);

  // Get artist's Farcaster username
  const artistUsername = await getArtistUsername(selectedMusic.artist);
  console.log(`   Artist username: @${artistUsername}`);

  // Create challenge on blockchain
  const artistId = BigInt(selectedMusic.tokenId);
  const songTitle = selectedMusic.name;
  const ipfsHash = `placeholder-${Date.now()}`; // TODO: Add audio processing

  console.log('📡 Creating challenge on blockchain...');

  // V2 contracts support artistUsername parameter
  const { request } = await publicClient.simulateContract({
    account: account.address,
    address: MUSIC_BEAT_MATCH,
    abi: MusicBeatMatchABI,
    functionName: 'createDailyChallenge',
    args: [artistId, songTitle, artistUsername, ipfsHash],
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ Challenge created successfully!');

  return {
    success: true,
    type: 'beat-match',
    txHash: hash,
    challenge: {
      artistId: selectedMusic.tokenId,
      songTitle: selectedMusic.name,
      artistUsername,
      reason: selection.reason,
    },
    monadScan: `https://testnet.monadscan.com/tx/${hash}`,
  };
}

/**
 * Use Gemini AI to intelligently select country and create Collector challenge
 */
async function createCollectorChallengeWithGemini() {
  console.log('🌍 Fetching passport data from Envio...');

  // Get passport distribution by country
  const query = `
    query GetCountries {
      PassportNFT(limit: 1000) {
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

  const data = await response.json();
  const passports = data.data?.PassportNFT || [];

  // Count passports per country
  const countryMap = new Map<string, { name: string; count: number }>();
  passports.forEach((p: any) => {
    if (!p.countryCode || !p.countryName) return;
    const existing = countryMap.get(p.countryCode);
    if (existing) {
      existing.count++;
    } else {
      countryMap.set(p.countryCode, { name: p.countryName, count: 1 });
    }
  });

  const countries = Array.from(countryMap.entries())
    .map(([code, info]) => ({ code, name: info.name, count: info.count }))
    .filter(c => c.count >= 3); // Need at least 3 for challenge

  if (countries.length === 0) {
    throw new Error('No countries with enough artists');
  }

  console.log(`Found ${countries.length} countries with enough artists`);

  // Use Gemini to pick the best country
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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
  const responseText = result.response.text().trim();
  const cleanedResponse = responseText
    .replace(/```json\n/g, '')
    .replace(/```\n/g, '')
    .replace(/```/g, '')
    .trim();

  const selection = JSON.parse(cleanedResponse);
  const selectedCountry = countries[selection.index];

  console.log(`✅ Gemini selected: ${selectedCountry.name} (${selectedCountry.code})`);
  console.log(`   Reason: ${selection.reason}`);

  // Get artists from this country
  const artistsQuery = `
    query GetArtists($countryCode: String!) {
      PassportNFT(where: {countryCode: {_eq: $countryCode}}, limit: 10) {
        owner
      }
    }
  `;

  const artistsResponse = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: artistsQuery,
      variables: { countryCode: selectedCountry.code },
    }),
  });

  const artistsData = await artistsResponse.json();
  const artistAddresses = [
    ...new Set(artistsData.data?.PassportNFT?.map((p: any) => p.owner) || []),
  ];

  // Get music from these artists
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
      variables: { artists: artistAddresses },
    }),
  });

  const musicData = await musicResponse.json();
  const artistIds = musicData.data?.MusicNFT?.slice(0, 3).map((m: any) =>
    BigInt(m.tokenId)
  ) || [];

  if (artistIds.length < 3) {
    throw new Error(`Not enough artists for ${selectedCountry.name}`);
  }

  console.log('📡 Creating challenge on blockchain...');

  const { request } = await publicClient.simulateContract({
    account: account.address,
    address: COUNTRY_COLLECTOR,
    abi: CountryCollectorABI,
    functionName: 'createWeeklyChallenge',
    args: [selectedCountry.name, selectedCountry.code, artistIds],
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ Challenge created successfully!');

  return {
    success: true,
    type: 'collector',
    txHash: hash,
    challenge: {
      country: selectedCountry.name,
      countryCode: selectedCountry.code,
      artistCount: selectedCountry.count,
      reason: selection.reason,
    },
    monadScan: `https://testnet.monadscan.com/tx/${hash}`,
  };
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Keeper challenge creator ready',
    timestamp: new Date().toISOString(),
  });
}
