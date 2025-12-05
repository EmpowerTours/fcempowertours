import { createPublicClient, createWalletClient, http, defineChain, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { fetchRandomMusicForChallenge, fetchArtistsForCountry } from './musicDataService';
import logger from '../utils/logger';

// Import ABIs from parent project
import MusicBeatMatchABI from '../../src/abis/MusicBeatMatch.json';
import CountryCollectorABI from '../../src/abis/CountryCollector.json';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: [process.env.RPC_URL!] },
    public: { http: [process.env.RPC_URL!] },
  },
  testnet: true,
});

const account = privateKeyToAccount(process.env.PLATFORM_SAFE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

/**
 * Create a new daily Music Beat Match challenge
 */
export async function createBeatMatchChallenge() {
  logger.info('🎵 Creating new Music Beat Match challenge...');

  try {
    // 1. Fetch random music from platform
    const music = await fetchRandomMusicForChallenge();

    // 2. For MVP, use placeholder IPFS hash
    // TODO: Implement audio processing + IPFS upload
    const ipfsHash = `placeholder-${Date.now()}`;

    logger.warn('Using placeholder IPFS hash - audio processing not implemented yet');

    // 3. Create challenge on blockchain
    const artistId = BigInt(music.tokenId);
    const songTitle = music.name;

    logger.info(`Creating challenge: "${songTitle}" (Artist ID: ${artistId})`);

    const { request } = await publicClient.simulateContract({
      account: account.address,
      address: process.env.MUSIC_BEAT_MATCH as Address,
      abi: MusicBeatMatchABI,
      functionName: 'createDailyChallenge',
      args: [artistId, songTitle, ipfsHash],
    });

    const hash = await walletClient.writeContract(request);
    logger.info(`Transaction submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      logger.info('✅ Beat Match challenge created successfully!');
      logger.info(`View on MonadScan: https://testnet.monadscan.com/tx/${hash}`);

      return {
        success: true,
        txHash: hash,
        artistId: music.tokenId,
        songTitle: music.name
      };
    } else {
      throw new Error('Transaction failed');
    }
  } catch (error: any) {
    logger.error('❌ Failed to create Beat Match challenge', { error: error.message });
    throw error;
  }
}

/**
 * Create a new weekly Country Collector challenge
 */
export async function createCollectorChallenge() {
  logger.info('🌍 Creating new Country Collector challenge...');

  try {
    // List of countries to rotate through
    const countries = [
      { name: 'Japan', code: 'JP' },
      { name: 'Brazil', code: 'BR' },
      { name: 'United States', code: 'US' },
      { name: 'France', code: 'FR' },
      { name: 'Nigeria', code: 'NG' },
      { name: 'Mexico', code: 'MX' },
      { name: 'India', code: 'IN' },
    ];

    // Try countries in order until we find one with enough artists
    let selectedCountry = null;
    let artistIds: string[] = [];

    for (const country of countries) {
      try {
        logger.info(`Trying ${country.name}...`);
        artistIds = await fetchArtistsForCountry(country.code);

        if (artistIds.length >= 3) {
          selectedCountry = country;
          break;
        }
      } catch (error) {
        logger.warn(`Could not use ${country.name}, trying next...`);
        continue;
      }
    }

    if (!selectedCountry || artistIds.length < 3) {
      throw new Error('Could not find a country with enough artists');
    }

    logger.info(`Selected country: ${selectedCountry.name} (${selectedCountry.code})`);

    // Create challenge on blockchain
    const { request } = await publicClient.simulateContract({
      account: account.address,
      address: process.env.COUNTRY_COLLECTOR as Address,
      abi: CountryCollectorABI,
      functionName: 'createWeeklyChallenge',
      args: [
        selectedCountry.name,
        selectedCountry.code,
        artistIds.slice(0, 3).map(id => BigInt(id))
      ],
    });

    const hash = await walletClient.writeContract(request);
    logger.info(`Transaction submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      logger.info('✅ Country Collector challenge created successfully!');
      logger.info(`View on MonadScan: https://testnet.monadscan.com/tx/${hash}`);

      return {
        success: true,
        txHash: hash,
        country: selectedCountry.name,
        artistIds
      };
    } else {
      throw new Error('Transaction failed');
    }
  } catch (error: any) {
    logger.error('❌ Failed to create Collector challenge', { error: error.message });
    throw error;
  }
}

/**
 * Finalize expired challenges
 */
export async function finalizeExpiredChallenges() {
  logger.info('Checking for expired challenges...');

  // Check Music Beat Match
  try {
    const challenge = await publicClient.readContract({
      address: process.env.MUSIC_BEAT_MATCH as Address,
      abi: MusicBeatMatchABI,
      functionName: 'getCurrentChallenge',
    }) as any;

    const now = Math.floor(Date.now() / 1000);

    if (challenge.active && Number(challenge.endTime) < now) {
      logger.info(`Finalizing expired Beat Match challenge ${challenge.challengeId}`);

      const { request } = await publicClient.simulateContract({
        account: account.address,
        address: process.env.MUSIC_BEAT_MATCH as Address,
        abi: MusicBeatMatchABI,
        functionName: 'finalizeChallenge',
        args: [challenge.challengeId],
      });

      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });

      logger.info('✅ Beat Match challenge finalized');
    } else {
      logger.info('No expired Beat Match challenges');
    }
  } catch (error: any) {
    logger.error('Error checking Beat Match challenges', { error: error.message });
  }

  // TODO: Similar check for Country Collector
}
