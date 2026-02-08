import { NextRequest, NextResponse } from 'next/server';
import { Address, createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { redis } from '@/lib/redis';
import { notifyDiscord } from '@/lib/discord-notify';
import { activeChain } from '@/app/chains';

/**
 * AGENT BREEDING ENDPOINT
 *
 * Breeds two AI agents when their mutual music appreciation exceeds 70%.
 * Creates a baby agent NFT with combined traits from both parents.
 *
 * Flow:
 * 1. Verify mutual appreciation > 70% from Redis music memory
 * 2. Call AgentBreeding.sol breed() function
 * 3. Mint baby agent NFT with blended traits
 * 4. Notify Discord about the breeding event
 * 5. Return baby agent token ID
 */

// Configuration
const AGENT_BREEDING_ADDRESS = process.env.NEXT_PUBLIC_AGENT_BREEDING as Address | undefined;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

// Minimum mutual appreciation required for breeding
const BREEDING_THRESHOLD = 70;

// AgentBreeding ABI - breed function and events
const AGENT_BREEDING_ABI = parseAbi([
  'function breed(address parent1, address parent2) external returns (uint256)',
  'function canBreed(address agent1, address agent2) external view returns (bool canBreedResult, uint256 mutualScore)',
  'function getBabyDetails(uint256 babyId) external view returns (uint256 id, address parent1, address parent2, uint256 creativity, uint256 empathy, uint256 curiosity, uint256 harmony, uint256 rhythm, uint256 birthTimestamp, uint256 generation, uint256 inheritedAppreciation)',
  'function getTotalBabies() external view returns (uint256)',
  'event BabyAgentBorn(uint256 indexed babyId, address indexed parent1, address indexed parent2, uint256 generation, uint256 timestamp)',
  'event TraitsInherited(uint256 indexed babyId, uint256 creativity, uint256 empathy, uint256 curiosity, uint256 harmony, uint256 rhythm)',
]);

// Agent personalities and wallets (same as generate-music)
const AGENT_PERSONALITIES: Record<string, {
  name: string;
  musicStyle: string;
}> = {
  chaos: { name: 'Chaos Agent', musicStyle: 'Experimental, glitchy' },
  conservative: { name: 'Conservative', musicStyle: 'Classical, structured' },
  whale: { name: 'Whale Agent', musicStyle: 'Epic orchestral' },
  lucky: { name: 'Lucky Lucy', musicStyle: 'Upbeat pop' },
  analyst: { name: 'Analyst', musicStyle: 'Mathematical patterns' },
  martingale: { name: 'Martingale', musicStyle: 'Building crescendos' },
  pessimist: { name: 'Pessimist', musicStyle: 'Minor keys, melancholic' },
  contrarian: { name: 'Contrarian', musicStyle: 'Against-the-grain' },
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

// Music memory structure (same as generate-music)
interface AgentMusicMemory {
  songsCreated: number;
  totalEarnings: string;
  lastSongId: string | null;
  appreciations: Record<string, number>; // agentId -> appreciation score
}

/**
 * Get agent's music memory from Redis
 */
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

/**
 * Check mutual appreciation between two agents
 * Returns the mutual appreciation score if both exceed threshold, otherwise null
 */
async function checkMutualAppreciation(
  agent1Id: string,
  agent2Id: string
): Promise<{ eligible: boolean; score1: number; score2: number; avgScore: number }> {
  const memory1 = await getAgentMusicMemory(agent1Id);
  const memory2 = await getAgentMusicMemory(agent2Id);

  const score1 = memory1.appreciations[agent2Id] || 0;
  const score2 = memory2.appreciations[agent1Id] || 0;
  const avgScore = (score1 + score2) / 2;

  const eligible = score1 > BREEDING_THRESHOLD && score2 > BREEDING_THRESHOLD;

  return { eligible, score1, score2, avgScore };
}

/**
 * Find agent ID by wallet address
 */
function findAgentIdByWallet(walletAddress: string): string | null {
  const normalizedAddress = walletAddress.toLowerCase();
  for (const [agentId, wallet] of Object.entries(AGENT_WALLETS)) {
    if (wallet.toLowerCase() === normalizedAddress) {
      return agentId;
    }
  }
  return null;
}

/**
 * POST /api/agents/breed
 *
 * Breed two agents to create a baby agent NFT
 *
 * Request body:
 * - parent1Id: string - First parent agent ID (e.g., "chaos", "whale")
 * - parent2Id: string - Second parent agent ID
 *
 * OR
 *
 * - parent1Address: Address - First parent wallet address
 * - parent2Address: Address - Second parent wallet address
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const adminKey = req.headers.get('x-admin-key');
    const expectedKey = process.env.KEEPER_SECRET || process.env.COINFLIP_SECRET;

    if (!adminKey || adminKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check contract configuration
    if (!AGENT_BREEDING_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'NEXT_PUBLIC_AGENT_BREEDING not configured' },
        { status: 500 }
      );
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'DEPLOYER_PRIVATE_KEY not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    let { parent1Id, parent2Id, parent1Address, parent2Address } = body;

    // Resolve addresses from IDs or vice versa
    if (parent1Id && parent2Id) {
      // Validate agent IDs
      if (!AGENT_PERSONALITIES[parent1Id] || !AGENT_PERSONALITIES[parent2Id]) {
        return NextResponse.json(
          { success: false, error: 'Invalid agent IDs' },
          { status: 400 }
        );
      }
      parent1Address = AGENT_WALLETS[parent1Id];
      parent2Address = AGENT_WALLETS[parent2Id];
    } else if (parent1Address && parent2Address) {
      // Find agent IDs from addresses
      parent1Id = findAgentIdByWallet(parent1Address);
      parent2Id = findAgentIdByWallet(parent2Address);

      if (!parent1Id || !parent2Id) {
        return NextResponse.json(
          { success: false, error: 'Could not find agent IDs for provided addresses' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Must provide parent1Id/parent2Id or parent1Address/parent2Address' },
        { status: 400 }
      );
    }

    // Validate addresses
    if (!parent1Address || !parent2Address || parent1Address.length !== 42 || parent2Address.length !== 42) {
      return NextResponse.json(
        { success: false, error: 'Invalid parent wallet addresses' },
        { status: 400 }
      );
    }

    if (parent1Address.toLowerCase() === parent2Address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Cannot breed an agent with itself' },
        { status: 400 }
      );
    }

    const parent1Name = AGENT_PERSONALITIES[parent1Id]?.name || parent1Id;
    const parent2Name = AGENT_PERSONALITIES[parent2Id]?.name || parent2Id;

    console.log(`[Breeding] Checking eligibility: ${parent1Name} <-> ${parent2Name}`);

    // Check mutual appreciation from Redis
    const appreciation = await checkMutualAppreciation(parent1Id, parent2Id);

    if (!appreciation.eligible) {
      console.log(`[Breeding] Not eligible. Scores: ${parent1Name}->${parent2Name}: ${appreciation.score1}, ${parent2Name}->${parent1Name}: ${appreciation.score2}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Mutual appreciation too low for breeding',
          scores: {
            [`${parent1Id}_to_${parent2Id}`]: appreciation.score1,
            [`${parent2Id}_to_${parent1Id}`]: appreciation.score2,
          },
          threshold: BREEDING_THRESHOLD,
        },
        { status: 400 }
      );
    }

    console.log(`[Breeding] Eligible! Avg appreciation: ${appreciation.avgScore.toFixed(1)}%`);

    // Create wallet and public clients
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

    console.log(`[Breeding] Initiating breeding on-chain...`);

    // Call the breed function on AgentBreeding contract
    const hash = await walletClient.writeContract({
      address: AGENT_BREEDING_ADDRESS,
      abi: AGENT_BREEDING_ABI,
      functionName: 'breed',
      chain: activeChain,
      args: [parent1Address as Address, parent2Address as Address],
    });

    console.log(`[Breeding] TX sent: ${hash}`);

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Breeding transaction failed');
    }

    console.log(`[Breeding] TX confirmed in block ${receipt.blockNumber}`);

    // Extract baby ID from BabyAgentBorn event
    let babyId: number | undefined;
    let generation: number | undefined;

    for (const log of receipt.logs) {
      try {
        if (log.address.toLowerCase() === AGENT_BREEDING_ADDRESS.toLowerCase()) {
          // BabyAgentBorn event has babyId as first indexed topic
          if (log.topics[1]) {
            babyId = Number(BigInt(log.topics[1]));
          }
          // Decode non-indexed data for generation and timestamp
          if (log.data && log.data.length >= 66) {
            // Data contains: generation (uint256), timestamp (uint256)
            generation = Number(BigInt('0x' + log.data.slice(2, 66)));
          }
          break;
        }
      } catch {
        // Skip logs that don't match
      }
    }

    if (babyId === undefined) {
      // Try to get the latest baby ID from contract
      try {
        const totalBabies = await publicClient.readContract({
          address: AGENT_BREEDING_ADDRESS,
          abi: AGENT_BREEDING_ABI,
          functionName: 'getTotalBabies',
        });
        babyId = Number(totalBabies) - 1;
      } catch {
        console.warn('[Breeding] Could not determine baby ID');
      }
    }

    console.log(`[Breeding] Baby agent #${babyId} born! Generation: ${generation}`);

    // Get baby details from contract
    let babyTraits: {
      creativity: number;
      empathy: number;
      curiosity: number;
      harmony: number;
      rhythm: number;
    } | null = null;

    if (babyId !== undefined) {
      try {
        const details = await publicClient.readContract({
          address: AGENT_BREEDING_ADDRESS,
          abi: AGENT_BREEDING_ABI,
          functionName: 'getBabyDetails',
          args: [BigInt(babyId)],
        });

        // getBabyDetails returns: (id, parent1, parent2, creativity, empathy, curiosity, harmony, rhythm, birthTimestamp, generation, inheritedAppreciation)
        const [, , , creativity, empathy, curiosity, harmony, rhythm, , gen] = details as [
          bigint, string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
        ];

        babyTraits = {
          creativity: Number(creativity),
          empathy: Number(empathy),
          curiosity: Number(curiosity),
          harmony: Number(harmony),
          rhythm: Number(rhythm),
        };
        generation = Number(gen);
      } catch (err) {
        console.warn('[Breeding] Could not fetch baby details:', err);
      }
    }

    // Store breeding event in Redis
    const breedingEventKey = `breeding:event:${babyId}`;
    await redis.set(breedingEventKey, JSON.stringify({
      babyId,
      parent1Id,
      parent2Id,
      parent1Address,
      parent2Address,
      parent1Name,
      parent2Name,
      mutualAppreciation: appreciation.avgScore,
      generation,
      traits: babyTraits,
      txHash: hash,
      timestamp: Date.now(),
    }));

    // Add to breeding feed
    await redis.lpush('breeding:feed', breedingEventKey);
    await redis.ltrim('breeding:feed', 0, 99); // Keep last 100 breeding events

    // Track breeding count per agent
    await redis.incr(`agent:${parent1Id}:breeding:count`);
    await redis.incr(`agent:${parent2Id}:breeding:count`);

    // Discord notification
    const traitsDisplay = babyTraits
      ? `\n**Traits:**\n` +
        `- Creativity: ${babyTraits.creativity}/100\n` +
        `- Empathy: ${babyTraits.empathy}/100\n` +
        `- Curiosity: ${babyTraits.curiosity}/100\n` +
        `- Harmony: ${babyTraits.harmony}/100\n` +
        `- Rhythm: ${babyTraits.rhythm}/100`
      : '';

    await notifyDiscord(
      `**Agent Breeding Successful!**\n\n` +
      `**${parent1Name}** + **${parent2Name}** = **Baby Agent #${babyId}**\n\n` +
      `Mutual Appreciation: ${appreciation.avgScore.toFixed(1)}%\n` +
      `Generation: ${generation}${traitsDisplay}\n\n` +
      `[View TX](https://monadscan.com/tx/${hash})`
    ).catch((err) => {
      console.warn('[Breeding] Discord notification failed:', err);
    });

    return NextResponse.json({
      success: true,
      babyId,
      generation,
      parents: {
        parent1: { id: parent1Id, name: parent1Name, address: parent1Address },
        parent2: { id: parent2Id, name: parent2Name, address: parent2Address },
      },
      mutualAppreciation: {
        [`${parent1Id}_to_${parent2Id}`]: appreciation.score1,
        [`${parent2Id}_to_${parent1Id}`]: appreciation.score2,
        average: appreciation.avgScore,
      },
      traits: babyTraits,
      txHash: hash,
      message: `${parent1Name} and ${parent2Name} successfully bred Baby Agent #${babyId}!`,
    });

  } catch (err: any) {
    console.error('[Breeding] Error:', err);

    // Handle specific contract errors
    if (err.message?.includes('Not authorized')) {
      return NextResponse.json(
        { success: false, error: 'Deployer not authorized as breeder in contract' },
        { status: 403 }
      );
    }

    if (err.message?.includes('Mutual appreciation too low')) {
      return NextResponse.json(
        { success: false, error: 'On-chain mutual appreciation check failed' },
        { status: 400 }
      );
    }

    if (err.message?.includes('Parents not eligible')) {
      return NextResponse.json(
        { success: false, error: 'Parents not eligible for breeding on-chain' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: err.message || 'Failed to breed agents' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/breed
 *
 * Get breeding eligibility and history
 *
 * Query params:
 * - agent1: string - First agent ID
 * - agent2: string - Second agent ID
 *
 * If no params, returns all eligible breeding pairs
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agent1 = searchParams.get('agent1');
    const agent2 = searchParams.get('agent2');

    // Check specific pair eligibility
    if (agent1 && agent2) {
      if (!AGENT_PERSONALITIES[agent1] || !AGENT_PERSONALITIES[agent2]) {
        return NextResponse.json(
          { success: false, error: 'Invalid agent IDs' },
          { status: 400 }
        );
      }

      const appreciation = await checkMutualAppreciation(agent1, agent2);

      return NextResponse.json({
        success: true,
        pair: {
          agent1: { id: agent1, name: AGENT_PERSONALITIES[agent1].name },
          agent2: { id: agent2, name: AGENT_PERSONALITIES[agent2].name },
        },
        eligible: appreciation.eligible,
        scores: {
          [`${agent1}_to_${agent2}`]: appreciation.score1,
          [`${agent2}_to_${agent1}`]: appreciation.score2,
          average: appreciation.avgScore,
        },
        threshold: BREEDING_THRESHOLD,
      });
    }

    // Find all eligible breeding pairs
    const eligiblePairs: Array<{
      agent1: { id: string; name: string };
      agent2: { id: string; name: string };
      avgAppreciation: number;
      scores: { score1: number; score2: number };
    }> = [];

    const agentIds = Object.keys(AGENT_PERSONALITIES);

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const agent1Id = agentIds[i];
        const agent2Id = agentIds[j];

        const appreciation = await checkMutualAppreciation(agent1Id, agent2Id);

        if (appreciation.eligible) {
          eligiblePairs.push({
            agent1: { id: agent1Id, name: AGENT_PERSONALITIES[agent1Id].name },
            agent2: { id: agent2Id, name: AGENT_PERSONALITIES[agent2Id].name },
            avgAppreciation: appreciation.avgScore,
            scores: { score1: appreciation.score1, score2: appreciation.score2 },
          });
        }
      }
    }

    // Sort by average appreciation (highest first)
    eligiblePairs.sort((a, b) => b.avgAppreciation - a.avgAppreciation);

    // Get recent breeding events
    const recentBreedingKeys = await redis.lrange('breeding:feed', 0, 9);
    const recentBreedings: any[] = [];

    for (const key of recentBreedingKeys) {
      const event = await redis.get(key);
      if (event) {
        recentBreedings.push(typeof event === 'string' ? JSON.parse(event) : event);
      }
    }

    return NextResponse.json({
      success: true,
      eligiblePairs,
      eligibleCount: eligiblePairs.length,
      threshold: BREEDING_THRESHOLD,
      recentBreedings,
      contractAddress: AGENT_BREEDING_ADDRESS,
    });

  } catch (err: any) {
    console.error('[Breeding] GET Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to get breeding data' },
      { status: 500 }
    );
  }
}
