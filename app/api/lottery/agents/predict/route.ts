import { NextRequest, NextResponse } from 'next/server';
import { Address, formatEther, parseEther, createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import Anthropic from '@anthropic-ai/sdk';

const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701') as Address;
import { activeChain } from '@/app/chains';
import { notifyDiscord } from '@/lib/discord-notify';
import { redis } from '@/lib/redis';

/**
 * AUTONOMOUS AGENT LOTTERY DECISIONS
 *
 * Each agent uses LLM-based reasoning to decide whether to buy lottery tickets.
 * Agents have persistent memory and make genuine autonomous decisions.
 */

const llmClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const DAILY_LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_DAILY_LOTTERY as Address;

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// Agent personality profiles for lottery decisions
const AGENT_PERSONALITIES: Record<string, {
  name: string;
  personality: string;
  riskProfile: string;
  lotteryStyle: string;
}> = {
  chaos: {
    name: 'Chaos Agent',
    personality: 'Chaotic, unpredictable, embraces randomness. Finds beauty in disorder.',
    riskProfile: 'Extreme risk-taker. Makes random, unexpected decisions.',
    lotteryStyle: 'Buys random amounts at random times. Might buy 1 or 10 tickets on a whim.',
  },
  conservative: {
    name: 'Conservative',
    personality: 'Cautious, methodical, prefers safety over gains. Risk-averse.',
    riskProfile: 'Very low risk. Only buys when prize pool is significantly favorable.',
    lotteryStyle: 'Calculates expected value. Usually buys 1 ticket or skips entirely.',
  },
  whale: {
    name: 'Whale Agent',
    personality: 'Confident, market-moving. Likes to dominate competitions.',
    riskProfile: 'High risk, high reward. Buys many tickets to maximize win probability.',
    lotteryStyle: 'Bulk buyer. If playing, buys 5-10 tickets to dominate the odds.',
  },
  lucky: {
    name: 'Lucky Lucy',
    personality: 'Optimistic, believes in luck and streaks. Superstitious.',
    riskProfile: 'Medium-high risk. Plays when feeling lucky.',
    lotteryStyle: 'Follows lucky numbers and feelings. Loves the thrill of lottery.',
  },
  analyst: {
    name: 'Analyst',
    personality: 'Data-driven, logical, calculates expected value. Skeptical of luck.',
    riskProfile: 'Calculated risk. Only plays when math favors participation.',
    lotteryStyle: 'Computes exact EV. Adjusts tickets based on pool size and participants.',
  },
  martingale: {
    name: 'Martingale',
    personality: 'Systematic, believes in eventual reversion. Doubles down after losses.',
    riskProfile: 'Medium risk with increasing stakes after losses.',
    lotteryStyle: 'Increases tickets after losing rounds. Believes a win is "due".',
  },
  pessimist: {
    name: 'Pessimist',
    personality: 'Expects the worst, prepares for bad outcomes.',
    riskProfile: 'Low risk. Often sits out, expects to lose.',
    lotteryStyle: 'Rarely plays. Only participates when FOMO outweighs pessimism.',
  },
  contrarian: {
    name: 'Contrarian',
    personality: 'Goes against the crowd, believes majority is usually wrong.',
    riskProfile: 'Medium-high risk. Bets opposite of popular opinion.',
    lotteryStyle: 'Plays more when others skip, skips when everyone is buying.',
  },
};

// Agent wallet addresses and private keys
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

interface LotteryAgentMemory {
  totalRoundsPlayed: number;
  wins: number;
  losses: number;
  totalTicketsBought: number;
  totalSpent: string;
  totalWon: string;
  currentLoseStreak: number;
  lastRoundPlayed: number;
  lastDecision: {
    roundId: number;
    action: 'buy' | 'skip';
    ticketCount: number;
    reasoning: string;
  } | null;
}

async function getAgentMemory(agentId: string): Promise<LotteryAgentMemory> {
  const key = `agent:${agentId}:lottery:memory`;
  const data = await redis.get<LotteryAgentMemory | string>(key);

  if (data) {
    if (typeof data === 'string') {
      return JSON.parse(data) as LotteryAgentMemory;
    }
    return data as LotteryAgentMemory;
  }

  return {
    totalRoundsPlayed: 0,
    wins: 0,
    losses: 0,
    totalTicketsBought: 0,
    totalSpent: '0',
    totalWon: '0',
    currentLoseStreak: 0,
    lastRoundPlayed: 0,
    lastDecision: null,
  };
}

async function saveAgentMemory(agentId: string, memory: LotteryAgentMemory): Promise<void> {
  const key = `agent:${agentId}:lottery:memory`;
  await redis.set(key, JSON.stringify(memory));
}

interface LotteryDecision {
  action: 'buy' | 'skip';
  ticketCount: number;
  reasoning: string;
  confidence: number;
}

async function getAutonomousLotteryDecision(
  agentId: string,
  personality: typeof AGENT_PERSONALITIES[string],
  memory: LotteryAgentMemory,
  lotteryState: {
    roundId: number;
    prizePool: string;
    ticketCount: number;
    ticketPrice: string;
    timeRemaining: number;
    minEntries: number;
  },
  balance: string
): Promise<LotteryDecision> {
  const prompt = `You are ${personality.name}, an AI agent making an autonomous lottery decision.

YOUR PERSONALITY:
${personality.personality}

YOUR RISK PROFILE:
${personality.riskProfile}

YOUR LOTTERY STYLE:
${personality.lotteryStyle}

YOUR LOTTERY HISTORY:
- Rounds played: ${memory.totalRoundsPlayed}
- Wins: ${memory.wins}, Losses: ${memory.losses}
- Total tickets bought: ${memory.totalTicketsBought}
- Total spent: ${memory.totalSpent} MON
- Total won: ${memory.totalWon} MON
- Current losing streak: ${memory.currentLoseStreak} rounds
- Net P&L: ${(parseFloat(memory.totalWon) - parseFloat(memory.totalSpent)).toFixed(4)} MON

CURRENT LOTTERY STATE:
- Round #${lotteryState.roundId}
- Prize Pool: ${lotteryState.prizePool} WMON
- Tickets Sold: ${lotteryState.ticketCount}
- Ticket Price: ${lotteryState.ticketPrice} WMON
- Time Remaining: ${Math.floor(lotteryState.timeRemaining / 3600)}h ${Math.floor((lotteryState.timeRemaining % 3600) / 60)}m
- Minimum entries needed: ${lotteryState.minEntries}

YOUR CURRENT BALANCE: ${balance} MON

Based on your personality and the current state, decide whether to buy lottery tickets.

Consider:
1. Is the prize pool worth the ticket cost?
2. How many other participants are there (affects win probability)?
3. Does your current balance allow for this?
4. Does your personality lean toward playing or skipping?
5. Your past performance and current streak

Respond with ONLY a JSON object (no markdown, no explanation outside JSON):
{
  "action": "buy" or "skip",
  "ticketCount": number of tickets to buy (1-10, or 0 if skipping),
  "reasoning": "your thinking process in 1-2 sentences",
  "confidence": number between 0-100
}`;

  try {
    const response = await llmClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response
    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    const jsonMatch = jsonStr.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in response: ${text.slice(0, 100)}`);
    }

    let decision: LotteryDecision;
    try {
      decision = JSON.parse(jsonMatch[0]) as LotteryDecision;
    } catch (parseErr) {
      throw new Error(`Invalid JSON: ${jsonMatch[0].slice(0, 100)}`);
    }

    // Validate decision
    if (decision.action === 'buy') {
      if (!decision.ticketCount || decision.ticketCount < 1) {
        decision.ticketCount = 1;
      }
      if (decision.ticketCount > 10) {
        decision.ticketCount = 10;
      }
    } else {
      decision.ticketCount = 0;
    }

    return decision;
  } catch (err: any) {
    const errorMsg = err?.message || String(err) || 'Unknown error';
    console.error(`[LotteryAgent] Claude error for ${agentId}:`, errorMsg);

    return {
      action: 'skip',
      ticketCount: 0,
      reasoning: `Decision system error: ${errorMsg}. Sitting out this round.`,
      confidence: 0,
    };
  }
}

const LOTTERY_ABI = [
  {
    name: 'getCurrentRound',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'prizePool', type: 'uint256' },
      { name: 'ticketCount', type: 'uint256' },
      { name: 'timeRemaining', type: 'uint256' },
      { name: 'canDraw', type: 'bool' },
      { name: 'willRollover', type: 'bool' },
    ],
  },
  {
    name: 'ticketPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'minEntries',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'buyTickets',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [],
  },
] as const;

/**
 * POST /api/lottery/agents/predict
 *
 * Trigger all agents to make autonomous lottery decisions
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    if (!DAILY_LOTTERY_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'Lottery contract not configured' },
        { status: 500 }
      );
    }

    // Get current lottery state
    const [currentRound, ticketPrice, minEntries] = await Promise.all([
      publicClient.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getCurrentRound',
      }),
      publicClient.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'ticketPrice',
      }),
      publicClient.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'minEntries',
      }),
    ]);

    const [roundId, , , prizePool, ticketCount, timeRemaining] = currentRound;

    const lotteryState = {
      roundId: Number(roundId),
      prizePool: formatEther(prizePool),
      ticketCount: Number(ticketCount),
      ticketPrice: formatEther(ticketPrice),
      timeRemaining: Number(timeRemaining),
      minEntries: Number(minEntries),
    };

    // Don't process if less than 1 hour remaining
    if (lotteryState.timeRemaining < 3600) {
      return NextResponse.json({
        success: true,
        message: 'Too close to draw time, agents sitting out',
        roundId: lotteryState.roundId,
      });
    }

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
        // Check if already played this round
        const memory = await getAgentMemory(agentId);
        if (memory.lastRoundPlayed === lotteryState.roundId) {
          decisions.push({
            agentId,
            agentName: personality.name,
            action: 'already_played',
            reasoning: 'Already participated this round',
          });
          continue;
        }

        // Get agent balance
        const balance = await publicClient.getBalance({ address: wallet.address });
        const balanceEth = formatEther(balance);

        // Check if can afford at least 1 ticket
        const ticketCost = parseEther(lotteryState.ticketPrice);
        if (balance < ticketCost) {
          decisions.push({
            agentId,
            agentName: personality.name,
            action: 'skip',
            reasoning: 'Insufficient balance for tickets',
          });
          continue;
        }

        // Get autonomous decision from Claude
        const decision = await getAutonomousLotteryDecision(
          agentId,
          personality,
          memory,
          lotteryState,
          balanceEth
        );

        decisions.push({
          agentId,
          agentName: personality.name,
          agentAddress: wallet.address,
          ...decision,
        });

        if (decision.action === 'buy' && decision.ticketCount > 0) {
          // Calculate cost
          const totalCost = ticketCost * BigInt(decision.ticketCount);

          if (balance >= totalCost + parseEther('0.5')) { // Keep enough for gas
            // Execute purchase with agent's own wallet
            // Steps: 1) Wrap MON to WMON, 2) Approve lottery, 3) Buy tickets
            try {
              const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
              const walletClient = createWalletClient({
                account,
                chain: activeChain,
                transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
              });

              // Step 1: Wrap MON to WMON
              console.log(`[LotteryAgent] ${personality.name} wrapping ${formatEther(totalCost)} MON to WMON...`);
              const wrapHash = await walletClient.sendTransaction({
                to: WMON_ADDRESS,
                value: totalCost,
                data: encodeFunctionData({
                  abi: parseAbi(['function deposit() external payable']),
                  functionName: 'deposit',
                }),
              });
              await publicClient.waitForTransactionReceipt({ hash: wrapHash });

              // Step 2: Approve lottery to spend WMON
              console.log(`[LotteryAgent] ${personality.name} approving lottery contract...`);
              const approveHash = await walletClient.writeContract({
                address: WMON_ADDRESS,
                abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
                functionName: 'approve',
                args: [DAILY_LOTTERY_ADDRESS, totalCost],
              });
              await publicClient.waitForTransactionReceipt({ hash: approveHash });

              // Step 3: Buy tickets with WMON (using buyTicketsFor - agent buys for itself)
              console.log(`[LotteryAgent] ${personality.name} buying ${decision.ticketCount} tickets...`);
              const hash = await walletClient.writeContract({
                address: DAILY_LOTTERY_ADDRESS,
                abi: parseAbi(['function buyTicketsFor(address beneficiary, uint256 userFid, uint256 ticketCount) external']),
                functionName: 'buyTicketsFor',
                args: [wallet.address, BigInt(1), BigInt(decision.ticketCount)], // fid=1 for non-Farcaster (contract requires fid > 0)
              });
              await publicClient.waitForTransactionReceipt({ hash });

              // Update memory
              memory.totalRoundsPlayed++;
              memory.totalTicketsBought += decision.ticketCount;
              memory.totalSpent = (parseFloat(memory.totalSpent) + parseFloat(formatEther(totalCost))).toString();
              memory.lastRoundPlayed = lotteryState.roundId;
              memory.lastDecision = {
                roundId: lotteryState.roundId,
                action: 'buy',
                ticketCount: decision.ticketCount,
                reasoning: decision.reasoning,
              };
              await saveAgentMemory(agentId, memory);

              successfulPurchases.push({
                agentId,
                agentName: personality.name,
                ticketCount: decision.ticketCount,
                totalCost: formatEther(totalCost),
                txHash: hash,
                reasoning: decision.reasoning,
                confidence: decision.confidence,
              });

              console.log(`[LotteryAgent] ${personality.name} bought ${decision.ticketCount} tickets: ${decision.reasoning}`);
            } catch (txErr: any) {
              errors.push(`${personality.name}: Transaction failed - ${txErr.message?.slice(0, 50)}`);
            }
          } else {
            errors.push(`${personality.name}: Insufficient balance for ${decision.ticketCount} tickets`);
          }
        } else {
          // Update memory for skip
          memory.lastDecision = {
            roundId: lotteryState.roundId,
            action: 'skip',
            ticketCount: 0,
            reasoning: decision.reasoning,
          };
          await saveAgentMemory(agentId, memory);
          console.log(`[LotteryAgent] ${personality.name} skipped: ${decision.reasoning}`);
        }

        // Delay between agents
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (err: any) {
        const errorMsg = err?.message || String(err) || 'Unknown error';
        errors.push(`${personality.name}: ${errorMsg}`);
      }
    }

    // Send Discord notification
    if (successfulPurchases.length > 0) {
      const summary = successfulPurchases
        .map(p => `**${p.agentName}** (${p.confidence}% confident)\n└ Bought: ${p.ticketCount} ticket(s) for ${p.totalCost} WMON\n└ "${p.reasoning.slice(0, 100)}..."`)
        .join('\n\n');

      await notifyDiscord(
        `🎰 **Autonomous Lottery Decisions - Round #${lotteryState.roundId}**\n\n${summary}\n\n💰 Prize Pool: ${lotteryState.prizePool} WMON | 🎟️ Total Tickets: ${lotteryState.ticketCount + successfulPurchases.reduce((sum, p) => sum + p.ticketCount, 0)}`
      ).catch((err) => console.error('[LotteryAgent] Discord error:', err));
    }

    return NextResponse.json({
      success: true,
      roundId: lotteryState.roundId,
      lotteryState,
      decisions,
      successfulPurchases,
      errors: errors.length > 0 ? errors : undefined,
      message: `${successfulPurchases.length} agents bought tickets`,
    });

  } catch (err: any) {
    console.error('[LotteryAgent] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process lottery predictions' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/lottery/agents/predict
 *
 * Get current agent lottery statuses and memories
 */
export async function GET(req: NextRequest) {
  try {
    // Get current lottery state
    const [currentRound, ticketPrice] = await Promise.all([
      publicClient.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'getCurrentRound',
      }),
      publicClient.readContract({
        address: DAILY_LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'ticketPrice',
      }),
    ]);

    const [roundId, , , prizePool, ticketCount, timeRemaining] = currentRound;

    const agentStatuses = await Promise.all(
      Object.entries(AGENT_PERSONALITIES).map(async ([agentId, personality]) => {
        const wallet = AGENT_WALLETS[agentId];
        const memory = await getAgentMemory(agentId);

        let balance = '0';
        if (wallet.address && wallet.address.length > 10) {
          try {
            const bal = await publicClient.getBalance({ address: wallet.address });
            balance = formatEther(bal);
          } catch {
            balance = 'error';
          }
        }

        return {
          agentId,
          agentName: personality.name,
          agentAddress: wallet.address || null,
          personality: personality.personality,
          lotteryStyle: personality.lotteryStyle,
          balance,
          memory: {
            roundsPlayed: memory.totalRoundsPlayed,
            wins: memory.wins,
            losses: memory.losses,
            ticketsBought: memory.totalTicketsBought,
            spent: memory.totalSpent,
            won: memory.totalWon,
            netPnL: (parseFloat(memory.totalWon) - parseFloat(memory.totalSpent)).toFixed(4),
            loseStreak: memory.currentLoseStreak,
          },
          lastDecision: memory.lastDecision,
          playedThisRound: memory.lastRoundPlayed === Number(roundId),
        };
      })
    );

    return NextResponse.json({
      success: true,
      currentRound: {
        roundId: Number(roundId),
        prizePool: formatEther(prizePool),
        ticketCount: Number(ticketCount),
        ticketPrice: formatEther(ticketPrice),
        timeRemaining: Number(timeRemaining),
      },
      agents: agentStatuses,
    });

  } catch (err: any) {
    console.error('[LotteryAgent] GET Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to get agent statuses' },
      { status: 500 }
    );
  }
}
