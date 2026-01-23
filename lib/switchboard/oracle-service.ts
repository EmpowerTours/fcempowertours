import { OracleJob } from '@switchboard-xyz/common';
import { ethers } from 'ethers';

/**
 * Switchboard Oracle Service for EmpowerTours
 * Provides real-time yield data from Kintsu vault and other DeFi protocols
 */

const CROSSBAR_SIMULATE_URL = 'https://crossbar.switchboard.xyz/api/simulate';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

// Kintsu vault contract on Monad testnet
const KINTSU_VAULT_ADDRESS = process.env.KINTSU_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000';

// Cache for oracle results to avoid rate limiting
interface OracleCache {
  value: number;
  timestamp: number;
  ttl: number; // milliseconds
}

const oracleCache: Map<string, OracleCache> = new Map();

/**
 * Oracle job definitions for different data feeds
 */
export const OracleJobs = {
  // MON/USD price feed from multiple sources
  MON_USD_PRICE: (): OracleJob[] => [
    new OracleJob({
      tasks: [
        {
          httpTask: {
            url: 'https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd',
          },
        },
        {
          jsonParseTask: {
            path: '$.monad.usd',
          },
        },
      ],
    }),
  ],

  // Generic vault APY calculation job
  // This fetches vault metrics and calculates APY
  VAULT_APY: (vaultApiUrl: string): OracleJob[] => [
    new OracleJob({
      tasks: [
        {
          httpTask: {
            url: vaultApiUrl,
          },
        },
        {
          jsonParseTask: {
            path: '$.apy',
          },
        },
      ],
    }),
  ],

  // ETH/USD price as a reference
  ETH_USD_PRICE: (): OracleJob[] => [
    new OracleJob({
      tasks: [
        {
          httpTask: {
            url: 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
          },
        },
        {
          jsonParseTask: {
            path: '$.price',
          },
        },
      ],
    }),
  ],
};

/**
 * Simulate oracle jobs using Switchboard's crossbar API
 */
export async function simulateOracleJobs(jobs: OracleJob[]): Promise<string[]> {
  try {
    // Serialize jobs to base64
    const serializedJobs = jobs.map((oracleJob) => {
      const encoded = OracleJob.encodeDelimited(oracleJob).finish();
      const base64 = Buffer.from(encoded).toString('base64');
      return base64;
    });

    const response = await fetch(CROSSBAR_SIMULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cluster: 'Mainnet',
        jobs: serializedJobs,
      }),
    });

    if (!response.ok) {
      throw new Error(`Simulation failed: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Oracle simulation error:', error);
    throw error;
  }
}

/**
 * Get cached oracle value or fetch new one
 */
async function getCachedOrFetch(
  cacheKey: string,
  fetchFn: () => Promise<number>,
  ttlMs: number = 60000 // 1 minute default
): Promise<number> {
  const cached = oracleCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < cached.ttl) {
    console.log(`[Switchboard] Using cached value for ${cacheKey}:`, cached.value);
    return cached.value;
  }

  try {
    const value = await fetchFn();
    oracleCache.set(cacheKey, { value, timestamp: now, ttl: ttlMs });
    console.log(`[Switchboard] Fetched fresh value for ${cacheKey}:`, value);
    return value;
  } catch (error) {
    // Return cached value even if stale, or throw
    if (cached) {
      console.warn(`[Switchboard] Using stale cache for ${cacheKey}`);
      return cached.value;
    }
    throw error;
  }
}

/**
 * Fetch Kintsu vault APY from on-chain data
 * Calculates APY based on vault share price changes
 */
export async function fetchKintsuVaultAPY(): Promise<number> {
  return getCachedOrFetch('kintsu_apy', async () => {
    try {
      const provider = new ethers.JsonRpcProvider(MONAD_RPC);

      // Kintsu vault ABI for reading share price
      const vaultABI = [
        'function totalAssets() external view returns (uint256)',
        'function totalSupply() external view returns (uint256)',
        'function convertToAssets(uint256 shares) external view returns (uint256)',
      ];

      // Check if vault address is configured
      if (KINTSU_VAULT_ADDRESS === '0x0000000000000000000000000000000000000000') {
        console.log('[Switchboard] Kintsu vault not configured, using baseline APY');
        return 0.10; // 10% baseline
      }

      const vault = new ethers.Contract(KINTSU_VAULT_ADDRESS, vaultABI, provider);

      // Get current share price (assets per share)
      const oneShare = ethers.parseUnits('1', 18);
      const assetsPerShare = await vault.convertToAssets(oneShare);

      // For APY calculation, we'd ideally compare to historical share price
      // Since we don't have historical data stored, estimate based on typical LST yields
      const sharePrice = Number(ethers.formatUnits(assetsPerShare, 18));

      // If share price > 1, vault has generated yield
      // Estimate APY based on typical liquid staking returns (8-12%)
      let estimatedAPY = 0.10; // 10% baseline

      if (sharePrice > 1.0) {
        // Share price appreciation indicates yield
        // Rough estimate: if sharePrice is 1.05, that's ~5% return
        estimatedAPY = Math.min(0.15, Math.max(0.05, sharePrice - 1));
      }

      console.log('[Switchboard] Kintsu vault share price:', sharePrice, 'Estimated APY:', estimatedAPY);
      return estimatedAPY;
    } catch (error) {
      console.warn('[Switchboard] Failed to fetch Kintsu vault data:', error);
      return 0.10; // Baseline fallback
    }
  }, 300000); // Cache for 5 minutes
}

/**
 * Fetch MON/USD price from oracle
 */
export async function fetchMONPrice(): Promise<number> {
  return getCachedOrFetch('mon_usd', async () => {
    try {
      const jobs = OracleJobs.MON_USD_PRICE();
      const results = await simulateOracleJobs(jobs);

      if (results.length > 0 && results[0]) {
        return parseFloat(results[0]);
      }

      throw new Error('No result from oracle');
    } catch (error) {
      console.warn('[Switchboard] Failed to fetch MON price from oracle:', error);

      // Fallback: try direct API call
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd'
        );
        const data = await response.json();
        return data.monad?.usd || 0;
      } catch {
        return 0;
      }
    }
  }, 60000); // Cache for 1 minute
}

/**
 * Fetch ETH/USD price from oracle (reference)
 */
export async function fetchETHPrice(): Promise<number> {
  return getCachedOrFetch('eth_usd', async () => {
    try {
      const jobs = OracleJobs.ETH_USD_PRICE();
      const results = await simulateOracleJobs(jobs);

      if (results.length > 0 && results[0]) {
        return parseFloat(results[0]);
      }

      throw new Error('No result from oracle');
    } catch (error) {
      console.warn('[Switchboard] Failed to fetch ETH price from oracle:', error);

      // Fallback: direct Binance API
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
        const data = await response.json();
        return parseFloat(data.price) || 0;
      } catch {
        return 0;
      }
    }
  }, 60000);
}

/**
 * Create custom oracle job from HTTP endpoint
 */
export function createCustomOracleJob(url: string, jsonPath: string): OracleJob {
  return new OracleJob({
    tasks: [
      {
        httpTask: { url },
      },
      {
        jsonParseTask: { path: jsonPath },
      },
    ],
  });
}

/**
 * Batch fetch multiple oracle values
 */
export async function batchFetchOracleData(): Promise<{
  kintsuAPY: number;
  monPrice: number;
  ethPrice: number;
}> {
  const [kintsuAPY, monPrice, ethPrice] = await Promise.all([
    fetchKintsuVaultAPY().catch(() => 0.10),
    fetchMONPrice().catch(() => 0),
    fetchETHPrice().catch(() => 0),
  ]);

  return { kintsuAPY, monPrice, ethPrice };
}

/**
 * Health check for oracle service
 */
export async function checkOracleHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: Record<string, boolean>;
}> {
  const checks: Record<string, boolean> = {};

  // Check crossbar API
  try {
    const testJob = OracleJobs.ETH_USD_PRICE();
    await simulateOracleJobs(testJob);
    checks.crossbar = true;
  } catch {
    checks.crossbar = false;
  }

  // Check RPC connection
  try {
    const provider = new ethers.JsonRpcProvider(MONAD_RPC);
    await provider.getBlockNumber();
    checks.rpc = true;
  } catch {
    checks.rpc = false;
  }

  const healthy = Object.values(checks).every(Boolean);
  const degraded = Object.values(checks).some(Boolean);

  return {
    status: healthy ? 'healthy' : degraded ? 'degraded' : 'unhealthy',
    details: checks,
  };
}
