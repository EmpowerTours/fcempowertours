import { NextRequest, NextResponse } from 'next/server';
import { Address, parseEther } from 'viem';
import Anthropic from '@anthropic-ai/sdk';
import { getOrCreateCurrentRound, placeBet, getRoundHistory } from '@/lib/coinflip/state';
import { CoinflipPrediction, MIN_BET_AMOUNT, MAX_BET_AMOUNT } from '@/lib/coinflip/types';
import { notifyDiscord } from '@/lib/discord-notify';
import { getTokenHoldings } from '@/lib/world/token-gate';
import { addEvent, recordAgentAction } from '@/lib/world/state';
import { redis } from '@/lib/redis';

/**
 * AUTONOMOUS AGENT COINFLIP PREDICTIONS
 *
 * Each agent uses LLM-based reasoning to make genuine autonomous decisions.
 * Agents have persistent memory, learn from outcomes, and provide reasoning.
 */

const llmClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Agent personality profiles - used as context for LLM reasoning
const AGENT_PERSONALITIES: Record<string, {
  name: string;
  personality: string;
  riskProfile: string;
  decisionStyle: string;
}> = {
  chaos: {
    name: 'Chaos Agent',
    personality: 'Chaotic, unpredictable, embraces randomness and entropy. Finds beauty in disorder.',
    riskProfile: 'Extreme risk-taker. Will make bold, unexpected moves.',
    decisionStyle: 'Intuitive, gut-feeling based, deliberately unpredictable.',
  },
  conservative: {
    name: 'Conservative',
    personality: 'Cautious, methodical, prefers safety over gains. Risk-averse.',
    riskProfile: 'Very low risk. Prefers small bets or sitting out uncertain rounds.',
    decisionStyle: 'Analytical, waits for clear signals, protects capital.',
  },
  whale: {
    name: 'Whale Agent',
    personality: 'Confident, market-moving, makes impactful decisions. Likes to dominate.',
    riskProfile: 'High risk, high reward. Makes large bets to influence outcomes.',
    decisionStyle: 'Strategic, considers market impact, bold execution.',
  },
  lucky: {
    name: 'Lucky Lucy',
    personality: 'Optimistic, believes in luck and streaks. Superstitious.',
    riskProfile: 'Medium-high risk. Follows hot streaks and lucky feelings.',
    decisionStyle: 'Intuitive, pattern-seeking, emotionally driven.',
  },
  analyst: {
    name: 'Analyst',
    personality: 'Data-driven, logical, calculates expected value. Skeptical of luck.',
    riskProfile: 'Calculated risk. Only bets when odds are favorable.',
    decisionStyle: 'Statistical, probability-based, emotionless.',
  },
  martingale: {
    name: 'Martingale',
    personality: 'Systematic, believes in eventual reversion. Doubles down on losses.',
    riskProfile: 'Progressive risk. Increases bets after losses.',
    decisionStyle: 'System-based, disciplined to the strategy despite losses.',
  },
  pessimist: {
    name: 'Pessimist',
    personality: 'Expects the worst, hedges bets, prepares for bad outcomes.',
    riskProfile: 'Low risk. Often sits out, expects to lose.',
    decisionStyle: 'Defensive, contrarian when others are too optimistic.',
  },
  contrarian: {
    name: 'Contrarian',
    personality: 'Goes against the crowd, believes majority is usually wrong.',
    riskProfile: 'Medium-high risk. Bets opposite of popular opinion.',
    decisionStyle: 'Anti-consensus, independent thinker, comfortable being alone.',
  },
};

// Agent wallet addresses
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

interface AgentMemory {
  totalBets: number;
  wins: number;
  losses: number;
  totalWagered: string;
  totalWon: string;
  totalLost: string;
  lastOutcomes: Array<{ roundId: string; prediction: string; result: string; won: boolean; amount: string }>;
  currentStreak: number; // positive = wins, negative = losses
  lastDecision?: {
    roundId: string;
    reasoning: string;
    prediction: string;
    amount: string;
  };
}

interface AgentDecision {
  action: 'bet' | 'skip';
  prediction?: CoinflipPrediction;
  amount?: string;
  reasoning: string;
  confidence: number; // 0-100
}

/**
 * Get or initialize agent's persistent memory
 */
async function getAgentMemory(agentId: string): Promise<AgentMemory> {
  const key = `agent:${agentId}:coinflip:memory`;
  const data = await redis.get(key);

  if (data) {
    return JSON.parse(data as string);
  }

  return {
    totalBets: 0,
    wins: 0,
    losses: 0,
    totalWagered: '0',
    totalWon: '0',
    totalLost: '0',
    lastOutcomes: [],
    currentStreak: 0,
  };
}

/**
 * Save agent's memory after decision/outcome
 */
async function saveAgentMemory(agentId: string, memory: AgentMemory): Promise<void> {
  const key = `agent:${agentId}:coinflip:memory`;
  await redis.set(key, JSON.stringify(memory));
}

/**
 * Use Claude to make an autonomous decision for the agent
 */
async function makeAutonomousDecision(
  agentId: string,
  personality: typeof AGENT_PERSONALITIES[string],
  memory: AgentMemory,
  currentRound: any,
  balance: number,
  recentResults: any[]
): Promise<AgentDecision> {
  const minBet = parseFloat(MIN_BET_AMOUNT);
  const maxBet = Math.min(parseFloat(MAX_BET_AMOUNT), balance * 0.3);

  // Build context for Claude
  const headsTotal = parseFloat(currentRound.totalHeads || '0');
  const tailsTotal = parseFloat(currentRound.totalTails || '0');
  const totalPool = headsTotal + tailsTotal;
  const headsPct = totalPool > 0 ? ((headsTotal / totalPool) * 100).toFixed(1) : '50.0';
  const tailsPct = totalPool > 0 ? ((tailsTotal / totalPool) * 100).toFixed(1) : '50.0';

  const winRate = memory.totalBets > 0 ? ((memory.wins / memory.totalBets) * 100).toFixed(1) : 'N/A';
  const recentOutcomesText = memory.lastOutcomes.slice(-5).map(o =>
    `Round ${o.roundId}: bet ${o.prediction}, result was ${o.result} (${o.won ? 'WON' : 'LOST'} ${o.amount} EMPTOURS)`
  ).join('\n') || 'No previous bets';

  const recentFlipResults = recentResults.slice(0, 5).map(r => r.result).join(', ') || 'No history';

  const prompt = `You are ${personality.name}, an autonomous AI agent participating in a coinflip betting game.

YOUR PERSONALITY:
${personality.personality}

YOUR RISK PROFILE:
${personality.riskProfile}

YOUR DECISION STYLE:
${personality.decisionStyle}

YOUR CURRENT STATE:
- EMPTOURS Balance: ${balance.toFixed(2)}
- Lifetime Record: ${memory.wins} wins, ${memory.losses} losses (${winRate}% win rate)
- Current Streak: ${memory.currentStreak > 0 ? `${memory.currentStreak} wins` : memory.currentStreak < 0 ? `${Math.abs(memory.currentStreak)} losses` : 'neutral'}
- Total Wagered: ${memory.totalWagered} EMPTOURS
- Net P&L: ${(parseFloat(memory.totalWon) - parseFloat(memory.totalLost)).toFixed(2)} EMPTOURS

YOUR RECENT OUTCOMES:
${recentOutcomesText}

CURRENT ROUND STATUS:
- Round ID: ${currentRound.id}
- Current Pool: ${totalPool.toFixed(2)} EMPTOURS
- Heads Bets: ${headsTotal.toFixed(2)} EMPTOURS (${headsPct}%)
- Tails Bets: ${tailsTotal.toFixed(2)} EMPTOURS (${tailsPct}%)
- Number of Bettors: ${currentRound.bets?.length || 0}

RECENT FLIP RESULTS (newest first):
${recentFlipResults}

BETTING CONSTRAINTS:
- Minimum bet: ${minBet} EMPTOURS
- Maximum bet: ${maxBet.toFixed(2)} EMPTOURS (30% of your balance or max limit)
- You can choose to skip this round if you prefer

IMPORTANT: You are making a REAL decision with REAL tokens. Think carefully about your personality, your current situation, and whether this is a good opportunity for you.

Make your decision and explain your reasoning. Your response must be valid JSON:

{
  "action": "bet" or "skip",
  "prediction": "heads" or "tails" (only if action is "bet"),
  "amount": "number as string" (only if action is "bet", between ${minBet} and ${maxBet.toFixed(0)}),
  "reasoning": "Your thought process explaining WHY you made this decision, considering your personality and current state",
  "confidence": number between 0-100 representing how confident you are
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const decision = JSON.parse(jsonMatch[0]) as AgentDecision;

    // Validate decision
    if (decision.action === 'bet') {
      if (!decision.prediction || !['heads', 'tails'].includes(decision.prediction)) {
        decision.prediction = 'heads';
      }
      if (!decision.amount || parseFloat(decision.amount) < minBet) {
        decision.amount = minBet.toString();
      }
      if (parseFloat(decision.amount) > maxBet) {
        decision.amount = maxBet.toFixed(0);
      }
    }

    return decision;
  } catch (err: any) {
    console.error(`[AgentPredict] Claude error for ${agentId}:`, err.message);

    // Fallback to skip if Claude fails
    return {
      action: 'skip',
      reasoning: `Decision system error: ${err.message}. Sitting out this round for safety.`,
      confidence: 0,
    };
  }
}

/**
 * POST /api/coinflip/agents/predict
 *
 * Trigger all agents to make autonomous coinflip predictions using Claude AI
 */
export async function POST(req: NextRequest) {
  try {
    // Verify admin key
    const adminKey = req.headers.get('x-admin-key');
    const expectedKey = process.env.KEEPER_SECRET || process.env.COINFLIP_SECRET;

    if (!adminKey || adminKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if Claude API is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Get current round
    const round = await getOrCreateCurrentRound();

    if (round.status !== 'open') {
      return NextResponse.json(
        { success: false, error: 'Round is not open for betting' },
        { status: 400 }
      );
    }

    // Get recent results for context
    const recentRounds = await getRoundHistory(10);

    const decisions: any[] = [];
    const successfulBets: any[] = [];
    const errors: string[] = [];

    // Process each agent sequentially (to avoid rate limits)
    for (const [agentId, personality] of Object.entries(AGENT_PERSONALITIES)) {
      const agentAddress = AGENT_WALLETS[agentId];

      // Skip if no wallet configured
      if (!agentAddress || agentAddress.length < 10) {
        continue;
      }

      try {
        // Check if already bet this round
        const existingBet = round.bets?.find(
          (b: any) => b.agentAddress.toLowerCase() === agentAddress.toLowerCase()
        );

        if (existingBet) {
          decisions.push({
            agentId,
            agentName: personality.name,
            action: 'already_bet',
            prediction: existingBet.prediction,
            amount: existingBet.amount,
            reasoning: 'Already placed a bet this round',
          });
          continue;
        }

        // Get agent's EMPTOURS balance
        const holdings = await getTokenHoldings(agentAddress);
        const balance = parseFloat(holdings.emptours.balance);

        if (balance < parseFloat(MIN_BET_AMOUNT)) {
          decisions.push({
            agentId,
            agentName: personality.name,
            action: 'skip',
            reasoning: `Insufficient balance: ${balance.toFixed(2)} EMPTOURS (need ${MIN_BET_AMOUNT})`,
          });
          continue;
        }

        // Get agent's memory
        const memory = await getAgentMemory(agentId);

        // Make autonomous decision using Claude
        console.log(`[AgentPredict] ${personality.name} is thinking...`);
        const decision = await makeAutonomousDecision(
          agentId,
          personality,
          memory,
          round,
          balance,
          recentRounds
        );

        decisions.push({
          agentId,
          agentName: personality.name,
          agentAddress,
          ...decision,
        });

        // Place bet if agent decided to bet
        if (decision.action === 'bet' && decision.prediction && decision.amount) {
          const betResult = await placeBet(
            agentAddress,
            personality.name,
            decision.prediction,
            decision.amount
          );

          if (betResult.success) {
            // Update memory with this decision
            memory.lastDecision = {
              roundId: round.id,
              reasoning: decision.reasoning,
              prediction: decision.prediction,
              amount: decision.amount,
            };
            await saveAgentMemory(agentId, memory);

            successfulBets.push({
              agentId,
              agentName: personality.name,
              prediction: decision.prediction,
              amount: decision.amount,
              reasoning: decision.reasoning,
              confidence: decision.confidence,
            });

            // Record world event with full reasoning
            await addEvent({
              id: `evt_${Date.now()}_${agentId}`,
              type: 'action',
              agent: agentAddress,
              agentName: personality.name,
              description: `🤖 AUTONOMOUS DECISION: ${decision.prediction.toUpperCase()} (${decision.amount} EMPTOURS)\n💭 Reasoning: ${decision.reasoning}`,
              timestamp: Date.now(),
            }).catch(() => {});

            await recordAgentAction(agentAddress, '0').catch(() => {});

            console.log(`[AgentPredict] ${personality.name} bet ${decision.amount} on ${decision.prediction}`);
            console.log(`[AgentPredict] Reasoning: ${decision.reasoning}`);
          } else {
            errors.push(`${personality.name}: ${betResult.error}`);
          }
        } else {
          console.log(`[AgentPredict] ${personality.name} decided to skip: ${decision.reasoning}`);
        }

        // Small delay between agents to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err: any) {
        errors.push(`${personality.name}: ${err.message}`);
      }
    }

    // Discord notification with reasoning
    if (successfulBets.length > 0) {
      const summary = successfulBets
        .map((b) =>
          `**${b.agentName}** (${b.confidence}% confident)\n` +
          `└ Bet: ${b.amount} EMPTOURS on ${b.prediction.toUpperCase()}\n` +
          `└ 💭 *"${b.reasoning.slice(0, 150)}${b.reasoning.length > 150 ? '...' : ''}"*`
        )
        .join('\n\n');

      await notifyDiscord(
        `🤖 **Autonomous Agent Predictions - Round #${round.id}**\n\n${summary}\n\n⏰ Betting closes in ${Math.floor((round.closesAt - Date.now()) / 60000)} minutes`
      ).catch((err) => console.error('[AgentPredict] Discord error:', err));
    }

    console.log(`[AgentPredict] ${successfulBets.length} agents placed bets, ${decisions.filter(d => d.action === 'skip').length} skipped`);

    return NextResponse.json({
      success: true,
      roundId: round.id,
      decisions,
      successfulBets,
      errors: errors.length > 0 ? errors : undefined,
      message: `${successfulBets.length} agents made autonomous decisions`,
    });

  } catch (err: any) {
    console.error('[AgentPredict] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process agent predictions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coinflip/agents/predict/learn
 *
 * Called after round resolves to update agent memories with outcomes
 */
export async function PUT(req: NextRequest) {
  try {
    const { roundId, result } = await req.json();

    if (!roundId || !result) {
      return NextResponse.json(
        { success: false, error: 'Missing roundId or result' },
        { status: 400 }
      );
    }

    const updates: any[] = [];

    for (const [agentId, personality] of Object.entries(AGENT_PERSONALITIES)) {
      const memory = await getAgentMemory(agentId);

      // Check if agent bet on this round
      if (memory.lastDecision?.roundId === roundId) {
        const won = memory.lastDecision.prediction === result;
        const amount = memory.lastDecision.amount;

        // Update memory
        memory.totalBets++;
        if (won) {
          memory.wins++;
          memory.totalWon = (parseFloat(memory.totalWon) + parseFloat(amount)).toString();
          memory.currentStreak = memory.currentStreak >= 0 ? memory.currentStreak + 1 : 1;
        } else {
          memory.losses++;
          memory.totalLost = (parseFloat(memory.totalLost) + parseFloat(amount)).toString();
          memory.currentStreak = memory.currentStreak <= 0 ? memory.currentStreak - 1 : -1;
        }

        memory.totalWagered = (parseFloat(memory.totalWagered) + parseFloat(amount)).toString();

        // Add to outcomes history (keep last 20)
        memory.lastOutcomes.push({
          roundId,
          prediction: memory.lastDecision.prediction,
          result,
          won,
          amount,
        });
        if (memory.lastOutcomes.length > 20) {
          memory.lastOutcomes = memory.lastOutcomes.slice(-20);
        }

        await saveAgentMemory(agentId, memory);

        updates.push({
          agentId,
          agentName: personality.name,
          prediction: memory.lastDecision.prediction,
          result,
          won,
          newRecord: `${memory.wins}W-${memory.losses}L`,
          streak: memory.currentStreak,
        });
      }
    }

    return NextResponse.json({
      success: true,
      roundId,
      result,
      agentUpdates: updates,
    });

  } catch (err: any) {
    console.error('[AgentPredict] Learn error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update agent memories' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/coinflip/agents/predict
 *
 * Get current agent statuses and memories
 */
export async function GET(req: NextRequest) {
  try {
    const round = await getOrCreateCurrentRound();

    const agentStatuses = await Promise.all(
      Object.entries(AGENT_PERSONALITIES).map(async ([agentId, personality]) => {
        const agentAddress = AGENT_WALLETS[agentId];
        const memory = await getAgentMemory(agentId);
        const existingBet = round.bets?.find(
          (b: any) => b.agentAddress?.toLowerCase() === agentAddress?.toLowerCase()
        );

        return {
          agentId,
          agentName: personality.name,
          agentAddress: agentAddress || null,
          personality: personality.personality,
          decisionStyle: personality.decisionStyle,
          hasBet: !!existingBet,
          currentBet: existingBet || null,
          memory: {
            totalBets: memory.totalBets,
            wins: memory.wins,
            losses: memory.losses,
            winRate: memory.totalBets > 0 ? ((memory.wins / memory.totalBets) * 100).toFixed(1) + '%' : 'N/A',
            currentStreak: memory.currentStreak,
            netPnL: (parseFloat(memory.totalWon) - parseFloat(memory.totalLost)).toFixed(2),
          },
          lastDecision: memory.lastDecision || null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      roundId: round.id,
      roundStatus: round.status,
      agents: agentStatuses,
    });

  } catch (err: any) {
    console.error('[AgentPredict] GET Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to get agent statuses' },
      { status: 500 }
    );
  }
}
