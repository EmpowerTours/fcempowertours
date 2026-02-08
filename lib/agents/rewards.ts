import { JsonRpcProvider, Wallet, Contract, formatEther, parseEther } from 'ethers';

/**
 * AGENT TOURS REWARDS
 *
 * Distributes TOURS tokens to agents via the ToursRewardManager contract.
 * This ensures proper tracking, daily caps, and halving schedule.
 *
 * The deployer wallet must be an authorized distributor on ToursRewardManager.
 */

const TOURS_REWARD_MANAGER = process.env.NEXT_PUBLIC_TOURS_REWARD_MANAGER || '0x7fff35BB27307806B92Fb1D1FBe52D168093eF87';
const TOURS_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN!;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// ToursRewardManager ABI (minimal - just what we need)
const REWARD_MANAGER_ABI = [
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'rewardType', type: 'uint8' },
    ],
    name: 'distributeReward',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'rewardType', type: 'uint8' },
      { name: 'multiplierBps', type: 'uint256' },
    ],
    name: 'distributeRewardWithMultiplier',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'rewardType', type: 'uint8' }],
    name: 'getCurrentReward',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getRewardPoolBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'authorizedDistributors',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// ERC20 ABI for fallback direct transfer
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * RewardType enum from ToursRewardManager contract
 * Must match the contract's enum order
 */
export enum RewardType {
  LISTEN = 0,
  VOICE_NOTE = 1,
  FIRST_LISTEN = 2,
  STREAK_7 = 3,
  ITINERARY_COMPLETE = 4,
  TOUR_GUIDE_COMPLETE = 5,
  QUEST = 6,              // Generic quest/activity - use for agent rewards
  ARTIST_MONTHLY = 7,
  CLIMB_JOURNAL = 8,
}

/** Map agent actions to RewardType */
export const AGENT_ACTION_TO_REWARD_TYPE: Record<string, RewardType> = {
  music_creation: RewardType.QUEST,
  music_appreciation: RewardType.QUEST,
  lottery_win: RewardType.QUEST,
  lottery_participate: RewardType.QUEST,
  coinflip_win: RewardType.QUEST,
  coinflip_participate: RewardType.QUEST,
  breeding: RewardType.QUEST,
};

/** Multipliers for different agent actions (in basis points, 10000 = 1x) */
export const AGENT_ACTION_MULTIPLIERS: Record<string, number> = {
  music_creation: 10000,       // 1x base QUEST reward (5 TOURS)
  music_appreciation: 2000,    // 0.2x (1 TOURS)
  lottery_win: 100000,         // 10x (50 TOURS)
  lottery_participate: 2000,   // 0.2x (1 TOURS)
  coinflip_win: 20000,         // 2x (10 TOURS)
  coinflip_participate: 1000,  // 0.1x (0.5 TOURS)
  breeding: 40000,             // 4x (20 TOURS)
};

export type AgentRewardAction = keyof typeof AGENT_ACTION_MULTIPLIERS;

/**
 * Get the reward pool balance in ToursRewardManager
 */
export async function getRewardPoolBalance(): Promise<string> {
  try {
    const provider = new JsonRpcProvider(MONAD_RPC);
    const rewardManager = new Contract(TOURS_REWARD_MANAGER, REWARD_MANAGER_ABI, provider);
    const balance = await rewardManager.getRewardPoolBalance();
    return formatEther(balance);
  } catch (err) {
    console.error('[AgentRewards] Failed to get pool balance:', err);
    return '0';
  }
}

/**
 * Check if deployer is an authorized distributor
 */
export async function isAuthorizedDistributor(): Promise<boolean> {
  if (!DEPLOYER_PRIVATE_KEY) return false;

  try {
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const rewardManager = new Contract(TOURS_REWARD_MANAGER, REWARD_MANAGER_ABI, provider);
    return await rewardManager.authorizedDistributors(deployer.address);
  } catch (err) {
    console.error('[AgentRewards] Failed to check authorization:', err);
    return false;
  }
}

/**
 * Distribute TOURS reward to an agent via ToursRewardManager
 *
 * @param recipientAddress - The agent's wallet address
 * @param action - The agent action being rewarded
 * @param reason - The reason for the reward (for logging)
 * @returns Transaction hash and amount distributed
 */
export async function sendAgentToursReward(
  recipientAddress: string,
  action: AgentRewardAction,
  reason: string
): Promise<{ success: boolean; txHash?: string; amount?: string; error?: string }> {
  if (!DEPLOYER_PRIVATE_KEY) {
    console.error('[AgentRewards] DEPLOYER_PRIVATE_KEY not configured');
    return { success: false, error: 'Deployer key not configured' };
  }

  try {
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const rewardManager = new Contract(TOURS_REWARD_MANAGER, REWARD_MANAGER_ABI, deployer);

    const rewardType = AGENT_ACTION_TO_REWARD_TYPE[action] ?? RewardType.QUEST;
    const multiplierBps = AGENT_ACTION_MULTIPLIERS[action] ?? 10000;

    console.log(`[AgentRewards] Distributing reward to ${recipientAddress} for: ${reason}`);
    console.log(`[AgentRewards] RewardType: ${rewardType}, Multiplier: ${multiplierBps / 100}%`);

    // Use distributeRewardWithMultiplier for variable amounts
    const tx = await rewardManager.distributeRewardWithMultiplier(
      recipientAddress,
      rewardType,
      multiplierBps
    );
    console.log(`[AgentRewards] TX sent: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      throw new Error('Transaction failed');
    }

    // Parse the RewardDistributed event to get actual amount
    let amount = '0';
    for (const log of receipt.logs) {
      try {
        // Event signature: RewardDistributed(address indexed recipient, RewardType indexed rewardType, uint256 amount)
        if (log.topics[0] === '0x...') { // Would need actual event signature
          // Parse amount from log data
        }
      } catch {
        // Not our event
      }
    }

    // Estimate amount based on base rate and multiplier
    const baseReward = await rewardManager.getCurrentReward(rewardType);
    amount = formatEther((BigInt(baseReward) * BigInt(multiplierBps)) / BigInt(10000));

    console.log(`[AgentRewards] Successfully distributed ~${amount} TOURS to ${recipientAddress}`);

    return { success: true, txHash: tx.hash, amount };
  } catch (err: any) {
    console.error(`[AgentRewards] Failed to distribute reward:`, err);

    // Check if it's an authorization error
    if (err.message?.includes('Not authorized')) {
      console.error('[AgentRewards] Deployer is not an authorized distributor on ToursRewardManager');
      console.error('[AgentRewards] Call setDistributor(deployerAddress, true) on the contract');

      // Fallback to direct transfer from deployer's TOURS balance
      console.log('[AgentRewards] Attempting fallback direct transfer...');
      return sendDirectTransfer(recipientAddress, action, reason);
    }

    return {
      success: false,
      error: err.message || 'Distribution failed'
    };
  }
}

/**
 * Fallback: Direct transfer from deployer's TOURS balance
 * Used when deployer is not authorized on ToursRewardManager
 */
async function sendDirectTransfer(
  recipientAddress: string,
  action: AgentRewardAction,
  reason: string
): Promise<{ success: boolean; txHash?: string; amount?: string; error?: string }> {
  if (!DEPLOYER_PRIVATE_KEY || !TOURS_TOKEN_ADDRESS) {
    return { success: false, error: 'Not configured for fallback' };
  }

  try {
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const toursToken = new Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, deployer);

    // Calculate amount based on multiplier (base QUEST = 5 TOURS)
    const baseAmount = 5;
    const multiplierBps = AGENT_ACTION_MULTIPLIERS[action] ?? 10000;
    const amount = (baseAmount * multiplierBps / 10000).toString();
    const amountWei = parseEther(amount);

    // Check balance
    const balance = await toursToken.balanceOf(deployer.address);
    if (BigInt(balance) < amountWei) {
      return {
        success: false,
        error: `Insufficient TOURS balance: ${formatEther(balance)} available, need ${amount}`
      };
    }

    console.log(`[AgentRewards] Fallback: Sending ${amount} TOURS directly to ${recipientAddress}`);

    const tx = await toursToken.transfer(recipientAddress, amountWei);
    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Transfer failed');
    }

    console.log(`[AgentRewards] Fallback successful: ${tx.hash}`);
    return { success: true, txHash: tx.hash, amount };
  } catch (err: any) {
    console.error('[AgentRewards] Fallback transfer failed:', err);
    return { success: false, error: err.message || 'Fallback failed' };
  }
}

/**
 * Send reward for a specific agent action
 */
export async function rewardAgentAction(
  recipientAddress: string,
  action: AgentRewardAction,
  reason?: string
): Promise<{ success: boolean; txHash?: string; amount?: string; error?: string }> {
  return sendAgentToursReward(recipientAddress, action, reason || action);
}

/**
 * Check if an agent address is valid
 */
export function isValidAgentAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
