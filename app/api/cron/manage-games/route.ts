import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, encodeFunctionData, parseAbi, Address, Hex } from 'viem';
import { monadTestnet } from '@/app/chains';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
const MUSIC_BEAT_MATCH_V2 = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2 as Address;
const COUNTRY_COLLECTOR_V2 = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V2 as Address;

// Cron secret for security
const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret-change-in-production';

/**
 * Autonomous Game Management Cron
 * Runs every hour to:
 * 1. Check if Beat Match challenge needs finalization/creation
 * 2. Check if Country Collector challenge needs finalization/creation
 */
export async function GET(req: NextRequest) {
  try {
    // Security check
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🤖 [CRON] Starting autonomous game management...');

    const client = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    const results = {
      beatMatch: { checked: false, finalized: false, created: false, error: null as string | null },
      countryCollector: { checked: false, finalized: false, created: false, error: null as string | null },
    };

    // ==================== BEAT MATCH MANAGEMENT ====================
    try {
      console.log('🎵 Checking Beat Match challenge...');

      // Get current challenge
      const currentChallenge = await client.readContract({
        address: MUSIC_BEAT_MATCH_V2,
        abi: parseAbi(['function getCurrentChallenge() view returns (tuple(uint256 challengeId, uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash, uint256 startTime, uint256 endTime, uint256 correctGuesses, uint256 totalGuesses, uint256 rewardPool, bool active, bytes32 answerHash))']),
        functionName: 'getCurrentChallenge',
      }) as any;

      results.beatMatch.checked = true;
      const now = BigInt(Math.floor(Date.now() / 1000));

      console.log('Current Beat Match:', {
        id: currentChallenge.challengeId.toString(),
        active: currentChallenge.active,
        endTime: new Date(Number(currentChallenge.endTime) * 1000).toISOString(),
        now: new Date(Number(now) * 1000).toISOString(),
      });

      // Check if challenge needs finalization
      if (currentChallenge.active && currentChallenge.endTime < now) {
        console.log('⏰ Beat Match challenge expired, finalizing...');
        await finalizeBeatMatch(currentChallenge.challengeId);
        results.beatMatch.finalized = true;
      }

      // Check if we need a new challenge (no active challenge or just finalized)
      if (!currentChallenge.active || currentChallenge.endTime < now) {
        console.log('🆕 Creating new Beat Match challenge...');
        await createNewBeatMatch();
        results.beatMatch.created = true;
      }
    } catch (err: any) {
      console.error('❌ Beat Match error:', err.message);
      results.beatMatch.error = err.message;
    }

    // ==================== COUNTRY COLLECTOR MANAGEMENT ====================
    try {
      console.log('🌍 Checking Country Collector challenge...');

      // Get current challenge
      const currentChallenge = await client.readContract({
        address: COUNTRY_COLLECTOR_V2,
        abi: parseAbi(['function getCurrentChallenge() view returns (tuple(uint256 id, string countryCode, string countryName, uint256[3] artistIds, uint256 startTime, uint256 endTime, uint256 rewardPool, bool active, bool finalized))']),
        functionName: 'getCurrentChallenge',
      }) as any;

      results.countryCollector.checked = true;
      const now = BigInt(Math.floor(Date.now() / 1000));

      console.log('Current Country Collector:', {
        id: currentChallenge.id.toString(),
        country: currentChallenge.countryName,
        active: currentChallenge.active,
        endTime: new Date(Number(currentChallenge.endTime) * 1000).toISOString(),
      });

      // Check if challenge needs finalization
      if (currentChallenge.active && currentChallenge.endTime < now) {
        console.log('⏰ Country Collector challenge expired, finalizing...');
        await finalizeCountryCollector(currentChallenge.id);
        results.countryCollector.finalized = true;
      }

      // Check if we need a new challenge
      if (!currentChallenge.active || currentChallenge.endTime < now) {
        console.log('🆕 Creating new Country Collector challenge...');
        await createNewCountryChallenge();
        results.countryCollector.created = true;
      }
    } catch (err: any) {
      console.error('❌ Country Collector error:', err.message);
      results.countryCollector.error = err.message;
    }

    console.log('✅ [CRON] Game management complete:', results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });

  } catch (error: any) {
    console.error('❌ [CRON] Fatal error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// ==================== BEAT MATCH FUNCTIONS ====================

async function finalizeBeatMatch(challengeId: bigint) {
  const data = encodeFunctionData({
    abi: parseAbi(['function finalizeChallenge(uint256 challengeId) external']),
    functionName: 'finalizeChallenge',
    args: [challengeId],
  }) as Hex;

  const txHash = await sendSafeTransaction([{
    to: MUSIC_BEAT_MATCH_V2,
    value: 0n,
    data,
  }]);

  console.log('✅ Beat Match finalized:', txHash);
  return txHash;
}

async function createNewBeatMatch() {
  // 1. Query Envio for random music NFT
  const query = `
    query {
      MusicNFT(
        where: {isBurned: {_eq: false}, isArt: {_eq: false}},
        limit: 20,
        order_by: {mintedAt: desc}
      ) {
        tokenId
        name
        artist
        imageUrl
      }
    }
  `;

  const response = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch music NFTs from Envio');
  }

  const result = await response.json();
  const musicNFTs = result.data?.MusicNFT || [];

  if (musicNFTs.length === 0) {
    throw new Error('No music NFTs found in Envio');
  }

  // Pick random NFT
  const randomNFT = musicNFTs[Math.floor(Math.random() * musicNFTs.length)];
  console.log('🎵 Selected NFT:', randomNFT);

  // 2. Fetch artist's Farcaster username
  let artistUsername = '';
  try {
    const neynarResponse = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${randomNFT.artist}`,
      {
        headers: {
          'Accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );

    if (neynarResponse.ok) {
      const userData = await neynarResponse.json();
      const userArray = userData[randomNFT.artist.toLowerCase()];
      if (userArray && userArray.length > 0) {
        artistUsername = userArray[0].username;
      }
    }
  } catch (err) {
    console.log('⚠️ Could not fetch Farcaster username, using address');
  }

  if (!artistUsername) {
    artistUsername = `${randomNFT.artist.slice(0, 6)}...${randomNFT.artist.slice(-4)}`;
  }

  console.log('🎯 Artist username:', artistUsername);

  // 3. Create challenge
  const data = encodeFunctionData({
    abi: parseAbi(['function createDailyChallenge(uint256 artistId, string songTitle, string artistUsername, string ipfsAudioHash) external returns (uint256)']),
    functionName: 'createDailyChallenge',
    args: [
      BigInt(randomNFT.tokenId),
      randomNFT.name || 'Mystery Track',
      artistUsername,
      randomNFT.imageUrl || 'QmPlaceholder', // Use image URL as placeholder
    ],
  }) as Hex;

  const txHash = await sendSafeTransaction([{
    to: MUSIC_BEAT_MATCH_V2,
    value: 0n,
    data,
  }]);

  console.log('✅ New Beat Match challenge created:', txHash);
  return txHash;
}

// ==================== COUNTRY COLLECTOR FUNCTIONS ====================

async function finalizeCountryCollector(weekId: bigint) {
  const data = encodeFunctionData({
    abi: parseAbi(['function finalizeChallenge(uint256 weekId) external']),
    functionName: 'finalizeChallenge',
    args: [weekId],
  }) as Hex;

  const txHash = await sendSafeTransaction([{
    to: COUNTRY_COLLECTOR_V2,
    value: 0n,
    data,
  }]);

  console.log('✅ Country Collector finalized:', txHash);
  return txHash;
}

async function createNewCountryChallenge() {
  // 1. Query Envio for countries with music artists
  const query = `
    query {
      PassportNFT {
        countryCode
        countryName
        owner
      }
      MusicNFT(where: {isBurned: {_eq: false}, isArt: {_eq: false}}) {
        tokenId
        artist
      }
    }
  `;

  const response = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch data from Envio');
  }

  const result = await response.json();
  const passports = result.data?.PassportNFT || [];
  const musicNFTs = result.data?.MusicNFT || [];

  // 2. Group passports by country and find artists
  const countryArtists: Record<string, { name: string; code: string; artists: string[] }> = {};

  for (const passport of passports) {
    if (!countryArtists[passport.countryCode]) {
      countryArtists[passport.countryCode] = {
        name: passport.countryName,
        code: passport.countryCode,
        artists: [],
      };
    }

    // Check if this passport owner has minted music
    const hasMusic = musicNFTs.some((nft: any) =>
      nft.artist.toLowerCase() === passport.owner.toLowerCase()
    );

    if (hasMusic && !countryArtists[passport.countryCode].artists.includes(passport.owner)) {
      countryArtists[passport.countryCode].artists.push(passport.owner);
    }
  }

  // 3. Find countries with at least 3 artists
  const eligibleCountries = Object.values(countryArtists).filter(c => c.artists.length >= 3);

  if (eligibleCountries.length === 0) {
    throw new Error('No countries with 3+ music artists found');
  }

  // 4. Pick random country
  const selectedCountry = eligibleCountries[Math.floor(Math.random() * eligibleCountries.length)];
  console.log('🌍 Selected country:', selectedCountry.name, `(${selectedCountry.artists.length} artists)`);

  // 5. Pick 3 random artist token IDs from this country
  const shuffledArtists = selectedCountry.artists.sort(() => Math.random() - 0.5).slice(0, 3);
  const artistTokenIds = shuffledArtists.map(artist => {
    const nft = musicNFTs.find((n: any) => n.artist.toLowerCase() === artist.toLowerCase());
    return BigInt(nft?.tokenId || 1);
  });

  console.log('🎵 Selected artist token IDs:', artistTokenIds.map(id => id.toString()));

  // 6. Create challenge
  const data = encodeFunctionData({
    abi: parseAbi(['function createWeeklyChallenge(string country, string countryCode, uint256[3] artistIds) external returns (uint256)']),
    functionName: 'createWeeklyChallenge',
    args: [
      selectedCountry.name,
      selectedCountry.code,
      [artistTokenIds[0], artistTokenIds[1], artistTokenIds[2]],
    ],
  }) as Hex;

  const txHash = await sendSafeTransaction([{
    to: COUNTRY_COLLECTOR_V2,
    value: 0n,
    data,
  }]);

  console.log('✅ New Country Collector challenge created:', txHash);
  return txHash;
}
