/**
 * Game Randomness Resolver
 *
 * Listens for randomness requests from MusicBeatMatchV3 and CountryCollectorV3
 * Queries Envio for eligible NFTs/artists, resolves Switchboard randomness,
 * and creates challenges with provably fair random selection.
 */

import { ethers } from 'ethers';
import { CrossbarClient } from '@switchboard-xyz/common';
import fetch from 'node-fetch';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const RESOLVER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY;

const BEAT_MATCH_V3_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V3 || '';
const COUNTRY_COLLECTOR_V3_ADDRESS = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V3 || '';

const CHAIN_ID = 10143;
const CROSSBAR_URL = 'https://crossbar.switchboard.xyz';

// ============================================================================
// CONTRACT ABIs (minimal)
// ============================================================================

const BEAT_MATCH_V3_ABI = [
  'event RandomSongRequested(uint256 indexed challengeId, bytes32 indexed randomnessId, uint256 requestedAt, address indexed caller)',
  'function createChallengeWithRandomSong(uint256 challengeId, bytes calldata encodedRandomness, uint256 musicNFTTokenId, uint256 artistId, string memory songTitle, string memory artistUsername, string memory ipfsAudioHash) external',
  'function getRandomnessRequest(uint256 challengeId) external view returns (tuple(uint256 challengeId, bytes32 randomnessId, uint256 requestedAt, bool fulfilled))',
];

const COUNTRY_COLLECTOR_V3_ABI = [
  'event RandomArtistsRequested(uint256 indexed weekId, bytes32 indexed randomnessId, string countryCode, string countryName, uint256 requestedAt, address indexed caller)',
  'function createChallengeWithRandomArtists(uint256 weekId, bytes calldata encodedRandomness, uint256[3] memory artistIds) external',
  'function getRandomnessRequest(uint256 weekId) external view returns (tuple(uint256 weekId, bytes32 randomnessId, string countryCode, string countryName, uint256 requestedAt, bool fulfilled))',
];

// ============================================================================
// TYPES
// ============================================================================

interface MusicNFT {
  tokenId: string;
  artist: string;
  name: string;
  previewAudioUrl: string;
  fullAudioUrl: string;
  imageUrl: string;
}

interface ArtistByCountry {
  artistId: string;
  artistName: string;
  countryCode: string;
}

// ============================================================================
// ENVIO QUERIES
// ============================================================================

async function fetchEligibleMusicNFTs(): Promise<MusicNFT[]> {
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
  return data.MusicNFT || [];
}

async function fetchArtistsByCountry(countryCode: string): Promise<any[]> {
  // Query PassportNFT entities to find artists from specific country
  // In production, you'd have a separate Artists table indexed by country
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

  // For now, use tokenId as artistId (in production, you'd have proper artist IDs)
  return (data.PassportNFT || []).map((p: any) => ({
    artistId: p.tokenId,
    countryCode: p.countryCode,
  }));
}

// ============================================================================
// SWITCHBOARD RANDOMNESS RESOLUTION
// ============================================================================

async function resolveRandomness(randomnessId: string, requestedAt: number): Promise<string> {
  const crossbar = new CrossbarClient(CROSSBAR_URL);

  console.log(`🎲 Resolving randomness for ID: ${randomnessId}`);
  console.log(`   Requested at: ${new Date(requestedAt * 1000).toISOString()}`);

  // Wait for settlement delay (5+ seconds)
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - requestedAt;
  if (elapsed < 6) {
    const waitTime = 6 - elapsed;
    console.log(`⏳ Waiting ${waitTime}s for Switchboard settlement...`);
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
  }

  // Fetch randomness from Crossbar
  const { encoded: encodedRandomness } = await crossbar.resolveEVMRandomness({
    chainId: CHAIN_ID,
    randomnessId,
    timestamp: requestedAt,
    minStalenessSeconds: 5,
    oracle: '0x0000000000000000000000000000000000000000', // Auto-select oracle
  });

  console.log(`✅ Randomness resolved successfully`);
  return encodedRandomness;
}

// ============================================================================
// BEAT MATCH RESOLVER
// ============================================================================

async function handleBeatMatchRandomness(
  contract: ethers.Contract,
  challengeId: bigint,
  randomnessId: string,
  requestedAt: number
) {
  try {
    console.log(`\n🎵 [BEAT MATCH] Handling randomness request for challenge ${challengeId}`);

    // Fetch eligible music NFTs from Envio
    console.log(`📀 Fetching eligible music NFTs from Envio...`);
    const musicNFTs = await fetchEligibleMusicNFTs();
    console.log(`   Found ${musicNFTs.length} eligible music NFTs`);

    if (musicNFTs.length === 0) {
      console.error(`❌ No eligible music NFTs found!`);
      return;
    }

    // Resolve randomness
    const encodedRandomness = await resolveRandomness(randomnessId, requestedAt);

    // Decode random value to select NFT
    const randomValue = BigInt(randomnessId); // Use randomnessId as seed
    const selectedIndex = Number(randomValue % BigInt(musicNFTs.length));
    const selectedNFT = musicNFTs[selectedIndex];

    console.log(`🎯 Selected music NFT #${selectedIndex}: "${selectedNFT.name}"`);
    console.log(`   Token ID: ${selectedNFT.tokenId}`);
    console.log(`   Artist: ${selectedNFT.artist}`);
    console.log(`   Audio URL: ${selectedNFT.previewAudioUrl}`);

    // Extract metadata
    const musicNFTTokenId = BigInt(selectedNFT.tokenId);
    const artistId = BigInt(selectedNFT.tokenId); // Use token ID as artist ID for now
    const songTitle = selectedNFT.name || `Song #${selectedNFT.tokenId}`;
    const artistUsername = ''; // Would need to look up from artist registry
    const ipfsAudioHash = selectedNFT.previewAudioUrl || '';

    // Call contract to create challenge
    console.log(`📤 Creating challenge on-chain...`);
    const tx = await contract.createChallengeWithRandomSong(
      challengeId,
      encodedRandomness,
      musicNFTTokenId,
      artistId,
      songTitle,
      artistUsername,
      ipfsAudioHash,
      {
        gasLimit: 1000000,
      }
    );

    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Challenge created successfully! Block: ${receipt.blockNumber}`);

  } catch (error: any) {
    console.error(`❌ Error handling beat match randomness:`, error.message);
    throw error;
  }
}

// ============================================================================
// COUNTRY COLLECTOR RESOLVER
// ============================================================================

async function handleCountryCollectorRandomness(
  contract: ethers.Contract,
  weekId: bigint,
  randomnessId: string,
  countryCode: string,
  countryName: string,
  requestedAt: number
) {
  try {
    console.log(`\n🌍 [COUNTRY COLLECTOR] Handling randomness request for week ${weekId}`);
    console.log(`   Country: ${countryName} (${countryCode})`);

    // Fetch artists from country
    console.log(`🎤 Fetching artists from ${countryName}...`);
    const artists = await fetchArtistsByCountry(countryCode);
    console.log(`   Found ${artists.length} artists from ${countryName}`);

    if (artists.length < 3) {
      console.error(`❌ Not enough artists found for ${countryName} (need 3, found ${artists.length})`);
      return;
    }

    // Resolve randomness
    const encodedRandomness = await resolveRandomness(randomnessId, requestedAt);

    // Use random value to select 3 unique artists
    const randomValue = BigInt(randomnessId);
    const selectedIndices = new Set<number>();

    let seed = randomValue;
    while (selectedIndices.size < 3) {
      const index = Number(seed % BigInt(artists.length));
      selectedIndices.add(index);
      seed = BigInt(ethers.keccak256(ethers.toBeHex(seed, 32)));
    }

    const selectedArtistIds: [bigint, bigint, bigint] = [
      BigInt(artists[Array.from(selectedIndices)[0]].artistId),
      BigInt(artists[Array.from(selectedIndices)[1]].artistId),
      BigInt(artists[Array.from(selectedIndices)[2]].artistId),
    ];

    console.log(`🎯 Selected 3 random artists:`);
    selectedArtistIds.forEach((id, i) => {
      console.log(`   ${i + 1}. Artist ID: ${id}`);
    });

    // Call contract to create challenge
    console.log(`📤 Creating challenge on-chain...`);
    const tx = await contract.createChallengeWithRandomArtists(
      weekId,
      encodedRandomness,
      selectedArtistIds,
      {
        gasLimit: 1000000,
      }
    );

    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Challenge created successfully! Block: ${receipt.blockNumber}`);

  } catch (error: any) {
    console.error(`❌ Error handling country collector randomness:`, error.message);
    throw error;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`🎮 Game Randomness Resolver Started`);
  console.log(`   Chain: Monad Testnet (${CHAIN_ID})`);
  console.log(`   Envio: ${ENVIO_ENDPOINT}`);
  console.log(`   Crossbar: ${CROSSBAR_URL}\n`);

  if (!RESOLVER_PRIVATE_KEY) {
    throw new Error('RESOLVER_PRIVATE_KEY not set');
  }

  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider(MONAD_RPC);
  const wallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY, provider);

  console.log(`🔑 Resolver address: ${wallet.address}\n`);

  // Setup contracts
  const beatMatchContract = new ethers.Contract(BEAT_MATCH_V3_ADDRESS, BEAT_MATCH_V3_ABI, wallet);
  const countryCollectorContract = new ethers.Contract(COUNTRY_COLLECTOR_V3_ADDRESS, COUNTRY_COLLECTOR_V3_ABI, wallet);

  // Listen for Beat Match randomness requests
  console.log(`👂 Listening for MusicBeatMatchV3 events...`);
  beatMatchContract.on('RandomSongRequested', async (challengeId, randomnessId, requestedAt, caller) => {
    console.log(`\n🔔 RandomSongRequested event received!`);
    console.log(`   Challenge ID: ${challengeId}`);
    console.log(`   Randomness ID: ${randomnessId}`);
    console.log(`   Caller: ${caller}`);

    try {
      await handleBeatMatchRandomness(
        beatMatchContract,
        challengeId,
        randomnessId,
        Number(requestedAt)
      );
    } catch (error: any) {
      console.error(`❌ Failed to handle beat match randomness:`, error.message);
    }
  });

  // Listen for Country Collector randomness requests
  console.log(`👂 Listening for CountryCollectorV3 events...\n`);
  countryCollectorContract.on('RandomArtistsRequested', async (weekId, randomnessId, countryCode, countryName, requestedAt, caller) => {
    console.log(`\n🔔 RandomArtistsRequested event received!`);
    console.log(`   Week ID: ${weekId}`);
    console.log(`   Randomness ID: ${randomnessId}`);
    console.log(`   Country: ${countryName} (${countryCode})`);
    console.log(`   Caller: ${caller}`);

    try {
      await handleCountryCollectorRandomness(
        countryCollectorContract,
        weekId,
        randomnessId,
        countryCode,
        countryName,
        Number(requestedAt)
      );
    } catch (error: any) {
      console.error(`❌ Failed to handle country collector randomness:`, error.message);
    }
  });

  console.log(`✅ Resolver is running and listening for events...\n`);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log(`\n👋 Shutting down resolver...`);
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  console.error(`❌ Fatal error:`, error);
  process.exit(1);
});
