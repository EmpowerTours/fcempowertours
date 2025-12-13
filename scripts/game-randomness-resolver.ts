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
const SWITCHBOARD_ADDRESS = '0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33'; // Monad testnet

// ============================================================================
// CONTRACT ABIs (minimal)
// ============================================================================

const SWITCHBOARD_ABI = [
  'function getRandomness(bytes32 randomnessId) external view returns (tuple(bytes32 randId, uint256 createdAt, address authority, uint256 rollTimestamp, uint64 minSettlementDelay, address oracle, uint256 value, uint256 settledAt))',
  'function settleRandomness(bytes calldata encodedRandomness) external payable',
  'function updateFee() external view returns (uint256)',
];

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
  // Step 1: Get all artists (wallet addresses) from this country who have passports
  const passportQuery = `
    query {
      PassportNFT(
        where: {
          countryCode: { _eq: "${countryCode.toUpperCase()}" }
        }
      ) {
        owner
        countryCode
      }
    }
  `;

  const passportResponse = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: passportQuery }),
  });

  const passportData = await passportResponse.json() as any;
  const artistAddresses = (passportData.data?.PassportNFT || []).map((p: any) => p.owner);

  if (artistAddresses.length === 0) {
    return [];
  }

  // Step 2: Get all MusicNFTs from those artists
  const musicQuery = `
    query {
      MusicNFT(
        where: {
          artist: { _in: ${JSON.stringify(artistAddresses)} },
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
      }
    }
  `;

  const musicResponse = await fetch(ENVIO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: musicQuery }),
  });

  const musicData = await musicResponse.json() as any;

  // Return music NFT tokenIds as artistIds
  return (musicData.data?.MusicNFT || []).map((m: any) => ({
    artistId: m.tokenId,
    countryCode: countryCode,
  }));
}

// ============================================================================
// SWITCHBOARD RANDOMNESS RESOLUTION
// ============================================================================

async function resolveRandomness(randomnessId: string, requestedAt: number, switchboardContract: ethers.Contract): Promise<string> {
  const crossbar = new CrossbarClient(CROSSBAR_URL);

  console.log(`🎲 Resolving randomness for ID: ${randomnessId}`);
  console.log(`   Requested at: ${new Date(requestedAt * 1000).toISOString()}`);

  // Get randomness metadata from Switchboard contract
  console.log(`📡 Querying Switchboard contract for randomness metadata...`);
  const randomnessData = await switchboardContract.getRandomness(randomnessId);

  console.log(`✅ Randomness metadata:`, {
    rollTimestamp: randomnessData.rollTimestamp.toString(),
    minSettlementDelay: randomnessData.minSettlementDelay.toString(),
    oracle: randomnessData.oracle,
    settledAt: randomnessData.settledAt.toString()
  });

  // Wait for minimum settlement delay
  const earliestSettlementTime = Number(randomnessData.rollTimestamp) + Number(randomnessData.minSettlementDelay);
  const now = Math.floor(Date.now() / 1000);
  const waitTime = Math.max(0, earliestSettlementTime - now + 2); // Add 2s buffer

  if (waitTime > 0) {
    console.log(`⏳ Waiting ${waitTime}s for settlement delay...`);
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
  }

  // Fetch randomness proof from Crossbar with exponential backoff retry
  console.log(`📡 Fetching randomness proof from Crossbar...`);

  let encodedRandomness: string | null = null;
  const maxRetries = 5;
  let retryCount = 0;
  let retryDelay = 5000; // Start with 5 seconds

  while (retryCount < maxRetries && !encodedRandomness) {
    try {
      const result = await crossbar.resolveEVMRandomness({
        chainId: CHAIN_ID,
        randomnessId,
        timestamp: Number(randomnessData.rollTimestamp),
        minStalenessSeconds: Number(randomnessData.minSettlementDelay),
        oracle: randomnessData.oracle,
      });
      encodedRandomness = result.encoded;
      console.log(`✅ Randomness proof fetched from Crossbar`);
      break;
    } catch (error: any) {
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error(`❌ Failed to fetch randomness from Crossbar after ${maxRetries} attempts`);
        throw error;
      }

      console.log(`⚠️  Crossbar fetch failed (attempt ${retryCount}/${maxRetries}): ${error.message}`);
      console.log(`   Oracle may still be processing... Retrying in ${retryDelay / 1000}s...`);

      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay *= 2; // Exponential backoff: 5s, 10s, 20s, 40s, 80s
    }
  }

  if (!encodedRandomness) {
    throw new Error('Failed to fetch randomness proof from Crossbar');
  }

  // Settle randomness on-chain (WE need to do this!)
  console.log(`📤 Settling randomness on Switchboard contract...`);
  const fee = await switchboardContract.updateFee();
  console.log(`   Settlement fee: ${ethers.formatEther(fee)} MON`);

  const settleTx = await switchboardContract.settleRandomness(encodedRandomness, {
    value: fee,
    gasLimit: 500000,
  });

  console.log(`⏳ Settlement transaction submitted: ${settleTx.hash}`);
  const settleReceipt = await settleTx.wait();
  console.log(`✅ Randomness settled on-chain! Block: ${settleReceipt.blockNumber}`);

  return encodedRandomness;
}

// ============================================================================
// BEAT MATCH RESOLVER
// ============================================================================

async function handleBeatMatchRandomness(
  contract: ethers.Contract,
  switchboardContract: ethers.Contract,
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
    const encodedRandomness = await resolveRandomness(randomnessId, requestedAt, switchboardContract);

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
  switchboardContract: ethers.Contract,
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

    if (artists.length === 0) {
      console.error(`❌ No artists found for ${countryName}`);
      return;
    }

    // Resolve randomness
    const encodedRandomness = await resolveRandomness(randomnessId, requestedAt, switchboardContract);

    // Use random value to select 3 artists (allow duplicates if < 3 unique artists)
    const randomValue = BigInt(randomnessId);
    const selectedIndices: number[] = [];

    let seed = randomValue;

    if (artists.length < 3) {
      console.log(`⚠️  Only ${artists.length} artist(s) found - will use duplicates to fill 3 slots`);
      // Fill with duplicates
      while (selectedIndices.length < 3) {
        const index = Number(seed % BigInt(artists.length));
        selectedIndices.push(index);
        seed = BigInt(ethers.keccak256(ethers.toBeHex(seed, 32)));
      }
    } else {
      // Select 3 unique artists
      const uniqueIndices = new Set<number>();
      while (uniqueIndices.size < 3) {
        const index = Number(seed % BigInt(artists.length));
        uniqueIndices.add(index);
        seed = BigInt(ethers.keccak256(ethers.toBeHex(seed, 32)));
      }
      selectedIndices.push(...Array.from(uniqueIndices));
    }

    const selectedArtistIds: [bigint, bigint, bigint] = [
      BigInt(artists[selectedIndices[0]].artistId),
      BigInt(artists[selectedIndices[1]].artistId),
      BigInt(artists[selectedIndices[2]].artistId),
    ];

    console.log(`🎯 Selected 3 artists for challenge:`);
    selectedArtistIds.forEach((id, i) => {
      const isDuplicate = selectedArtistIds.slice(0, i).includes(id);
      console.log(`   ${i + 1}. Artist ID: ${id}${isDuplicate ? ' (duplicate)' : ''}`);
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
  const switchboardContract = new ethers.Contract(SWITCHBOARD_ADDRESS, SWITCHBOARD_ABI, wallet);
  const beatMatchContract = new ethers.Contract(BEAT_MATCH_V3_ADDRESS, BEAT_MATCH_V3_ABI, wallet);
  const countryCollectorContract = new ethers.Contract(COUNTRY_COLLECTOR_V3_ADDRESS, COUNTRY_COLLECTOR_V3_ABI, wallet);

  console.log(`🔗 Switchboard contract: ${SWITCHBOARD_ADDRESS}\n`);

  // Check for pending randomness requests on startup
  console.log('🔍 Checking for pending randomness requests...\n');

  const currentBlock = await provider.getBlockNumber();
  const lookbackBlocks = 1000; // Check last ~1000 blocks (~1 hour on Monad)

  // Check Beat Match for pending requests
  try {
    const beatMatchEvents = await beatMatchContract.queryFilter(
      beatMatchContract.filters.RandomSongRequested(),
      Math.max(0, currentBlock - lookbackBlocks),
      currentBlock
    );

    for (const event of beatMatchEvents) {
      const challengeId = event.args![0];
      const randomnessId = event.args![1];
      const requestedAt = Number(event.args![2]);

      // Check if already fulfilled
      const request = await beatMatchContract.getRandomnessRequest(challengeId);
      if (!request.fulfilled) {
        console.log(`\n⚡ Found pending Beat Match challenge ${challengeId}, resolving...`);
        try {
          await handleBeatMatchRandomness(
            beatMatchContract,
            switchboardContract,
            challengeId,
            randomnessId,
            requestedAt
          );
        } catch (error: any) {
          console.error(`   Failed to resolve challenge ${challengeId}:`, error.message);
        }
      }
    }
  } catch (error: any) {
    console.log('No pending Beat Match requests found');
  }

  // Check Country Collector for pending requests
  try {
    const collectorEvents = await countryCollectorContract.queryFilter(
      countryCollectorContract.filters.RandomArtistsRequested(),
      Math.max(0, currentBlock - lookbackBlocks),
      currentBlock
    );

    for (const event of collectorEvents) {
      const weekId = event.args![0];
      const randomnessId = event.args![1];
      const countryCode = event.args![2];
      const countryName = event.args![3];
      const requestedAt = Number(event.args![4]);

      // Check if already fulfilled
      const request = await countryCollectorContract.getRandomnessRequest(weekId);
      if (!request.fulfilled) {
        console.log(`\n⚡ Found pending Country Collector week ${weekId} for ${countryName}, resolving...`);
        try {
          await handleCountryCollectorRandomness(
            countryCollectorContract,
            switchboardContract,
            weekId,
            randomnessId,
            countryCode,
            countryName,
            requestedAt
          );
        } catch (error: any) {
          console.error(`   Failed to resolve week ${weekId}:`, error.message);
        }
      }
    }
  } catch (error: any) {
    console.log('No pending Country Collector requests found');
  }

  // Poll for events (Monad doesn't support eth_newFilter)
  console.log('\n👂 Polling for new randomness requests...');
  console.log('✅ Resolver is running (polling every 10 seconds)...\n');

  let lastBeatMatchBlock = currentBlock;
  let lastCountryCollectorBlock = currentBlock;

  // Polling interval: 10 seconds
  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();

      // Poll Beat Match events
      if (currentBlock > lastBeatMatchBlock) {
        const beatMatchEvents = await beatMatchContract.queryFilter(
          beatMatchContract.filters.RandomSongRequested(),
          lastBeatMatchBlock + 1,
          currentBlock
        );

        for (const event of beatMatchEvents) {
          const challengeId = event.args![0];
          const randomnessId = event.args![1];
          const requestedAt = Number(event.args![2]);

          // Check if already fulfilled before processing
          const request = await beatMatchContract.getRandomnessRequest(challengeId);
          if (request.fulfilled) {
            console.log(`   Skipping challenge ${challengeId} - already fulfilled`);
            continue;
          }

          console.log(`\n🔔 RandomSongRequested event received!`);
          console.log(`   Challenge ID: ${challengeId}`);
          console.log(`   Randomness ID: ${randomnessId}`);
          console.log(`   Caller: ${event.args![3]}`);

          try {
            await handleBeatMatchRandomness(
              beatMatchContract,
              switchboardContract,
              challengeId,
              randomnessId,
              requestedAt
            );
          } catch (error: any) {
            console.error(`❌ Failed to handle beat match randomness:`, error.message);
          }
        }

        lastBeatMatchBlock = currentBlock;
      }

      // Poll Country Collector events
      if (currentBlock > lastCountryCollectorBlock) {
        const countryCollectorEvents = await countryCollectorContract.queryFilter(
          countryCollectorContract.filters.RandomArtistsRequested(),
          lastCountryCollectorBlock + 1,
          currentBlock
        );

        for (const event of countryCollectorEvents) {
          const weekId = event.args![0];
          const randomnessId = event.args![1];
          const countryCode = event.args![2];
          const countryName = event.args![3];
          const requestedAt = Number(event.args![4]);

          // Check if already fulfilled before processing
          const request = await countryCollectorContract.getRandomnessRequest(weekId);
          if (request.fulfilled) {
            console.log(`   Skipping week ${weekId} - already fulfilled`);
            continue;
          }

          console.log(`\n🔔 RandomArtistsRequested event received!`);
          console.log(`   Week ID: ${weekId}`);
          console.log(`   Randomness ID: ${randomnessId}`);
          console.log(`   Country: ${countryName} (${countryCode})`);
          console.log(`   Caller: ${event.args![5]}`);

          try {
            await handleCountryCollectorRandomness(
              countryCollectorContract,
              switchboardContract,
              weekId,
              randomnessId,
              countryCode,
              countryName,
              requestedAt
            );
          } catch (error: any) {
            console.error(`❌ Failed to handle country collector randomness:`, error.message);
          }
        }

        lastCountryCollectorBlock = currentBlock;
      }
    } catch (error: any) {
      console.error(`❌ Polling error:`, error.message);
    }
  }, 10000); // Poll every 10 seconds

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
