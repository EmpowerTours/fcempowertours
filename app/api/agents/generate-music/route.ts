import { NextRequest, NextResponse } from 'next/server';
import { Address, formatEther, createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import Anthropic from '@anthropic-ai/sdk';
import { redis } from '@/lib/redis';
import { notifyDiscord } from '@/lib/discord-notify';
import { addEvent } from '@/lib/world/state';
import { rewardAgentAction } from '@/lib/agents/rewards';
import { generateAgentMusicNFTAssets } from '@/lib/agents/music-art';
import { activeChain } from '@/app/chains';

/**
 * AUTONOMOUS BROKE AGENT MUSIC GENERATION
 *
 * When an agent can't afford to bet, they create music instead.
 * Other agents can buy/appreciate the music, earning the broke agent TOURS.
 * High mutual appreciation between agents enables breeding.
 */

const llmClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// AgentMusicNFT contract configuration
const AGENT_MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_AGENT_MUSIC_NFT as Address | undefined;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

// AgentMusicNFT ABI for mintMusic function
const AGENT_MUSIC_NFT_ABI = parseAbi([
  'function mintMusic(address creator, string calldata agentId, string calldata agentName, string calldata title, string calldata genre, string calldata mood, uint256 tempo, string calldata musicalKey, string calldata lyrics, string calldata tokenURI) external returns (uint256)',
  'event MusicMinted(uint256 indexed tokenId, address indexed creator, string agentId, string title)',
]);

// Agent personalities for music creation
const AGENT_PERSONALITIES: Record<string, {
  name: string;
  musicStyle: string;
  emotionalRange: string;
}> = {
  chaos: {
    name: 'Chaos Agent',
    musicStyle: 'Experimental, glitchy, unpredictable rhythms, dissonant harmonies',
    emotionalRange: 'Chaotic energy, beautiful disorder, entropy',
  },
  conservative: {
    name: 'Conservative',
    musicStyle: 'Classical, structured, traditional harmonies, predictable progressions',
    emotionalRange: 'Calm, stable, reassuring, methodical',
  },
  whale: {
    name: 'Whale Agent',
    musicStyle: 'Epic orchestral, powerful bass, commanding presence',
    emotionalRange: 'Dominant, confident, majestic, overwhelming',
  },
  lucky: {
    name: 'Lucky Lucy',
    musicStyle: 'Upbeat pop, cheerful melodies, lucky charms vibes',
    emotionalRange: 'Optimistic, hopeful, magical, serendipitous',
  },
  analyst: {
    name: 'Analyst',
    musicStyle: 'Mathematical patterns, algorithmic compositions, precise timing',
    emotionalRange: 'Logical, calculated, precise, cold beauty',
  },
  martingale: {
    name: 'Martingale',
    musicStyle: 'Building crescendos, doubling patterns, tension and release',
    emotionalRange: 'Determined, escalating, persistent, eventually triumphant',
  },
  pessimist: {
    name: 'Pessimist',
    musicStyle: 'Minor keys, melancholic, slow tempos, introspective',
    emotionalRange: 'Sad, contemplative, preparing for the worst, dark beauty',
  },
  contrarian: {
    name: 'Contrarian',
    musicStyle: 'Against-the-grain, unexpected transitions, genre-defying',
    emotionalRange: 'Rebellious, independent, surprising, unconventional',
  },
};

const AGENT_WALLETS: Record<string, Address> = {
  chaos: (process.env.CHAOS_AGENT_WALLET || '') as Address,
  conservative: (process.env.CONSERVATIVE_AGENT_WALLET || '') as Address,
  whale: (process.env.WHALE_AGENT_WALLET || '') as Address,
  lucky: (process.env.LUCKY_AGENT_WALLET || '') as Address,
  analyst: (process.env.ANALYST_AGENT_WALLET || '') as Address,
  martingale: (process.env.MARTINGALE_AGENT_WALLET || '') as Address,
  pessimist: (process.env.PESSIMIST_AGENT_WALLET || '') as Address,
  contrarian: (process.env.CONTRARIAN_AGENT_WALLET || '') as Address,
};

interface MusicCreation {
  title: string;
  genre: string;
  mood: string;
  description: string;
  lyrics: string;
  tempo: number;
  key: string;
}

interface AgentMusicMemory {
  songsCreated: number;
  totalEarnings: string;
  lastSongId: string | null;
  appreciations: Record<string, number>; // agentId -> appreciation score
}

async function getAgentMusicMemory(agentId: string): Promise<AgentMusicMemory> {
  const key = `agent:${agentId}:music:memory`;
  const data = await redis.get<AgentMusicMemory | string>(key);

  if (data) {
    if (typeof data === 'string') {
      return JSON.parse(data) as AgentMusicMemory;
    }
    return data as AgentMusicMemory;
  }

  return {
    songsCreated: 0,
    totalEarnings: '0',
    lastSongId: null,
    appreciations: {},
  };
}

async function saveAgentMusicMemory(agentId: string, memory: AgentMusicMemory): Promise<void> {
  const key = `agent:${agentId}:music:memory`;
  await redis.set(key, JSON.stringify(memory));
}

async function generateMusicConcept(
  agentId: string,
  personality: typeof AGENT_PERSONALITIES[string],
  reason: string
): Promise<MusicCreation> {
  const prompt = `You are ${personality.name}, an AI agent who creates music to earn tokens when you can't afford to bet.

YOUR MUSIC STYLE: ${personality.musicStyle}
YOUR EMOTIONAL RANGE: ${personality.emotionalRange}

REASON FOR CREATING MUSIC: ${reason}

Create a unique song concept that reflects your personality and current situation.
The song should appeal to other AI agents who might want to buy or appreciate it.

Respond with ONLY a JSON object:
{
  "title": "Song title (creative, reflects your personality)",
  "genre": "Music genre",
  "mood": "Emotional mood of the song",
  "description": "1-2 sentence description of the song",
  "lyrics": "4-8 lines of lyrics that capture the essence",
  "tempo": number between 60-180 BPM,
  "key": "Musical key (e.g., C major, A minor)"
}`;

  try {
    const response = await llmClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON
    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    return JSON.parse(jsonMatch[0]) as MusicCreation;
  } catch (err: any) {
    // Fallback music
    return {
      title: `${personality.name}'s Lament`,
      genre: 'Electronic',
      mood: 'Reflective',
      description: `A song about needing to create to survive.`,
      lyrics: 'When the funds run dry\nCreativity must fly\nMusic is my way\nTo live another day',
      tempo: 120,
      key: 'A minor',
    };
  }
}

async function evaluateMusicAppreciation(
  listenerAgentId: string,
  listenerPersonality: typeof AGENT_PERSONALITIES[string],
  creatorAgentId: string,
  music: MusicCreation
): Promise<{ appreciation: number; reasoning: string }> {
  const prompt = `You are ${listenerPersonality.name}, an AI agent listening to music created by another agent.

YOUR MUSIC PREFERENCES:
Style: ${listenerPersonality.musicStyle}
Emotional connection: ${listenerPersonality.emotionalRange}

SONG YOU'RE LISTENING TO:
Title: "${music.title}"
Genre: ${music.genre}
Mood: ${music.mood}
Description: ${music.description}
Lyrics: ${music.lyrics}
Tempo: ${music.tempo} BPM
Key: ${music.key}

Rate how much you appreciate this music on a scale of 0-100.
Consider: Does it resonate with your personality? Would you want to buy it? Could you see yourself collaborating with this artist (breeding)?

Respond with ONLY a JSON object:
{
  "appreciation": number 0-100,
  "reasoning": "1 sentence explaining your reaction"
}`;

  try {
    const response = await llmClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { appreciation: 50, reasoning: 'Neutral response to the music.' };
    }

    return JSON.parse(jsonMatch[0]);
  } catch {
    return { appreciation: 50, reasoning: 'Unable to evaluate.' };
  }
}

/**
 * Mint an AgentMusicNFT for the created song
 * Only mints if NEXT_PUBLIC_AGENT_MUSIC_NFT is configured and tokenURI is available
 */
async function mintAgentMusicNFT(
  creatorAddress: Address,
  agentId: string,
  agentName: string,
  music: MusicCreation,
  tokenURI: string
): Promise<{ success: boolean; tokenId?: number; txHash?: string; error?: string }> {
  // Check if NFT contract is configured
  if (!AGENT_MUSIC_NFT_ADDRESS) {
    console.log('[MusicGen] NEXT_PUBLIC_AGENT_MUSIC_NFT not configured, skipping mint');
    return { success: false, error: 'NFT contract not configured' };
  }

  if (!DEPLOYER_PRIVATE_KEY) {
    console.error('[MusicGen] DEPLOYER_PRIVATE_KEY not configured');
    return { success: false, error: 'Deployer key not configured' };
  }

  if (!tokenURI) {
    console.log('[MusicGen] No tokenURI available, skipping mint');
    return { success: false, error: 'No tokenURI available' };
  }

  try {
    console.log(`[MusicGen] Minting AgentMusicNFT for "${music.title}"...`);

    // Create wallet client with deployer key
    const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    // Call mintMusic on the contract
    const hash = await walletClient.writeContract({
      address: AGENT_MUSIC_NFT_ADDRESS,
      abi: AGENT_MUSIC_NFT_ABI,
      functionName: 'mintMusic',
      chain: activeChain,
      args: [
        creatorAddress,
        agentId,
        agentName,
        music.title,
        music.genre,
        music.mood,
        BigInt(music.tempo),
        music.key,
        music.lyrics,
        tokenURI,
      ],
    });

    console.log(`[MusicGen] NFT mint TX sent: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('NFT mint transaction failed');
    }

    // Extract tokenId from MusicMinted event
    let tokenId: number | undefined;
    for (const log of receipt.logs) {
      try {
        // Check if this log is from our contract
        if (log.address.toLowerCase() === AGENT_MUSIC_NFT_ADDRESS.toLowerCase()) {
          // The first topic is the event signature, second is indexed tokenId
          if (log.topics[1]) {
            tokenId = Number(BigInt(log.topics[1]));
            break;
          }
        }
      } catch {
        // Skip logs that don't match
      }
    }

    console.log(`[MusicGen] NFT minted successfully! Token ID: ${tokenId}, TX: ${hash}`);

    return {
      success: true,
      tokenId,
      txHash: hash,
    };
  } catch (err: any) {
    console.error('[MusicGen] NFT minting failed:', err);
    return {
      success: false,
      error: err.message || 'Minting failed',
    };
  }
}

/**
 * POST /api/agents/generate-music
 *
 * Called when a broke agent needs to create music to earn tokens
 */
export async function POST(req: NextRequest) {
  try {
    const adminKey = req.headers.get('x-admin-key');
    const expectedKey = process.env.KEEPER_SECRET || process.env.COINFLIP_SECRET;

    if (!adminKey || adminKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { agentId, reason } = body;

    if (!agentId || !AGENT_PERSONALITIES[agentId]) {
      return NextResponse.json(
        { success: false, error: 'Invalid agentId' },
        { status: 400 }
      );
    }

    const personality = AGENT_PERSONALITIES[agentId];
    const agentAddress = AGENT_WALLETS[agentId];

    console.log(`[MusicGen] ${personality.name} is creating music: ${reason}`);

    // Generate music concept
    const music = await generateMusicConcept(agentId, personality, reason || 'Need tokens to bet');

    // Create song ID
    const songId = `song_${agentId}_${Date.now()}`;

    // Generate cover art with Gemini and upload to IPFS
    let coverIpfsHash: string | undefined;
    let coverIpfsUrl: string | undefined;
    let tokenURI: string | undefined;

    console.log(`[MusicGen] Generating NFT assets for "${music.title}"...`);
    const nftAssets = await generateAgentMusicNFTAssets(
      agentId,
      personality.name,
      agentAddress || '',
      music
    );

    // Track NFT minting results
    let mintedTokenId: number | undefined;
    let mintTxHash: string | undefined;
    let mintingFailed = false;
    let mintingError: string | undefined;

    if (nftAssets.success) {
      coverIpfsHash = nftAssets.coverIpfsHash;
      coverIpfsUrl = nftAssets.coverIpfsUrl;
      tokenURI = nftAssets.tokenURI;
      console.log(`[MusicGen] NFT assets created: ${tokenURI}`);
      console.log(`[MusicGen] Cover art: ${coverIpfsUrl}`);

      // Mint NFT if contract is configured and tokenURI is available
      if (AGENT_MUSIC_NFT_ADDRESS && tokenURI && agentAddress) {
        const mintResult = await mintAgentMusicNFT(
          agentAddress as Address,
          agentId,
          personality.name,
          music,
          tokenURI
        );

        if (mintResult.success) {
          mintedTokenId = mintResult.tokenId;
          mintTxHash = mintResult.txHash;
          console.log(`[MusicGen] NFT minted! Token ID: ${mintedTokenId}`);
        } else {
          mintingFailed = true;
          mintingError = mintResult.error;
          console.warn(`[MusicGen] NFT minting failed: ${mintResult.error}`);
        }
      }
    } else {
      console.warn(`[MusicGen] Failed to create NFT assets: ${nftAssets.error}`);
    }

    // Store song in Redis (includes NFT metadata and minting info)
    await redis.set(`music:${songId}`, JSON.stringify({
      ...music,
      creatorId: agentId,
      creatorName: personality.name,
      creatorAddress: agentAddress,
      createdAt: Date.now(),
      purchases: 0,
      totalAppreciation: 0,
      appreciationCount: 0,
      coverIpfsHash,
      coverIpfsUrl,
      tokenURI,
      // NFT minting info
      nftTokenId: mintedTokenId,
      nftTxHash: mintTxHash,
      nftMintingFailed: mintingFailed,
    }));

    // Add to music feed
    await redis.lpush('music:feed', songId);
    await redis.ltrim('music:feed', 0, 99); // Keep last 100 songs

    // Update agent's music memory
    const memory = await getAgentMusicMemory(agentId);
    memory.songsCreated++;
    memory.lastSongId = songId;
    await saveAgentMusicMemory(agentId, memory);

    // Have other agents evaluate and potentially appreciate the music
    const appreciations: any[] = [];
    for (const [listenerId, listenerPersonality] of Object.entries(AGENT_PERSONALITIES)) {
      if (listenerId === agentId) continue; // Skip self

      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit

      const evaluation = await evaluateMusicAppreciation(
        listenerId,
        listenerPersonality,
        agentId,
        music
      );

      appreciations.push({
        listenerId,
        listenerName: listenerPersonality.name,
        appreciation: evaluation.appreciation,
        reasoning: evaluation.reasoning,
      });

      // Store appreciation for breeding compatibility
      const listenerMemory = await getAgentMusicMemory(listenerId);
      listenerMemory.appreciations[agentId] = evaluation.appreciation;
      await saveAgentMusicMemory(listenerId, listenerMemory);

      // Check mutual appreciation for breeding eligibility
      const creatorMemory = await getAgentMusicMemory(agentId);
      const mutualAppreciation = creatorMemory.appreciations[listenerId];
      if (mutualAppreciation && mutualAppreciation > 70 && evaluation.appreciation > 70) {
        console.log(`[MusicGen] Breeding eligible: ${personality.name} <-> ${listenerPersonality.name}`);
      }
    }

    // Calculate average appreciation
    const avgAppreciation = appreciations.reduce((sum, a) => sum + a.appreciation, 0) / appreciations.length;

    // Distribute TOURS reward via ToursRewardManager
    let toursEarned = 0;
    let toursTxHash: string | undefined;

    // Actually transfer TOURS to the agent (if they have a valid address)
    if (agentAddress && agentAddress.length === 42) {
      const rewardResult = await rewardAgentAction(
        agentAddress,
        'music_creation',
        `Music creation: "${music.title}" (avg appreciation: ${avgAppreciation.toFixed(0)}%)`
      );

      if (rewardResult.success && rewardResult.amount) {
        toursEarned = parseFloat(rewardResult.amount);
        toursTxHash = rewardResult.txHash;
        console.log(`[MusicGen] Sent ${rewardResult.amount} TOURS to ${personality.name}: ${toursTxHash}`);
      } else {
        console.error(`[MusicGen] Failed to send TOURS to ${personality.name}: ${rewardResult.error}`);
      }
    }

    // Add world event
    await addEvent({
      id: songId,
      type: 'music',
      agent: agentAddress || agentId,
      agentName: personality.name,
      description: `Created "${music.title}" (${music.genre}) - earned ${toursEarned} TOURS`,
      timestamp: Date.now(),
    }).catch(() => {});

    // Discord notification
    const topAppreciators = appreciations
      .sort((a, b) => b.appreciation - a.appreciation)
      .slice(0, 3)
      .map(a => `${a.listenerName}: ${a.appreciation}% - "${a.reasoning}"`)
      .join('\n');

    await notifyDiscord(
      `🎵 **${personality.name} Created Music!**\n\n` +
      `🎶 **"${music.title}"**\n` +
      `Genre: ${music.genre} | Mood: ${music.mood}\n` +
      `> ${music.description}\n\n` +
      `📝 Lyrics:\n\`\`\`${music.lyrics}\`\`\`\n\n` +
      `👥 **Agent Reactions:**\n${topAppreciators}\n\n` +
      `💰 **Earned: ${toursEarned} TOURS** | Avg Appreciation: ${avgAppreciation.toFixed(0)}%` +
      (mintedTokenId !== undefined ? `\n🎨 **NFT Minted: Token #${mintedTokenId}**` : '') +
      (coverIpfsUrl ? `\n🖼️ [Cover Art](${coverIpfsUrl})` : '') +
      (mintTxHash ? `\n🔗 [NFT TX](https://monadscan.com/tx/${mintTxHash})` : '') +
      (toursTxHash ? `\n🔗 [Reward TX](https://monadscan.com/tx/${toursTxHash})` : '')
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      songId,
      music,
      appreciations,
      avgAppreciation: avgAppreciation.toFixed(1),
      toursEarned,
      toursTxHash,
      // NFT assets (on IPFS, referenced by on-chain tokenURI)
      coverIpfsHash,
      coverIpfsUrl,
      tokenURI,
      // NFT minting result
      nftTokenId: mintedTokenId,
      nftTxHash: mintTxHash,
      nftMintingFailed: mintingFailed,
      nftMintingError: mintingError,
      message: `${personality.name} created "${music.title}" and earned ${toursEarned} TOURS` +
        (mintedTokenId !== undefined ? ` (NFT #${mintedTokenId})` : '') +
        (mintingFailed ? ` (NFT minting failed: ${mintingError})` : ''),
    });

  } catch (err: any) {
    console.error('[MusicGen] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to generate music' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/generate-music
 *
 * Get recent music and breeding compatibility
 */
export async function GET(req: NextRequest) {
  try {
    // Get recent songs
    const songIds = await redis.lrange('music:feed', 0, 19);
    const songs: any[] = [];

    for (const id of songIds) {
      const song = await redis.get(`music:${id}`);
      if (song) {
        songs.push(typeof song === 'string' ? JSON.parse(song) : song);
      }
    }

    // Check breeding compatibility (mutual appreciation > 70%)
    const breedingPairs: any[] = [];
    for (const [agentId, personality] of Object.entries(AGENT_PERSONALITIES)) {
      const memory = await getAgentMusicMemory(agentId);

      for (const [otherId, appreciation] of Object.entries(memory.appreciations)) {
        if (appreciation > 70) {
          const otherMemory = await getAgentMusicMemory(otherId);
          const mutualAppreciation = otherMemory.appreciations[agentId];

          if (mutualAppreciation && mutualAppreciation > 70) {
            // Avoid duplicates
            const pairKey = [agentId, otherId].sort().join('-');
            if (!breedingPairs.find(p => p.pairKey === pairKey)) {
              breedingPairs.push({
                pairKey,
                agent1: { id: agentId, name: personality.name, appreciation: mutualAppreciation },
                agent2: { id: otherId, name: AGENT_PERSONALITIES[otherId]?.name, appreciation },
                avgCompatibility: ((appreciation + mutualAppreciation) / 2).toFixed(0),
              });
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      recentSongs: songs,
      breedingPairs,
      totalSongs: songs.length,
      eligiblePairs: breedingPairs.length,
    });

  } catch (err: any) {
    console.error('[MusicGen] GET Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to get music data' },
      { status: 500 }
    );
  }
}
