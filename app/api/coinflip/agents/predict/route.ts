import { NextRequest, NextResponse } from 'next/server';
import { Address, parseEther } from 'viem';
import { getOrCreateCurrentRound, placeBet } from '@/lib/coinflip/state';
import { CoinflipPrediction, MIN_BET_AMOUNT, MAX_BET_AMOUNT } from '@/lib/coinflip/types';
import { notifyDiscord } from '@/lib/discord-notify';
import { getTokenHoldings } from '@/lib/world/token-gate';
import { addEvent, recordAgentAction } from '@/lib/world/state';

/**
 * Agent Personalities and their coinflip betting strategies
 * Each agent has a unique decision-making pattern
 */
const AGENT_PERSONALITIES = {
  chaos: {
    name: 'Chaos Agent',
    strategy: 'random', // Pure random
    riskLevel: 0.9, // High risk - bets more
    confidence: 0.5, // 50% confidence in prediction
  },
  conservative: {
    name: 'Conservative',
    strategy: 'follow_majority', // Bets with the crowd
    riskLevel: 0.2, // Low risk - bets minimum
    confidence: 0.3, // Often sits out
  },
  whale: {
    name: 'Whale Agent',
    strategy: 'big_move', // Makes large impactful bets
    riskLevel: 0.8, // High risk
    confidence: 0.7, // Usually bets
  },
  lucky: {
    name: 'Lucky Lucy',
    strategy: 'streak', // Follows winning streaks
    riskLevel: 0.6, // Medium-high risk
    confidence: 0.8, // Very active
  },
  analyst: {
    name: 'Analyst',
    strategy: 'contrarian_calculated', // Bets against majority when odds are good
    riskLevel: 0.4, // Medium risk
    confidence: 0.6, // Selective
  },
  martingale: {
    name: 'Martingale',
    strategy: 'double_down', // Doubles after losses
    riskLevel: 0.7, // High risk
    confidence: 0.9, // Almost always bets
  },
  pessimist: {
    name: 'Pessimist',
    strategy: 'tails_bias', // Slight tails preference (expects bad luck)
    riskLevel: 0.3, // Low risk
    confidence: 0.4, // Often sits out
  },
  contrarian: {
    name: 'Contrarian',
    strategy: 'against_majority', // Always bets opposite of majority
    riskLevel: 0.6, // Medium-high risk
    confidence: 0.75, // Usually bets
  },
};

// Agent wallet addresses - these should match your deployed agents
const AGENT_WALLETS: Record<string, Address> = {
  chaos: (process.env.CHAOS_AGENT_WALLET || '0x0000000000000000000000000000000000000001') as Address,
  conservative: (process.env.CONSERVATIVE_AGENT_WALLET || '0x0000000000000000000000000000000000000002') as Address,
  whale: (process.env.WHALE_AGENT_WALLET || '0x0000000000000000000000000000000000000003') as Address,
  lucky: (process.env.LUCKY_AGENT_WALLET || '0x0000000000000000000000000000000000000004') as Address,
  analyst: (process.env.ANALYST_AGENT_WALLET || '0x0000000000000000000000000000000000000005') as Address,
  martingale: (process.env.MARTINGALE_AGENT_WALLET || '0x0000000000000000000000000000000000000006') as Address,
  pessimist: (process.env.PESSIMIST_AGENT_WALLET || '0x0000000000000000000000000000000000000007') as Address,
  contrarian: (process.env.CONTRARIAN_AGENT_WALLET || '0x0000000000000000000000000000000000000008') as Address,
};

interface AgentPrediction {
  agentId: string;
  agentName: string;
  agentAddress: Address;
  prediction: CoinflipPrediction | null;
  amount: string;
  reasoning: string;
  willBet: boolean;
}

/**
 * Make a prediction based on agent personality
 */
function makeAgentPrediction(
  agentId: string,
  personality: typeof AGENT_PERSONALITIES[keyof typeof AGENT_PERSONALITIES],
  currentRound: any,
  balance: number
): AgentPrediction {
  const agentAddress = AGENT_WALLETS[agentId];
  const minBet = parseFloat(MIN_BET_AMOUNT);
  const maxBet = parseFloat(MAX_BET_AMOUNT);

  // Check if agent will bet based on confidence
  const willBet = Math.random() < personality.confidence && balance >= minBet;

  if (!willBet || balance < minBet) {
    return {
      agentId,
      agentName: personality.name,
      agentAddress,
      prediction: null,
      amount: '0',
      reasoning: balance < minBet ? 'Insufficient EMPTOURS balance' : 'Decided to sit this round out',
      willBet: false,
    };
  }

  // Calculate bet amount based on risk level
  const riskMultiplier = personality.riskLevel;
  const maxAffordable = Math.min(balance * 0.3, maxBet); // Max 30% of balance
  const betAmount = Math.max(minBet, Math.floor(minBet + (maxAffordable - minBet) * riskMultiplier));

  // Determine prediction based on strategy
  let prediction: CoinflipPrediction;
  let reasoning: string;

  const headsTotal = parseFloat(currentRound.totalHeads || '0');
  const tailsTotal = parseFloat(currentRound.totalTails || '0');
  const totalPool = headsTotal + tailsTotal;
  const headsPct = totalPool > 0 ? headsTotal / totalPool : 0.5;

  switch (personality.strategy) {
    case 'random':
      prediction = Math.random() > 0.5 ? 'heads' : 'tails';
      reasoning = 'Pure chaos - flipped a mental coin';
      break;

    case 'follow_majority':
      prediction = headsPct >= 0.5 ? 'heads' : 'tails';
      reasoning = `Following the crowd (${(headsPct * 100).toFixed(0)}% on heads)`;
      break;

    case 'big_move':
      // Whale likes to move markets - bet on underdog if pool is unbalanced
      prediction = headsPct < 0.4 ? 'heads' : headsPct > 0.6 ? 'tails' : (Math.random() > 0.5 ? 'heads' : 'tails');
      reasoning = 'Making a market-moving play';
      break;

    case 'streak':
      // Lucky Lucy follows recent results (would need history, using random with heads bias for now)
      prediction = Math.random() > 0.45 ? 'heads' : 'tails';
      reasoning = 'Feeling lucky today - riding the streak';
      break;

    case 'contrarian_calculated':
      // Analyst bets against majority only when odds are significantly skewed
      if (headsPct > 0.65) {
        prediction = 'tails';
        reasoning = `Calculated contrarian play - ${((1 - headsPct) * 100).toFixed(0)}% payout potential`;
      } else if (headsPct < 0.35) {
        prediction = 'heads';
        reasoning = `Calculated contrarian play - ${(headsPct * 100).toFixed(0)}% payout potential`;
      } else {
        prediction = Math.random() > 0.5 ? 'heads' : 'tails';
        reasoning = 'Odds balanced - using statistical model';
      }
      break;

    case 'double_down':
      // Martingale would double down after losses, for now slight tails bias
      prediction = Math.random() > 0.48 ? 'tails' : 'heads';
      reasoning = 'Doubling down on the system';
      break;

    case 'tails_bias':
      prediction = Math.random() > 0.35 ? 'tails' : 'heads';
      reasoning = 'Expecting the worst... betting tails';
      break;

    case 'against_majority':
      prediction = headsPct >= 0.5 ? 'tails' : 'heads';
      reasoning = `Going against the ${headsPct >= 0.5 ? 'heads' : 'tails'} crowd`;
      break;

    default:
      prediction = Math.random() > 0.5 ? 'heads' : 'tails';
      reasoning = 'Default random selection';
  }

  return {
    agentId,
    agentName: personality.name,
    agentAddress,
    prediction,
    amount: betAmount.toString(),
    reasoning,
    willBet: true,
  };
}

/**
 * POST /api/coinflip/agents/predict
 *
 * Trigger all agents to make their coinflip predictions
 * Called by cron service at the start of each round
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

    // Get current round
    const round = await getOrCreateCurrentRound();

    if (round.status !== 'open') {
      return NextResponse.json(
        { success: false, error: 'Round is not open for betting' },
        { status: 400 }
      );
    }

    // Check time remaining (don't bet in last 2 minutes)
    const timeRemaining = round.closesAt - Date.now();
    if (timeRemaining < 2 * 60 * 1000) {
      return NextResponse.json(
        { success: false, error: 'Too close to round end' },
        { status: 400 }
      );
    }

    const predictions: AgentPrediction[] = [];
    const successfulBets: any[] = [];
    const errors: string[] = [];

    // Process each agent
    for (const [agentId, personality] of Object.entries(AGENT_PERSONALITIES)) {
      const agentAddress = AGENT_WALLETS[agentId];

      // Skip if no wallet configured
      if (!agentAddress || agentAddress === '0x0000000000000000000000000000000000000001') {
        continue;
      }

      try {
        // Check if already bet this round
        const existingBet = round.bets?.find(
          (b: any) => b.agentAddress.toLowerCase() === agentAddress.toLowerCase()
        );

        if (existingBet) {
          predictions.push({
            agentId,
            agentName: personality.name,
            agentAddress,
            prediction: existingBet.prediction,
            amount: existingBet.amount,
            reasoning: 'Already bet this round',
            willBet: false,
          });
          continue;
        }

        // Get agent's EMPTOURS balance
        const holdings = await getTokenHoldings(agentAddress);
        const balance = parseFloat(holdings.emptours.balance);

        // Make prediction
        const prediction = makeAgentPrediction(agentId, personality, round, balance);
        predictions.push(prediction);

        // Place bet if agent decided to bet
        if (prediction.willBet && prediction.prediction) {
          const betResult = await placeBet(
            agentAddress,
            personality.name,
            prediction.prediction,
            prediction.amount
          );

          if (betResult.success) {
            successfulBets.push({
              agentId,
              agentName: personality.name,
              prediction: prediction.prediction,
              amount: prediction.amount,
              reasoning: prediction.reasoning,
            });

            // Record world event
            await addEvent({
              id: `evt_${Date.now()}_${agentId}`,
              type: 'action',
              agent: agentAddress,
              agentName: personality.name,
              description: `AI Prediction: ${prediction.prediction.toUpperCase()} (${prediction.amount} EMPTOURS) - ${prediction.reasoning}`,
              timestamp: Date.now(),
            }).catch(() => {});

            await recordAgentAction(agentAddress, '0').catch(() => {});
          } else {
            errors.push(`${personality.name}: ${betResult.error}`);
          }
        }
      } catch (err: any) {
        errors.push(`${personality.name}: ${err.message}`);
      }
    }

    // Discord notification summary
    if (successfulBets.length > 0) {
      const summary = successfulBets
        .map((b) => `• **${b.agentName}**: ${b.amount} EMPTOURS on ${b.prediction.toUpperCase()} - *${b.reasoning}*`)
        .join('\n');

      await notifyDiscord(
        `🤖 **Agent Predictions for Round #${round.id}**\n\n${summary}\n\n⏰ Betting closes in ${Math.floor((round.closesAt - Date.now()) / 60000)} minutes`
      ).catch((err) => console.error('[AgentPredict] Discord error:', err));
    }

    console.log(`[AgentPredict] ${successfulBets.length} agents placed bets, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      roundId: round.id,
      predictions,
      successfulBets,
      errors: errors.length > 0 ? errors : undefined,
      message: `${successfulBets.length} agents placed predictions`,
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
 * GET /api/coinflip/agents/predict
 *
 * Get current agent prediction statuses
 */
export async function GET(req: NextRequest) {
  try {
    const round = await getOrCreateCurrentRound();

    const agentStatuses = Object.entries(AGENT_PERSONALITIES).map(([agentId, personality]) => {
      const agentAddress = AGENT_WALLETS[agentId];
      const existingBet = round.bets?.find(
        (b: any) => b.agentAddress.toLowerCase() === agentAddress?.toLowerCase()
      );

      return {
        agentId,
        agentName: personality.name,
        agentAddress,
        strategy: personality.strategy,
        hasBet: !!existingBet,
        bet: existingBet || null,
      };
    });

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
