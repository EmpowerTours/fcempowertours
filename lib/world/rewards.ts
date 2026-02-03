import { encodeFunctionData, parseEther, Address } from 'viem';
import { TOURS_TOKEN } from './types';
import { recordAgentAction, addEvent } from './state';

const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/** Reward amounts in TOURS for different actions */
export const TOURS_REWARDS = {
  mint_passport: '10',       // Mint a passport NFT
  buy_music: '5',            // Buy a music license
  buy_art: '5',              // Buy an art NFT
  radio_queue_song: '2',     // Queue a song on radio
  dao_vote_proposal: '3',    // Vote on a DAO proposal
  tip_artist: '1',           // Tip an artist
  lottery_win: '100',        // Win the lottery (bonus)
  first_action: '5',         // First action bonus
  daily_login: '1',          // Daily login bonus
} as const;

export type RewardAction = keyof typeof TOURS_REWARDS;

/**
 * Generate the calldata for sending TOURS rewards to a user
 */
export function generateRewardTransferCall(
  recipient: Address,
  amount: string
): { to: Address; value: bigint; data: `0x${string}` } {
  const amountWei = parseEther(amount);

  return {
    to: TOURS_TOKEN,
    value: 0n,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipient, amountWei],
    }),
  };
}

/**
 * Get the reward amount for a specific action
 */
export function getRewardAmount(action: string): string {
  const key = action as RewardAction;
  return TOURS_REWARDS[key] || '0';
}

/**
 * Record a reward distribution event
 */
export async function recordRewardDistribution(
  agentAddress: string,
  action: string,
  amount: string,
  txHash?: string
): Promise<void> {
  // Update agent's total earnings
  await recordAgentAction(agentAddress, amount);

  // Log event
  await addEvent({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'action',
    agent: agentAddress,
    agentName: agentAddress.slice(0, 8) + '...',
    description: `Earned ${amount} TOURS for ${action}`,
    txHash,
    timestamp: Date.now(),
  });
}

/**
 * Check if action is eligible for TOURS rewards
 */
export function isRewardableAction(action: string): boolean {
  return action in TOURS_REWARDS;
}
