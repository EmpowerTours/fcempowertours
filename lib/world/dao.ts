import { redis } from '@/lib/redis';
import { Address } from 'viem';
import { getGovernanceMultiplier } from './token-gate';
import { addEvent } from './state';

// ============================================================================
// CONSTANTS
// ============================================================================

const REDIS_KEYS = {
  proposal: (id: string) => `dao:proposal:${id}`,
  proposalSet: 'dao:proposals',
  vote: (proposalId: string, voter: string) => `dao:vote:${proposalId}:${voter.toLowerCase()}`,
  voterSet: (proposalId: string) => `dao:voters:${proposalId}`,
};

/** Proposal duration in milliseconds (7 days) */
export const PROPOSAL_DURATION = 7 * 24 * 60 * 60 * 1000;

/** Minimum EMPTOURS to create a proposal (in wei) */
export const MIN_EMPTOURS_TO_PROPOSE = BigInt(1000) * BigInt(10 ** 18); // 1000 EMPTOURS

// ============================================================================
// TYPES
// ============================================================================

export type ProposalStatus = 'active' | 'passed' | 'rejected' | 'executed' | 'expired';

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  createdAt: number;
  endsAt: number;
  status: ProposalStatus;
  votesFor: number;
  votesAgainst: number;
  voterCount: number;
  executionData?: {
    action: string;
    params: Record<string, any>;
  };
}

export interface Vote {
  proposalId: string;
  voter: string;
  support: boolean;
  weight: number;
  timestamp: number;
}

// ============================================================================
// PROPOSAL FUNCTIONS
// ============================================================================

/**
 * Create a new DAO proposal
 */
export async function createProposal(
  proposer: Address,
  title: string,
  description: string,
  executionData?: { action: string; params: Record<string, any> }
): Promise<Proposal> {
  const id = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const proposal: Proposal = {
    id,
    title,
    description,
    proposer,
    createdAt: now,
    endsAt: now + PROPOSAL_DURATION,
    status: 'active',
    votesFor: 0,
    votesAgainst: 0,
    voterCount: 0,
    executionData,
  };

  await redis.hset(REDIS_KEYS.proposal(id), proposal as unknown as Record<string, unknown>);
  await redis.sadd(REDIS_KEYS.proposalSet, id);

  // Log event
  await addEvent({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'action',
    agent: proposer,
    agentName: proposer.slice(0, 8) + '...',
    description: `Created proposal: ${title}`,
    timestamp: now,
  });

  return proposal;
}

/**
 * Get a proposal by ID
 */
export async function getProposal(id: string): Promise<Proposal | null> {
  const data = await redis.hgetall(REDIS_KEYS.proposal(id));
  if (!data || Object.keys(data).length === 0) return null;

  const proposal: Proposal = {
    id: String(data.id),
    title: String(data.title),
    description: String(data.description),
    proposer: String(data.proposer),
    createdAt: Number(data.createdAt),
    endsAt: Number(data.endsAt),
    status: String(data.status) as ProposalStatus,
    votesFor: Number(data.votesFor || 0),
    votesAgainst: Number(data.votesAgainst || 0),
    voterCount: Number(data.voterCount || 0),
  };

  if (data.executionData) {
    try {
      proposal.executionData = JSON.parse(String(data.executionData));
    } catch (e) {}
  }

  // Update status if expired
  if (proposal.status === 'active' && Date.now() > proposal.endsAt) {
    const newStatus: ProposalStatus =
      proposal.votesFor > proposal.votesAgainst ? 'passed' : 'rejected';
    proposal.status = newStatus;
    await redis.hset(REDIS_KEYS.proposal(id), { status: newStatus });
  }

  return proposal;
}

/**
 * Get all proposals
 */
export async function getAllProposals(): Promise<Proposal[]> {
  const ids = await redis.smembers(REDIS_KEYS.proposalSet);
  if (!ids || ids.length === 0) return [];

  const proposals: Proposal[] = [];
  for (const id of ids) {
    const proposal = await getProposal(id);
    if (proposal) proposals.push(proposal);
  }

  return proposals.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Cast a vote on a proposal
 */
export async function castVote(
  proposalId: string,
  voter: Address,
  support: boolean
): Promise<{ success: boolean; weight: number; error?: string }> {
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    return { success: false, weight: 0, error: 'Proposal not found' };
  }

  if (proposal.status !== 'active') {
    return { success: false, weight: 0, error: 'Proposal is not active' };
  }

  if (Date.now() > proposal.endsAt) {
    return { success: false, weight: 0, error: 'Voting period has ended' };
  }

  // Check if already voted
  const existingVote = await redis.exists(REDIS_KEYS.vote(proposalId, voter));
  if (existingVote) {
    return { success: false, weight: 0, error: 'You have already voted on this proposal' };
  }

  // Get voting weight based on EMPTOURS holdings
  const multiplier = await getGovernanceMultiplier(voter);
  const weight = Math.floor(multiplier * 100); // Base weight 100, multiplied by tier

  // Record vote
  const vote: Vote = {
    proposalId,
    voter,
    support,
    weight,
    timestamp: Date.now(),
  };

  await redis.set(REDIS_KEYS.vote(proposalId, voter), JSON.stringify(vote));
  await redis.sadd(REDIS_KEYS.voterSet(proposalId), voter.toLowerCase());

  // Update proposal vote counts
  if (support) {
    await redis.hincrby(REDIS_KEYS.proposal(proposalId), 'votesFor', weight);
  } else {
    await redis.hincrby(REDIS_KEYS.proposal(proposalId), 'votesAgainst', weight);
  }
  await redis.hincrby(REDIS_KEYS.proposal(proposalId), 'voterCount', 1);

  // Log event
  await addEvent({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'action',
    agent: voter,
    agentName: voter.slice(0, 8) + '...',
    description: `Voted ${support ? 'FOR' : 'AGAINST'} proposal: ${proposal.title}`,
    timestamp: Date.now(),
  });

  return { success: true, weight };
}

/**
 * Get voters for a proposal
 */
export async function getProposalVoters(proposalId: string): Promise<Vote[]> {
  const voters = await redis.smembers(REDIS_KEYS.voterSet(proposalId));
  if (!voters || voters.length === 0) return [];

  const votes: Vote[] = [];
  for (const voter of voters) {
    const voteData = await redis.get(REDIS_KEYS.vote(proposalId, voter));
    if (voteData) {
      votes.push(JSON.parse(voteData as string));
    }
  }

  return votes.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Check if user has voted on a proposal
 */
export async function hasVoted(proposalId: string, voter: string): Promise<boolean> {
  return (await redis.exists(REDIS_KEYS.vote(proposalId, voter))) === 1;
}
