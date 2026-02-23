import { createPublicClient, createWalletClient, http, parseAbi, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { activeChain } from '@/app/chains';

const TOURS_TOKEN = '0x45b76a127167fD7FC7Ed264ad490144300eCfcBF' as const;
const TOURS_DECIMALS = 18;

const TOURS_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

// Reward amounts in TOURS (raw numbers, will be multiplied by 10^18)
export const WEEKLY_REWARD = 100;

export const MILESTONE_BONUSES: Record<number, number> = {
  8: 500,
  20: 1000,
  36: 1500,
  52: 5000,
};

export function getRewardForWeek(week: number): number {
  let amount = WEEKLY_REWARD;
  if (MILESTONE_BONUSES[week]) {
    amount += MILESTONE_BONUSES[week];
  }
  return amount;
}

export function getTotalPossibleReward(): number {
  let total = 52 * WEEKLY_REWARD;
  for (const bonus of Object.values(MILESTONE_BONUSES)) {
    total += bonus;
  }
  return total; // 13,200 TOURS
}

// Transfer TOURS from deployer wallet to recipient
export async function transferTOURS(
  recipientAddress: string,
  amount: number
): Promise<string> {
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not configured');
  }

  const account = privateKeyToAccount(deployerKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: activeChain,
    transport: http(),
  });

  const amountWei = BigInt(amount) * BigInt(10 ** TOURS_DECIMALS);

  const hash = await walletClient.writeContract({
    address: TOURS_TOKEN,
    abi: TOURS_ABI,
    functionName: 'transfer',
    args: [recipientAddress as `0x${string}`, amountWei],
  });

  return hash;
}

// Check TOURS balance of an address
export async function getTOURSBalance(address: string): Promise<string> {
  const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: TOURS_TOKEN,
    abi: TOURS_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });

  return formatUnits(balance, TOURS_DECIMALS);
}
