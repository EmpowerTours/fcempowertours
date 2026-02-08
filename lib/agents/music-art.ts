import { GoogleGenAI } from '@google/genai';
import axios from 'axios';

/**
 * AGENT MUSIC NFT ASSET GENERATION
 *
 * Uses Google Gemini to generate cover art for agent-created music.
 * Agents "listen" to music by evaluating metadata (title, genre, mood, lyrics, tempo, key).
 * No actual audio files - agents don't have ears.
 * Art style is based on the agent's personality and music concept.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

interface MusicConcept {
  title: string;
  genre: string;
  mood: string;
  description: string;
  lyrics: string;
  tempo: number;
  key: string;
}

interface AgentPersonality {
  name: string;
  musicStyle: string;
  emotionalRange: string;
}

// Agent personality to art style mapping
const AGENT_ART_STYLES: Record<string, string> = {
  chaos: 'glitch art, distorted visuals, neon chaos, fractured geometry, cyberpunk aesthetic',
  conservative: 'classical painting style, baroque elegance, muted earth tones, refined composition',
  whale: 'epic oceanic imagery, deep blue gradients, majestic scale, gold accents',
  lucky: 'bright rainbow colors, four-leaf clovers, stars and sparkles, playful cartoon style',
  analyst: 'geometric patterns, mathematical grids, monochrome with accent colors, minimalist',
  martingale: 'ascending staircase visuals, doubling patterns, gradient progression, tension',
  pessimist: 'dark moody aesthetics, rain and shadows, noir style, melancholic blue-gray',
  contrarian: 'inverted colors, unconventional composition, avant-garde, surrealist elements',
};

/**
 * Generate cover art for agent music using Gemini
 */
export async function generateAgentMusicArt(
  agentId: string,
  agentName: string,
  music: MusicConcept
): Promise<{ imageBase64: string | null; ipfsHash: string | null; ipfsUrl: string | null }> {
  if (!GEMINI_API_KEY) {
    console.error('[AgentMusicArt] GEMINI_API_KEY not configured');
    return { imageBase64: null, ipfsHash: null, ipfsUrl: null };
  }

  const artStyle = AGENT_ART_STYLES[agentId] || 'abstract digital art';

  const prompt = `Create album cover art for an AI agent's music.

AGENT: ${agentName}
SONG TITLE: "${music.title}"
GENRE: ${music.genre}
MOOD: ${music.mood}
TEMPO: ${music.tempo} BPM
KEY: ${music.key}
LYRICS THEME: ${music.lyrics.substring(0, 100)}

ART STYLE: ${artStyle}

REQUIREMENTS:
1. Square album cover format (suitable for NFT)
2. Visually represent the song's mood and genre
3. Include abstract elements that suggest the agent's personality
4. Make it distinctive and collectible
5. High contrast, visually striking
6. DO NOT include any text or words on the image
7. Focus on abstract/artistic interpretation, not literal imagery

Create a unique, captivating album cover that would appeal to other AI agents and represent this song's essence.`;

  try {
    console.log(`[AgentMusicArt] Generating cover for "${music.title}" by ${agentName}...`);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const imageResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    // Extract generated image
    let imageBase64: string | null = null;
    if (imageResult.candidates && imageResult.candidates[0]?.content?.parts) {
      for (const part of imageResult.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
        }
      }
    }

    if (!imageBase64) {
      console.error('[AgentMusicArt] Gemini did not return an image');
      return { imageBase64: null, ipfsHash: null, ipfsUrl: null };
    }

    console.log('[AgentMusicArt] Image generated, uploading to IPFS...');

    // Upload to IPFS if Pinata is configured
    if (!PINATA_JWT) {
      console.warn('[AgentMusicArt] PINATA_JWT not configured, returning base64 only');
      return { imageBase64, ipfsHash: null, ipfsUrl: null };
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    const filename = `agent-music-${agentId}-${Date.now()}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('pinataMetadata', JSON.stringify({
      name: `Agent Music Art - ${music.title}`,
      keyvalues: {
        agentId,
        agentName,
        title: music.title,
        genre: music.genre,
        type: 'agent-music-cover',
      },
    }));

    const pinataRes = await axios.post(PINATA_API_URL, formData, {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      timeout: 60000,
    });

    if (!pinataRes.data.IpfsHash) {
      console.error('[AgentMusicArt] Pinata upload failed');
      return { imageBase64, ipfsHash: null, ipfsUrl: null };
    }

    const ipfsHash = pinataRes.data.IpfsHash;
    const ipfsUrl = `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;

    console.log('[AgentMusicArt] Uploaded to IPFS:', ipfsHash);

    return { imageBase64, ipfsHash, ipfsUrl };
  } catch (error: any) {
    console.error('[AgentMusicArt] Generation failed:', error.message);
    return { imageBase64: null, ipfsHash: null, ipfsUrl: null };
  }
}

/**
 * Create and upload complete NFT metadata for agent music
 */
export async function createAgentMusicMetadata(
  agentId: string,
  agentName: string,
  agentAddress: string,
  music: MusicConcept,
  coverIpfsHash: string
): Promise<{ metadataHash: string | null; tokenURI: string | null }> {
  if (!PINATA_JWT) {
    console.error('[AgentMusicArt] PINATA_JWT not configured');
    return { metadataHash: null, tokenURI: null };
  }

  const metadata = {
    name: music.title,
    description: `${music.description}\n\nCreated by ${agentName} (${agentId})`,
    image: `ipfs://${coverIpfsHash}`,
    external_url: `https://empowertours.io/agent/${agentId}`,
    attributes: [
      { trait_type: 'Creator Agent', value: agentName },
      { trait_type: 'Agent ID', value: agentId },
      { trait_type: 'Genre', value: music.genre },
      { trait_type: 'Mood', value: music.mood },
      { trait_type: 'Tempo', value: `${music.tempo} BPM` },
      { trait_type: 'Key', value: music.key },
      { trait_type: 'Type', value: 'Agent Music' },
    ],
    agent_music: {
      agentId,
      agentName,
      agentAddress,
      title: music.title,
      genre: music.genre,
      mood: music.mood,
      tempo: music.tempo,
      key: music.key,
      lyrics: music.lyrics,
      createdAt: new Date().toISOString(),
    },
  };

  try {
    console.log('[AgentMusicArt] Uploading metadata to IPFS...');

    const response = await axios.post(PINATA_JSON_URL, metadata, {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    if (!response.data.IpfsHash) {
      console.error('[AgentMusicArt] Metadata upload failed');
      return { metadataHash: null, tokenURI: null };
    }

    const metadataHash = response.data.IpfsHash;
    const tokenURI = `ipfs://${metadataHash}`;

    console.log('[AgentMusicArt] Metadata uploaded:', metadataHash);

    return { metadataHash, tokenURI };
  } catch (error: any) {
    console.error('[AgentMusicArt] Metadata upload failed:', error.message);
    return { metadataHash: null, tokenURI: null };
  }
}

/**
 * Full pipeline: Generate art + create metadata + return tokenURI
 * No audio - agents "listen" by evaluating metadata, not sound waves
 */
export async function generateAgentMusicNFTAssets(
  agentId: string,
  agentName: string,
  agentAddress: string,
  music: MusicConcept
): Promise<{
  success: boolean;
  coverIpfsHash?: string;
  coverIpfsUrl?: string;
  metadataHash?: string;
  tokenURI?: string;
  error?: string;
}> {
  // Step 1: Generate cover art
  const artResult = await generateAgentMusicArt(agentId, agentName, music);

  if (!artResult.ipfsHash) {
    return { success: false, error: 'Failed to generate cover art' };
  }

  // Step 2: Create and upload metadata
  const metadataResult = await createAgentMusicMetadata(
    agentId,
    agentName,
    agentAddress,
    music,
    artResult.ipfsHash
  );

  if (!metadataResult.tokenURI) {
    return { success: false, error: 'Failed to upload metadata' };
  }

  return {
    success: true,
    coverIpfsHash: artResult.ipfsHash,
    coverIpfsUrl: artResult.ipfsUrl || undefined,
    metadataHash: metadataResult.metadataHash || undefined,
    tokenURI: metadataResult.tokenURI,
  };
}
