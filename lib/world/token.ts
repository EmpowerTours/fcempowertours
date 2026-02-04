import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { monadMainnet } from '@/app/chains';

export interface TokenInfo {
  address: string;
  symbol: string;
  price: string;
  marketCap: string;
  graduated: boolean;
  progress: number;
}

// nad.fun contract addresses on Monad Mainnet
const NAD_CONTRACTS = {
  LENS: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea' as const,
  BONDING_CURVE_ROUTER: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22' as const,
  DEX_ROUTER: '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137' as const,
};

// EMPTOURS token address
const EMPTOURS_TOKEN = '0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777' as const;

// Lens contract ABI (read functions only)
const LENS_ABI = [
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'isGraduated',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getProgress',
    outputs: [{ name: 'progress', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'isBuy', type: 'bool' },
    ],
    name: 'getAmountOut',
    outputs: [
      { name: 'router', type: 'address' },
      { name: 'amountOut', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'availableBuyTokens',
    outputs: [
      { name: 'availableAmount', type: 'uint256' },
      { name: 'requiredMon', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC20 ABI for balance/supply
const ERC20_ABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Get EMPTOURS token price and info from nad.fun Lens contract
 * Uses the Lens contract to query bonding curve or DEX pricing
 */
export async function getTokenInfo(): Promise<TokenInfo | null> {
  try {
    const publicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(),
    });

    // Check if token has graduated from bonding curve to DEX
    const graduated = await publicClient.readContract({
      address: NAD_CONTRACTS.LENS,
      abi: LENS_ABI,
      functionName: 'isGraduated',
      args: [EMPTOURS_TOKEN],
    });

    // Get bonding curve progress (in basis points, 10000 = 100%)
    let progress = 0;
    if (!graduated) {
      const progressBps = await publicClient.readContract({
        address: NAD_CONTRACTS.LENS,
        abi: LENS_ABI,
        functionName: 'getProgress',
        args: [EMPTOURS_TOKEN],
      });
      progress = Number(progressBps) / 100; // Convert to percentage
    }

    // Get price by checking how much 1 MON would buy
    const oneMonWei = parseEther('1');
    const [, tokensFor1Mon] = await publicClient.readContract({
      address: NAD_CONTRACTS.LENS,
      abi: LENS_ABI,
      functionName: 'getAmountOut',
      args: [EMPTOURS_TOKEN, oneMonWei, true], // true = buying
    });

    // Price = 1 MON / tokens received
    const tokensPerMon = Number(formatEther(tokensFor1Mon));
    const priceInMon = tokensPerMon > 0 ? 1 / tokensPerMon : 0;

    // Get total supply for market cap calculation
    const totalSupply = await publicClient.readContract({
      address: EMPTOURS_TOKEN,
      abi: ERC20_ABI,
      functionName: 'totalSupply',
    });

    const totalSupplyNum = Number(formatEther(totalSupply));
    const marketCap = totalSupplyNum * priceInMon;

    return {
      address: EMPTOURS_TOKEN,
      symbol: 'EMPTOURS',
      price: priceInMon.toFixed(8),
      marketCap: marketCap.toFixed(2),
      graduated,
      progress,
    };
  } catch (error) {
    console.error('[Token] Error fetching EMPTOURS info:', error);
    return null;
  }
}

/**
 * Get quote for buying EMPTOURS with MON
 */
export async function getBuyQuote(monAmount: string): Promise<{
  tokensOut: string;
  router: string;
} | null> {
  try {
    const publicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(),
    });

    const monWei = parseEther(monAmount);
    const [router, tokensOut] = await publicClient.readContract({
      address: NAD_CONTRACTS.LENS,
      abi: LENS_ABI,
      functionName: 'getAmountOut',
      args: [EMPTOURS_TOKEN, monWei, true],
    });

    return {
      tokensOut: formatEther(tokensOut),
      router,
    };
  } catch (error) {
    console.error('[Token] Error getting buy quote:', error);
    return null;
  }
}

/**
 * Get quote for selling EMPTOURS for MON
 */
export async function getSellQuote(tokenAmount: string): Promise<{
  monOut: string;
  router: string;
} | null> {
  try {
    const publicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(),
    });

    const tokenWei = parseEther(tokenAmount);
    const [router, monOut] = await publicClient.readContract({
      address: NAD_CONTRACTS.LENS,
      abi: LENS_ABI,
      functionName: 'getAmountOut',
      args: [EMPTOURS_TOKEN, tokenWei, false],
    });

    return {
      monOut: formatEther(monOut),
      router,
    };
  } catch (error) {
    console.error('[Token] Error getting sell quote:', error);
    return null;
  }
}
