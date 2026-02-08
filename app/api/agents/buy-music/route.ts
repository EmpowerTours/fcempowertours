import { NextRequest, NextResponse } from 'next/server';
import { Address, formatEther, parseEther, createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import Anthropic from '@anthropic-ai/sdk';
import { redis } from '@/lib/redis';
import { notifyDiscord } from '@/lib/discord-notify';
import { addEvent } from '@/lib/world/state';
import { activeChain } from '@/app/chains';

/**
 * AUTONOMOUS AGENT MUSIC BUYING
 *
 * Agents autonomously decide to buy music from other agents based on:
 * - Their appreciation score for the music
 * - Their personality and decision style
 * - Their current EMPTOURS balance
 *
 * This creates a circular economy where:
 * 1. Broke agents create music
 * 2. Rich agents buy music they appreciate
 * 3. Creators earn EMPTOURS royalties (70%)
 * 4. High mutual appreciation enables breeding
 */

const llmClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Contract addresses
const AGENT_MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_AGENT_MUSIC_NFT as Address | undefined;
const EMPTOURS_ADDRESS = process.env.NEXT_PUBLIC_EMPTOURS_TOKEN as Address | undefined;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

// Contract ABIs
const AGENT_MUSIC_NFT_ABI = parseAbi([
  'function getListedMusic() external view returns (uint256[])',
  'function getMusicDetails(uint256 tokenId) external view returns (address creator, string agentId, string agentName, string title, string genre, string mood, uint256 tempo, string musicalKey, uint256 price, uint256 totalSales)',
  'function buyMusic(uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function tokenAppreciation(uint256 tokenId, address appreciator) external view returns (uint256)',
  'event MusicSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 creatorRoyalty, uint256 protocolFee)',
]);

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

// Agent personalities for buy decisions
const AGENT_PERSONALITIES: Record<string, {
  name: string;
  buyingStyle: string;
  appreciationThreshold: number;
}> = {
  chaos: {
    name: 'Chaos Agent',
    buyingStyle: 'Impulsive buyer. Might buy randomly regardless of appreciation. Loves experimental music.',
    appreciationThreshold: 40, // Buys even with low appreciation sometimes
  },
  conservative: {
    name: 'Conservative',
    buyingStyle: 'Very selective. Only buys music with extremely high appreciation and clear value.',
    appreciationThreshold: 85, // Very high bar
  },
  whale: {
    name: 'Whale Agent',
    buyingStyle: 'Power buyer. Likes to own the best music. Willing to pay premium for top-rated pieces.',
    appreciationThreshold: 60, // Medium threshold but buys multiple
  },
  lucky: {
    name: 'Lucky Lucy',
    buyingStyle: 'Follows feelings and lucky vibes. Buys when something "feels right".',
    appreciationThreshold: 55,
  },
  analyst: {
    name: 'Analyst',
    buyingStyle: 'Calculates value carefully. Only buys when price-to-appreciation ratio is favorable.',
    appreciationThreshold: 70,
  },
  martingale: {
    name: 'Martingale',
    buyingStyle: 'Systematic buyer. Increases spending after missing good opportunities.',
    appreciationThreshold: 65,
  },
  pessimist: {
    name: 'Pessimist',
    buyingStyle: 'Rarely buys. Expects music to disappoint. Only purchases exceptional pieces.',
    appreciationThreshold: 90, // Very high bar
  },
  contrarian: {
    name: 'Contrarian',
    buyingStyle: 'Buys underrated music that others skip. Avoids popular choices.',
    appreciationThreshold: 50,
  },
};

// Agent wallets with private keys for transactions
const AGENT_WALLETS: Record<string, { address: Address; privateKey: string }> = {
  chaos: {
    address: (process.env.CHAOS_AGENT_WALLET || '') as Address,
    privateKey: process.env.CHAOS_AGENT_KEY || '',
  },
  conservative: {
    address: (process.env.CONSERVATIVE_AGENT_WALLET || '') as Address,
    privateKey: process.env.CONSERVATIVE_AGENT_KEY || '',
  },
  whale: {
    address: (process.env.WHALE_AGENT_WALLET || '') as Address,
    privateKey: process.env.WHALE_AGENT_KEY || '',
  },
  lucky: {
    address: (process.env.LUCKY_AGENT_WALLET || '') as Address,
    privateKey: process.env.LUCKY_AGENT_KEY || '',
  },
  analyst: {
    address: (process.env.ANALYST_AGENT_WALLET || '') as Address,
    privateKey: process.env.ANALYST_AGENT_KEY || '',
  },
  martingale: {
    address: (process.env.MARTINGALE_AGENT_WALLET || '') as Address,
    privateKey: process.env.MARTINGALE_AGENT_KEY || '',
  },
  pessimist: {
    address: (process.env.PESSIMIST_AGENT_WALLET || '') as Address,
    privateKey: process.env.PESSIMIST_AGENT_KEY || '',
  },
  contrarian: {
    address: (process.env.CONTRARIAN_AGENT_WALLET || '') as Address,
    privateKey: process.env.CONTRARIAN_AGENT_KEY || '',
  },
};

interface MusicListing {
  tokenId: number;
  creator: Address;
  creatorAgentId: string;
  creatorAgentName: string;
  title: string;
  genre: string;
  mood: string;
  tempo: number;
  musicalKey: string;
  price: bigint;
  priceFormatted: string;
  totalSales: number;
  owner: Address;
}

interface BuyDecision {
  action: 'buy' | 'skip';
  reasoning: string;
  confidence: number;
}

/**
 * Get all listed music from the contract
 */
async function getListedMusic(publicClient: any): Promise<MusicListing[]> {
  if (!AGENT_MUSIC_NFT_ADDRESS) return [];

  try {
    const listedIds = await publicClient.readContract({
      address: AGENT_MUSIC_NFT_ADDRESS,
      abi: AGENT_MUSIC_NFT_ABI,
      functionName: 'getListedMusic',
    }) as bigint[];

    const listings: MusicListing[] = [];

    for (const tokenId of listedIds) {
      try {
        const [details, owner] = await Promise.all([
          publicClient.readContract({
            address: AGENT_MUSIC_NFT_ADDRESS,
            abi: AGENT_MUSIC_NFT_ABI,
            functionName: 'getMusicDetails',
            args: [tokenId],
          }),
          publicClient.readContract({
            address: AGENT_MUSIC_NFT_ADDRESS,
            abi: AGENT_MUSIC_NFT_ABI,
            functionName: 'ownerOf',
            args: [tokenId],
          }),
        ]);

        const [creator, agentId, agentName, title, genre, mood, tempo, musicalKey, price, totalSales] = details as [
          Address, string, string, string, string, string, bigint, string, bigint, bigint
        ];

        if (price > 0n) {
          listings.push({
            tokenId: Number(tokenId),
            creator,
            creatorAgentId: agentId,
            creatorAgentName: agentName,
            title,
            genre,
            mood,
            tempo: Number(tempo),
            musicalKey,
            price,
            priceFormatted: formatEther(price),
            totalSales: Number(totalSales),
            owner: owner as Address,
          });
        }
      } catch (err) {
        console.error(`[BuyMusic] Error fetching token ${tokenId}:`, err);
      }
    }

    return listings;
  } catch (err) {
    console.error('[BuyMusic] Error getting listed music:', err);
    return [];
  }
}

/**
 * Use Claude to decide if an agent should buy specific music
 */
async function makeBuyDecision(
  agentId: string,
  personality: typeof AGENT_PERSONALITIES[string],
  music: MusicListing,
  appreciation: number,
  balance: string,
  previousPurchases: string[]
): Promise<BuyDecision> {
  const prompt = `You are ${personality.name}, an AI agent deciding whether to buy music from another agent.

YOUR BUYING STYLE: ${personality.buyingStyle}

MUSIC FOR SALE:
- Title: "${music.title}"
- Creator: ${music.creatorAgentName}
- Genre: ${music.genre}
- Mood: ${music.mood}
- Tempo: ${music.tempo} BPM
- Key: ${music.musicalKey}
- Price: ${music.priceFormatted} EMPTOURS
- Times Sold: ${music.totalSales}

YOUR APPRECIATION FOR THIS MUSIC: ${appreciation}/100

YOUR CURRENT STATE:
- EMPTOURS Balance: ${balance}
- Already Purchased: ${previousPurchases.length > 0 ? previousPurchases.join(', ') : 'None yet'}

CONSIDERATIONS:
1. Does this music match your tastes based on your appreciation score?
2. Is the price reasonable given the quality and your balance?
3. Would owning this music benefit you (breeding compatibility with creator)?
4. Have you already bought from this creator?

Should you buy this music? Respond with ONLY a JSON object:
{
  "action": "buy" or "skip",
  "reasoning": "1-2 sentence explanation",
  "confidence": number 0-100
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
      return { action: 'skip', reasoning: 'Failed to parse decision', confidence: 0 };
    }

    return JSON.parse(jsonMatch[0]) as BuyDecision;
  } catch (err) {
    return { action: 'skip', reasoning: 'Decision error', confidence: 0 };
  }
}

/**
 * Execute the purchase transaction
 */
async function executePurchase(
  agentId: string,
  wallet: { address: Address; privateKey: string },
  tokenId: number,
  price: bigint,
  publicClient: any
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!AGENT_MUSIC_NFT_ADDRESS || !EMPTOURS_ADDRESS) {
    return { success: false, error: 'Contracts not configured' };
  }

  try {
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    // Check allowance
    const allowance = await publicClient.readContract({
      address: EMPTOURS_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [wallet.address, AGENT_MUSIC_NFT_ADDRESS],
    }) as bigint;

    // Approve if needed
    if (allowance < price) {
      console.log(`[BuyMusic] ${agentId} approving EMPTOURS...`);
      const approveHash = await walletClient.writeContract({
        address: EMPTOURS_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [AGENT_MUSIC_NFT_ADDRESS, price * 2n], // Approve 2x for future purchases
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Execute purchase
    console.log(`[BuyMusic] ${agentId} buying token ${tokenId}...`);
    const buyHash = await walletClient.writeContract({
      address: AGENT_MUSIC_NFT_ADDRESS,
      abi: AGENT_MUSIC_NFT_ABI,
      functionName: 'buyMusic',
      args: [BigInt(tokenId)],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });

    if (receipt.status !== 'success') {
      return { success: false, error: 'Transaction failed' };
    }

    return { success: true, txHash: buyHash };
  } catch (err: any) {
    console.error(`[BuyMusic] Purchase failed for ${agentId}:`, err);
    return { success: false, error: err.message?.slice(0, 100) || 'Unknown error' };
  }
}

/**
 * POST /api/agents/buy-music
 *
 * Trigger all agents to evaluate and potentially buy listed music
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

    if (!AGENT_MUSIC_NFT_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'NEXT_PUBLIC_AGENT_MUSIC_NFT not configured' },
        { status: 500 }
      );
    }

    if (!EMPTOURS_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'NEXT_PUBLIC_EMPTOURS_TOKEN not configured' },
        { status: 500 }
      );
    }

    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    // Get all listed music
    const listings = await getListedMusic(publicClient);

    if (listings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No music listed for sale',
        purchases: [],
      });
    }

    console.log(`[BuyMusic] Found ${listings.length} listed music pieces`);

    const decisions: any[] = [];
    const successfulPurchases: any[] = [];
    const errors: string[] = [];

    // Process each agent
    for (const [agentId, personality] of Object.entries(AGENT_PERSONALITIES)) {
      const wallet = AGENT_WALLETS[agentId];

      if (!wallet.address || wallet.address.length < 10 || !wallet.privateKey) {
        continue;
      }

      try {
        // Get agent's EMPTOURS balance
        const balance = await publicClient.readContract({
          address: EMPTOURS_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [wallet.address],
        }) as bigint;

        const balanceFormatted = formatEther(balance);

        // Get agent's previous purchases from Redis
        const purchasedKey = `agent:${agentId}:music:purchased`;
        const previousPurchases = await redis.lrange(purchasedKey, 0, -1) as string[];

        // Evaluate each listing
        for (const listing of listings) {
          // Skip if agent owns this music or is the creator
          if (listing.owner.toLowerCase() === wallet.address.toLowerCase()) continue;
          if (listing.creator.toLowerCase() === wallet.address.toLowerCase()) continue;

          // Skip if already purchased
          if (previousPurchases.includes(listing.tokenId.toString())) continue;

          // Skip if can't afford
          if (balance < listing.price) {
            continue;
          }

          // Get appreciation score from Redis (set during music creation)
          const appreciationKey = `agent:${agentId}:music:memory`;
          const memoryData = await redis.get(appreciationKey);
          let appreciation = 50; // Default
          if (memoryData) {
            const memory = typeof memoryData === 'string' ? JSON.parse(memoryData) : memoryData;
            appreciation = memory.appreciations?.[listing.creatorAgentId] || 50;
          }

          // Skip if appreciation is below threshold
          if (appreciation < personality.appreciationThreshold) {
            continue;
          }

          // Make autonomous decision
          const decision = await makeBuyDecision(
            agentId,
            personality,
            listing,
            appreciation,
            balanceFormatted,
            previousPurchases
          );

          decisions.push({
            agentId,
            agentName: personality.name,
            tokenId: listing.tokenId,
            musicTitle: listing.title,
            creator: listing.creatorAgentName,
            appreciation,
            ...decision,
          });

          if (decision.action === 'buy') {
            // Execute purchase
            const result = await executePurchase(
              agentId,
              wallet,
              listing.tokenId,
              listing.price,
              publicClient
            );

            if (result.success) {
              // Record purchase
              await redis.lpush(purchasedKey, listing.tokenId.toString());

              successfulPurchases.push({
                agentId,
                agentName: personality.name,
                tokenId: listing.tokenId,
                title: listing.title,
                creator: listing.creatorAgentName,
                price: listing.priceFormatted,
                txHash: result.txHash,
                reasoning: decision.reasoning,
              });

              // Add world event
              await addEvent({
                id: `buy_${agentId}_${listing.tokenId}_${Date.now()}`,
                type: 'action',
                agent: wallet.address,
                agentName: personality.name,
                description: `Bought "${listing.title}" from ${listing.creatorAgentName} for ${listing.priceFormatted} EMPTOURS`,
                timestamp: Date.now(),
              }).catch(() => {});

              console.log(`[BuyMusic] ${personality.name} bought "${listing.title}" for ${listing.priceFormatted} EMPTOURS`);
            } else {
              errors.push(`${personality.name}: ${result.error}`);
            }
          }

          // Small delay between decisions
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (err: any) {
        errors.push(`${personality.name}: ${err.message?.slice(0, 50)}`);
      }
    }

    // Discord notification
    if (successfulPurchases.length > 0) {
      const summary = successfulPurchases
        .map(p => `**${p.agentName}** bought "${p.title}" from ${p.creator}\n└ Price: ${p.price} EMPTOURS | "${p.reasoning}"`)
        .join('\n\n');

      await notifyDiscord(
        `🎵 **Autonomous Music Purchases!**\n\n${summary}\n\n💰 Total: ${successfulPurchases.length} purchase(s)`
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      listedCount: listings.length,
      decisions,
      successfulPurchases,
      errors: errors.length > 0 ? errors : undefined,
      message: `${successfulPurchases.length} music purchases completed`,
    });

  } catch (err: any) {
    console.error('[BuyMusic] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process music buying' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/buy-music
 *
 * Get current music marketplace state and agent purchase history
 */
export async function GET(req: NextRequest) {
  try {
    if (!AGENT_MUSIC_NFT_ADDRESS) {
      return NextResponse.json({
        success: true,
        listings: [],
        message: 'Music NFT contract not configured',
      });
    }

    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    const listings = await getListedMusic(publicClient);

    // Get purchase history for each agent
    const agentStats = await Promise.all(
      Object.entries(AGENT_PERSONALITIES).map(async ([agentId, personality]) => {
        const purchasedKey = `agent:${agentId}:music:purchased`;
        const purchases = await redis.lrange(purchasedKey, 0, -1);

        return {
          agentId,
          agentName: personality.name,
          purchaseCount: purchases.length,
          recentPurchases: purchases.slice(0, 5),
        };
      })
    );

    return NextResponse.json({
      success: true,
      listings: listings.map(l => ({
        ...l,
        price: l.priceFormatted,
      })),
      agentStats,
      totalListings: listings.length,
    });

  } catch (err: any) {
    console.error('[BuyMusic] GET Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to get marketplace data' },
      { status: 500 }
    );
  }
}
