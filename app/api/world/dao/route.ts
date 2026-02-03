import { NextRequest, NextResponse } from 'next/server';
import { Address } from 'viem';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { WorldRateLimits } from '@/lib/world/types';
import {
  createProposal,
  getProposal,
  getAllProposals,
  castVote,
  getProposalVoters,
  hasVoted,
  MIN_EMPTOURS_TO_PROPOSE,
} from '@/lib/world/dao';
import { getTokenHoldings, requireEmptoursHolder } from '@/lib/world/token-gate';
import { generateRewardTransferCall, recordRewardDistribution, TOURS_REWARDS } from '@/lib/world/rewards';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { formatEther } from 'viem';

/**
 * GET /api/world/dao
 * Get all proposals or a specific proposal
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(WorldRateLimits.read, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. Try again in ${rateLimit.resetIn}s.` },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const proposalId = searchParams.get('id');
    const voter = searchParams.get('voter');

    if (proposalId) {
      const proposal = await getProposal(proposalId);
      if (!proposal) {
        return NextResponse.json(
          { success: false, error: 'Proposal not found' },
          { status: 404 }
        );
      }

      const voters = await getProposalVoters(proposalId);
      const userHasVoted = voter ? await hasVoted(proposalId, voter) : false;

      return NextResponse.json({
        success: true,
        proposal,
        voters,
        userHasVoted,
      });
    }

    const proposals = await getAllProposals();
    return NextResponse.json({
      success: true,
      proposals,
      minEmptoursToPropose: formatEther(MIN_EMPTOURS_TO_PROPOSE),
    });
  } catch (err: any) {
    console.error('[DAO] GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch proposals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/world/dao
 * Create a proposal or cast a vote
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(WorldRateLimits.action, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. Try again in ${rateLimit.resetIn}s.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { action, userAddress } = body;

    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    // Verify EMPTOURS holdings
    const holdings = await getTokenHoldings(userAddress as Address);
    if (!holdings.emptours.isHolder) {
      return NextResponse.json({
        success: false,
        error: 'You need to hold EMPTOURS tokens to participate in governance. Buy at: https://nad.fun/tokens/0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777',
      }, { status: 403 });
    }

    if (action === 'create_proposal') {
      const { title, description, executionData } = body;

      if (!title || !description) {
        return NextResponse.json(
          { success: false, error: 'Title and description are required' },
          { status: 400 }
        );
      }

      // Check minimum EMPTOURS to create proposal
      if (holdings.emptours.balanceRaw < MIN_EMPTOURS_TO_PROPOSE) {
        return NextResponse.json({
          success: false,
          error: `You need at least ${formatEther(MIN_EMPTOURS_TO_PROPOSE)} EMPTOURS to create a proposal. Current balance: ${holdings.emptours.balance} EMPTOURS`,
        }, { status: 403 });
      }

      const proposal = await createProposal(
        userAddress as Address,
        title,
        description,
        executionData
      );

      return NextResponse.json({
        success: true,
        proposal,
        message: `Proposal created: ${title}`,
      });
    }

    if (action === 'vote') {
      const { proposalId, support } = body;

      if (!proposalId || typeof support !== 'boolean') {
        return NextResponse.json(
          { success: false, error: 'proposalId and support (true/false) are required' },
          { status: 400 }
        );
      }

      const result = await castVote(proposalId, userAddress as Address, support);

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      // Send TOURS reward for voting
      try {
        const rewardAmount = TOURS_REWARDS.dao_vote_proposal;
        const rewardCall = generateRewardTransferCall(userAddress as Address, rewardAmount);
        const txHash = await sendSafeTransaction([rewardCall]);
        await recordRewardDistribution(userAddress, 'dao_vote_proposal', rewardAmount, txHash);

        return NextResponse.json({
          success: true,
          weight: result.weight,
          reward: `${rewardAmount} TOURS`,
          txHash,
          message: `Vote recorded with weight ${result.weight}. Earned ${rewardAmount} TOURS!`,
        });
      } catch (rewardErr) {
        console.error('[DAO] Reward distribution failed:', rewardErr);
        // Vote succeeded even if reward failed
        return NextResponse.json({
          success: true,
          weight: result.weight,
          message: `Vote recorded with weight ${result.weight}.`,
        });
      }
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use "create_proposal" or "vote"' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[DAO] POST error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}
