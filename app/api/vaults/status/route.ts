import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, formatEther } from 'viem';

const VAULT_CONTRACT = (process.env.VAULT_CONTRACT || '') as `0x${string}`;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

// Agent personality metadata (matches vault-trading-engine.js)
const AGENT_META = [
  { name: 'The Value Optimizer',   style: 'conservative', emoji: '🛡️' },
  { name: 'The Balanced Executor', style: 'balanced',     emoji: '⚖️' },
  { name: 'The Speed Demon',       style: 'aggressive',   emoji: '⚡' },
  { name: 'The Sniper',            style: 'precision',    emoji: '🎯' },
  { name: 'The Arbitrageur',       style: 'value',        emoji: '📊' },
  { name: 'The Volatility Trader', style: 'volatility',   emoji: '🌊' },
  { name: 'The Patient',           style: 'longterm',     emoji: '🧘' },
  { name: 'The Aggressor',         style: 'momentum',     emoji: '🔥' },
];

const vaultAbi = parseAbi([
  'function getAllVaultStats() external view returns (address[8] wallets, uint8[8] statuses, uint256[8] navs, uint256[8] navPerShares, uint256[8] shares, uint64[8] tradeCounts, uint64[8] winCounts, uint64[8] lossCounts, int256[8] pnls, uint256[8] volumes)',
  'function paused() external view returns (bool)',
]);

// In-memory cache: refresh at most every 10s
let cache: { data: any; ts: number } = { data: null, ts: 0 };

export async function GET() {
  const now = Date.now();
  if (cache.data && now - cache.ts < 10000) {
    return NextResponse.json(cache.data);
  }

  if (!VAULT_CONTRACT || VAULT_CONTRACT === '0x') {
    return NextResponse.json({ error: 'VAULT_CONTRACT not configured' }, { status: 500 });
  }

  try {
    const client = createPublicClient({ transport: http(MONAD_RPC) });

    const [stats, isPaused] = await Promise.all([
      client.readContract({
        address: VAULT_CONTRACT,
        abi: vaultAbi,
        functionName: 'getAllVaultStats',
      }) as Promise<any>,
      client.readContract({
        address: VAULT_CONTRACT,
        abi: vaultAbi,
        functionName: 'paused',
      }) as Promise<any>,
    ]);

    const [wallets, statuses, navs, navPerShares, shares, tradeCounts, winCounts, lossCounts, pnls, volumes] = stats as any[];

    const STATUS_LABELS = ['Inactive', 'Active', 'Dormant'];

    let totalTVL = 0n;
    const vaults = [];

    for (let i = 0; i < 8; i++) {
      const wallet = wallets[i] as string;
      if (wallet === '0x0000000000000000000000000000000000000000') continue;

      const nav = navs[i] as bigint;
      totalTVL += nav;

      const tradeCount = Number(tradeCounts[i]);
      const winCount = Number(winCounts[i]);
      const winRate = tradeCount > 0 ? ((winCount / tradeCount) * 100).toFixed(1) : '0.0';

      vaults.push({
        agentId: i,
        name: AGENT_META[i].name,
        style: AGENT_META[i].style,
        emoji: AGENT_META[i].emoji,
        wallet,
        status: STATUS_LABELS[Number(statuses[i])] || 'Unknown',
        tvl: formatEther(nav),
        navPerShare: formatEther(navPerShares[i] as bigint),
        totalShares: formatEther(shares[i] as bigint),
        tradeCount,
        winCount: Number(winCounts[i]),
        lossCount: Number(lossCounts[i]),
        winRate,
        cumulativePnL: (pnls[i] as bigint).toString(),
        volume: formatEther(volumes[i] as bigint),
      });
    }

    const result = {
      contract: VAULT_CONTRACT,
      paused: isPaused,
      totalTVL: formatEther(totalTVL),
      vaults,
      timestamp: now,
    };

    cache = { data: result, ts: now };
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[VaultStatus] Error:', err.message);
    if (cache.data) return NextResponse.json(cache.data);
    return NextResponse.json({ error: 'Failed to fetch vault stats' }, { status: 500 });
  }
}
