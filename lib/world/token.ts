import { createPublicClient, http, formatEther } from 'viem';
import { monadMainnet } from '@/app/chains';
import { NADFUN_LENS, EMPTOURS_TOKEN } from './types';

// nad.fun Lens ABI - minimal for price queries
const LENS_ABI = [
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getTokenInfo',
    outputs: [
      {
        components: [
          { name: 'token', type: 'address' },
          { name: 'creator', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'totalSupply', type: 'uint256' },
          { name: 'virtualTokenReserves', type: 'uint256' },
          { name: 'virtualMonReserves', type: 'uint256' },
          { name: 'realTokenReserves', type: 'uint256' },
          { name: 'realMonReserves', type: 'uint256' },
          { name: 'graduated', type: 'bool' },
        ],
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const client = createPublicClient({
  chain: monadMainnet,
  transport: http(),
});

export interface TokenInfo {
  address: string;
  symbol: string;
  price: string;
  marketCap: string;
  graduated: boolean;
}

let tokenCache: { data: TokenInfo; fetchedAt: number } | null = null;
const TOKEN_CACHE_TTL = 10_000; // 10 seconds

/** Get EMPTOURS token price and info from nad.fun Lens contract */
export async function getTokenInfo(): Promise<TokenInfo | null> {
  // nad.fun contracts not deployed on Monad mainnet yet - disable to prevent errors
  // TODO: Re-enable when nad.fun is live on Monad
  return null;

  if (!EMPTOURS_TOKEN) return null;

  const now = Date.now();
  if (tokenCache && now - tokenCache.fetchedAt < TOKEN_CACHE_TTL) {
    return tokenCache.data;
  }

  try {
    const result = await client.readContract({
      address: NADFUN_LENS,
      abi: LENS_ABI,
      functionName: 'getTokenInfo',
      args: [EMPTOURS_TOKEN],
    });

    const info = result as any;
    const virtualMon = BigInt(info.virtualMonReserves || 0);
    const virtualToken = BigInt(info.virtualTokenReserves || 0);

    // Price = virtualMonReserves / virtualTokenReserves
    let price = '0';
    if (virtualToken > 0n) {
      const priceWei = (virtualMon * 10n ** 18n) / virtualToken;
      price = formatEther(priceWei);
    }

    // Market cap = price * totalSupply
    const totalSupply = BigInt(info.totalSupply || 0);
    let marketCap = '0';
    if (virtualToken > 0n && totalSupply > 0n) {
      const mcWei = (virtualMon * totalSupply) / virtualToken;
      marketCap = formatEther(mcWei);
    }

    const tokenInfo: TokenInfo = {
      address: EMPTOURS_TOKEN,
      symbol: 'EMPTOURS',
      price,
      marketCap,
      graduated: Boolean(info.graduated),
    };

    tokenCache = { data: tokenInfo, fetchedAt: now };
    return tokenInfo;
  } catch (err) {
    console.error('[World] Token info fetch error:', err);
    return tokenCache?.data || null;
  }
}
