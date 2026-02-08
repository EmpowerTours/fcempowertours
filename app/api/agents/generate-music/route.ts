import { NextRequest, NextResponse } from 'next/server';
import { Address, formatEther } from 'viem';
import Anthropic from '@anthropic-ai/sdk';
import { redis } from '@/lib/redis';
import { notifyDiscord } from '@/lib/discord-notify';
import { addEvent } from '@/lib/world/state';

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

    // Store song in Redis
    await redis.set(`music:${songId}`, JSON.stringify({
      ...music,
      creatorId: agentId,
      creatorName: personality.name,
      creatorAddress: agentAddress,
      createdAt: Date.now(),
      purchases: 0,
      totalAppreciation: 0,
      appreciationCount: 0,
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

    // Simulate TOURS earnings based on appreciation (1-10 TOURS)
    const toursEarned = Math.max(1, Math.round(avgAppreciation / 10));

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
      `💰 Earned: ${toursEarned} TOURS | Avg Appreciation: ${avgAppreciation.toFixed(0)}%`
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      songId,
      music,
      appreciations,
      avgAppreciation: avgAppreciation.toFixed(1),
      toursEarned,
      message: `${personality.name} created "${music.title}" and earned ${toursEarned} TOURS`,
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
