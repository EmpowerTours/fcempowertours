import axios from 'axios';
import logger from '../utils/logger';

const ENVIO_ENDPOINT = process.env.ENVIO_ENDPOINT!;

export interface MusicNFT {
  tokenId: string;
  name: string;
  artist: string;
  imageUrl: string;
  previewAudioUrl: string;
  fullAudioUrl: string;
}

/**
 * Fetch a random music NFT for today's Beat Match challenge
 */
export async function fetchRandomMusicForChallenge(): Promise<MusicNFT> {
  const query = `
    query GetRandomMusic {
      MusicNFT(
        where: {
          isBurned: {_eq: false},
          isArt: {_eq: false},
          previewAudioUrl: {_neq: ""}
        },
        limit: 50,
        order_by: {mintedAt: desc}
      ) {
        tokenId
        name
        artist
        imageUrl
        previewAudioUrl
        fullAudioUrl
      }
    }
  `;

  try {
    logger.info('Fetching music NFTs from Envio indexer...');
    const response = await axios.post(ENVIO_ENDPOINT, { query });
    const musicNFTs = response.data?.data?.MusicNFT || [];

    if (musicNFTs.length === 0) {
      throw new Error('No music NFTs found in indexer');
    }

    // Pick random song
    const randomIndex = Math.floor(Math.random() * musicNFTs.length);
    const selected = musicNFTs[randomIndex];

    logger.info(`Selected music: "${selected.name}" by ${selected.artist} (Token #${selected.tokenId})`);

    return selected;
  } catch (error: any) {
    logger.error('Failed to fetch music from Envio', { error: error.message });
    throw error;
  }
}

/**
 * Fetch artists from a specific country for Country Collector challenge
 */
export async function fetchArtistsForCountry(countryCode: string): Promise<string[]> {
  const query = `
    query GetCountryArtists($countryCode: String!) {
      PassportNFT(where: {countryCode: {_eq: $countryCode}}, limit: 20) {
        owner
      }
    }
  `;

  try {
    logger.info(`Fetching artists from ${countryCode}...`);
    const response = await axios.post(ENVIO_ENDPOINT, {
      query,
      variables: { countryCode }
    });

    const passports = response.data?.data?.PassportNFT || [];
    const artistAddresses = [...new Set(passports.map((p: any) => p.owner))];

    if (artistAddresses.length === 0) {
      logger.warn(`No passports found for ${countryCode}`);
      return [];
    }

    // Get music NFTs from these artists
    const musicQuery = `
      query GetArtistMusic($artists: [String!]!) {
        MusicNFT(
          where: {
            artist: {_in: $artists},
            isBurned: {_eq: false},
            isArt: {_eq: false}
          },
          limit: 10
        ) {
          tokenId
          artist
          name
        }
      }
    `;

    const musicResponse = await axios.post(ENVIO_ENDPOINT, {
      query: musicQuery,
      variables: { artists: artistAddresses }
    });

    const musicNFTs = musicResponse.data?.data?.MusicNFT || [];

    if (musicNFTs.length < 3) {
      throw new Error(`Not enough artists for ${countryCode} (found ${musicNFTs.length}, need 3)`);
    }

    const artistIds = musicNFTs.slice(0, 3).map((m: any) => m.tokenId);
    logger.info(`Found ${artistIds.length} artists for ${countryCode}:`, artistIds);

    return artistIds;
  } catch (error: any) {
    logger.error(`Failed to fetch artists for ${countryCode}`, { error: error.message });
    throw error;
  }
}
