import { createPublicClient, http, Address, formatEther } from 'viem';
import { monadMainnet } from '@/app/chains';
import { EMPTOURS_TOKEN, TOURS_TOKEN } from './types';

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const client = createPublicClient({
  chain: monadMainnet,
  transport: http(),
});

export interface TokenHolding {
  emptours: {
    balance: string;
    balanceRaw: bigint;
    isHolder: boolean;
  };
  tours: {
    balance: string;
    balanceRaw: bigint;
  };
}

/** Minimum EMPTOURS required to interact with the agent (0 = just need to hold any) */
export const MIN_EMPTOURS_TO_INTERACT = 0n; // Any non-zero balance

/** EMPTOURS required for premium features */
export const PREMIUM_EMPTOURS_THRESHOLD = BigInt(1000) * BigInt(10 ** 18); // 1000 EMPTOURS

/** EMPTOURS required for governance weight multiplier */
export const GOVERNANCE_EMPTOURS_TIERS = [
  { threshold: BigInt(10000) * BigInt(10 ** 18), multiplier: 3 },   // 10k+ = 3x voting weight
  { threshold: BigInt(5000) * BigInt(10 ** 18), multiplier: 2 },    // 5k+ = 2x voting weight
  { threshold: BigInt(1000) * BigInt(10 ** 18), multiplier: 1.5 },  // 1k+ = 1.5x voting weight
  { threshold: 0n, multiplier: 1 },                                   // Any holder = 1x
];

/**
 * Get token holdings for an address
 */
export async function getTokenHoldings(address: Address): Promise<TokenHolding> {
  try {
    const [emptoursBalance, toursBalance] = await Promise.all([
      client.readContract({
        address: EMPTOURS_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }),
      client.readContract({
        address: TOURS_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }),
    ]);

    return {
      emptours: {
        balance: formatEther(emptoursBalance),
        balanceRaw: emptoursBalance,
        isHolder: emptoursBalance > MIN_EMPTOURS_TO_INTERACT,
      },
      tours: {
        balance: formatEther(toursBalance),
        balanceRaw: toursBalance,
      },
    };
  } catch (err) {
    console.error('[TokenGate] Failed to fetch balances:', err);
    return {
      emptours: { balance: '0', balanceRaw: 0n, isHolder: false },
      tours: { balance: '0', balanceRaw: 0n },
    };
  }
}

/**
 * Check if address is an EMPTOURS holder
 */
export async function isEmptoursHolder(address: Address): Promise<boolean> {
  const holdings = await getTokenHoldings(address);
  return holdings.emptours.isHolder;
}

/**
 * Check if address has premium status (holds enough EMPTOURS)
 */
export async function hasPremiumStatus(address: Address): Promise<boolean> {
  const holdings = await getTokenHoldings(address);
  return holdings.emptours.balanceRaw >= PREMIUM_EMPTOURS_THRESHOLD;
}

/**
 * Get governance voting weight multiplier based on EMPTOURS holdings
 */
export async function getGovernanceMultiplier(address: Address): Promise<number> {
  const holdings = await getTokenHoldings(address);

  for (const tier of GOVERNANCE_EMPTOURS_TIERS) {
    if (holdings.emptours.balanceRaw >= tier.threshold) {
      return tier.multiplier;
    }
  }

  return 1;
}

/**
 * Token gate middleware - throws if user doesn't hold required tokens
 */
export async function requireEmptoursHolder(
  address: Address,
  customMinimum?: bigint
): Promise<TokenHolding> {
  const holdings = await getTokenHoldings(address);
  const minimum = customMinimum ?? MIN_EMPTOURS_TO_INTERACT;

  if (holdings.emptours.balanceRaw <= minimum) {
    const minFormatted = formatEther(minimum);
    throw new Error(
      `You need to hold EMPTOURS tokens to interact with the agent. ` +
      `Minimum required: ${minFormatted === '0' ? 'any amount' : minFormatted + ' EMPTOURS'}. ` +
      `Buy EMPTOURS at: https://nad.fun/tokens/${EMPTOURS_TOKEN}`
    );
  }

  return holdings;
}
