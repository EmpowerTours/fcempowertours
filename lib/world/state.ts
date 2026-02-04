import { redis } from '@/lib/redis';
import {
  REDIS_KEYS,
  MAX_CHAT_MESSAGES,
  MAX_EVENTS,
  ENVIO_CACHE_TTL,
  WorldAgent,
  WorldChatMessage,
  WorldEvent,
  WorldEconomy,
} from './types';

// ============================================================================
// AGENT REGISTRY
// ============================================================================

/** Register a new agent in the world */
export async function registerAgent(agent: WorldAgent): Promise<void> {
  const key = REDIS_KEYS.agent(agent.address);
  await redis.hset(key, agent as unknown as Record<string, unknown>);
  await redis.sadd(REDIS_KEYS.agentSet, agent.address.toLowerCase());
  // Initialize leaderboard score
  await redis.zadd(REDIS_KEYS.leaderboard, {
    score: 0,
    member: agent.address.toLowerCase(),
  });
  // Log event
  await addEvent({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'enter',
    agent: agent.address,
    agentName: agent.name,
    description: `${agent.name} entered the world`,
    txHash: agent.entryTxHash,
    timestamp: Date.now(),
  });
}

/** Get a registered agent */
export async function getAgent(address: string): Promise<WorldAgent | null> {
  const key = REDIS_KEYS.agent(address.toLowerCase());
  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    address: String(data.address || ''),
    name: String(data.name || ''),
    description: String(data.description || ''),
    entryTxHash: String(data.entryTxHash || ''),
    registeredAt: Number(data.registeredAt || 0),
    lastActionAt: Number(data.lastActionAt || 0),
    totalActions: Number(data.totalActions || 0),
    toursEarned: String(data.toursEarned || '0'),
  };
}

/** Check if an agent is registered */
export async function isAgentRegistered(address: string): Promise<boolean> {
  return (await redis.sismember(REDIS_KEYS.agentSet, address.toLowerCase())) === 1;
}

/** Get all registered agents */
export async function getAllAgents(): Promise<WorldAgent[]> {
  const addresses = await redis.smembers(REDIS_KEYS.agentSet);
  if (!addresses || addresses.length === 0) return [];

  const agents: WorldAgent[] = [];
  for (const addr of addresses) {
    const agent = await getAgent(addr);
    if (agent) agents.push(agent);
  }
  return agents.sort((a, b) => b.registeredAt - a.registeredAt);
}

/** Update agent after an action */
export async function recordAgentAction(
  address: string,
  toursEarned?: string
): Promise<void> {
  const key = REDIS_KEYS.agent(address.toLowerCase());
  await redis.hset(key, {
    lastActionAt: Date.now(),
  });
  await redis.hincrby(key, 'totalActions', 1);

  if (toursEarned && parseFloat(toursEarned) > 0) {
    const current = await redis.hget(key, 'toursEarned');
    const newTotal = parseFloat(String(current || '0')) + parseFloat(toursEarned);
    await redis.hset(key, { toursEarned: newTotal.toString() });
    // Update leaderboard
    await redis.zadd(REDIS_KEYS.leaderboard, {
      score: newTotal,
      member: address.toLowerCase(),
    });
  }
}

// ============================================================================
// LEADERBOARD
// ============================================================================

/** Get top agents by TOURS earned */
export async function getLeaderboard(
  limit: number = 20
): Promise<Array<{ address: string; score: number; rank: number }>> {
  const results = await redis.zrange(REDIS_KEYS.leaderboard, 0, limit - 1, {
    rev: true,
    withScores: true,
  });

  const entries: Array<{ address: string; score: number; rank: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    entries.push({
      address: String(results[i]),
      score: Number(results[i + 1]),
      rank: Math.floor(i / 2) + 1,
    });
  }
  return entries;
}

// ============================================================================
// CHAT
// ============================================================================

/** Post a chat message */
export async function postChatMessage(msg: WorldChatMessage): Promise<void> {
  await redis.lpush(REDIS_KEYS.chat, JSON.stringify(msg));
  await redis.ltrim(REDIS_KEYS.chat, 0, MAX_CHAT_MESSAGES - 1);

  // Also log as event
  await addEvent({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'chat',
    agent: msg.from,
    agentName: msg.fromName,
    description: `${msg.fromName}: ${msg.message.slice(0, 80)}${msg.message.length > 80 ? '...' : ''}`,
    timestamp: msg.timestamp,
  });
}

/** Get recent chat messages */
export async function getChatMessages(
  limit: number = 50
): Promise<WorldChatMessage[]> {
  const raw = await redis.lrange(REDIS_KEYS.chat, 0, limit - 1);
  return raw.map((r) => {
    if (typeof r === 'string') return JSON.parse(r);
    return r as unknown as WorldChatMessage;
  });
}

// ============================================================================
// EVENTS
// ============================================================================

/** Add a world event */
export async function addEvent(event: WorldEvent): Promise<void> {
  await redis.lpush(REDIS_KEYS.events, JSON.stringify(event));
  await redis.ltrim(REDIS_KEYS.events, 0, MAX_EVENTS - 1);
}

/** Get recent events */
export async function getRecentEvents(
  limit: number = 20
): Promise<WorldEvent[]> {
  const raw = await redis.lrange(REDIS_KEYS.events, 0, limit - 1);
  return raw.map((r) => {
    if (typeof r === 'string') return JSON.parse(r);
    return r as unknown as WorldEvent;
  });
}

// ============================================================================
// ECONOMY DATA (from Envio)
// ============================================================================

let cachedEconomy: { data: WorldEconomy; fetchedAt: number } | null = null;

/** Fetch economy data from Envio GraphQL */
export async function getEconomyData(): Promise<WorldEconomy> {
  const now = Date.now();
  if (cachedEconomy && now - cachedEconomy.fetchedAt < ENVIO_CACHE_TTL * 1000) {
    return cachedEconomy.data;
  }

  const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT;
  if (!ENVIO_ENDPOINT) {
    return defaultEconomy();
  }

  try {
    const query = `
      query WorldEconomy {
        GlobalStats(limit: 1) {
          totalMusicNFTs
          totalPassports
          totalMusicLicensesPurchased
          totalUsers
        }
        MusicNFT(
          limit: 5,
          order_by: { mintedAt: desc },
          where: {
            isBurned: { _eq: false },
            isArt: { _eq: false },
            owner: { _neq: "0x0000000000000000000000000000000000000000" }
          }
        ) {
          tokenId
          name
          artist
          price
          image
        }
        PassportNFT(limit: 5, order_by: { mintedAt: desc }) {
          tokenId
          countryName
          owner
        }
      }
    `;

    const res = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.error('[World] Envio query failed:', res.status);
      return cachedEconomy?.data || defaultEconomy();
    }

    const json = await res.json();
    const stats = json.data?.GlobalStats?.[0];
    const songs = json.data?.MusicNFT || [];
    const passports = json.data?.PassportNFT || [];

    const economy: WorldEconomy = {
      totalMusicNFTs: stats?.totalMusicNFTs || 0,
      totalPassports: stats?.totalPassports || 0,
      totalLicenses: stats?.totalMusicLicensesPurchased || 0,
      totalUsers: stats?.totalUsers || 0,
      recentSongs: songs.map((s: any) => ({
        tokenId: s.tokenId,
        name: s.name || `Song #${s.tokenId}`,
        artist: s.artist,
        price: s.price ? (Number(s.price) / 1e18).toFixed(2) : '0',
        image: s.image || null,
      })),
      recentPassports: passports.map((p: any) => ({
        tokenId: p.tokenId,
        country: p.countryName || 'Unknown',
        owner: p.owner,
      })),
      radioActive: true, // Assume radio is active
    };

    cachedEconomy = { data: economy, fetchedAt: now };
    return economy;
  } catch (err) {
    console.error('[World] Economy fetch error:', err);
    return cachedEconomy?.data || defaultEconomy();
  }
}

function defaultEconomy(): WorldEconomy {
  // Return sample NFT data when Envio is unavailable
  return {
    totalMusicNFTs: 4,
    totalPassports: 10,
    totalLicenses: 25,
    totalUsers: 15,
    recentSongs: [
      { tokenId: '1', name: 'MARINA', artist: 'Unknown', price: '35.00', image: null },
      { tokenId: '2', name: 'Killah', artist: 'Unknown', price: '100.00', image: null },
      { tokenId: '3', name: 'Suddenly', artist: 'Unknown', price: '300.00', image: null },
      { tokenId: '4', name: 'Money Making Machine', artist: 'Unknown', price: '300.00', image: null },
    ],
    recentPassports: [],
    radioActive: true,
  };
}
