import { ethers } from 'ethers';

/**
 * Switchboard integration for projected yield tracking
 * Provides estimated yield based on Kintsu vault performance
 */

// Kintsu vault estimated APY (8-12% historical range)
const KINTSU_BASE_APY = 0.10; // 10% baseline
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

interface YieldProjection {
  actualYield: string;        // On-chain yield (from contract)
  projectedYield: string;     // Estimated yield based on APY
  estimatedAPY: number;       // Current estimated APY
  timeStakedSeconds: number;  // Seconds since staking
  projectedAPR: number;       // Annualized return
}

/**
 * Fetch Kintsu vault APY from Switchboard oracle
 * Falls back to baseline if oracle unavailable
 */
export async function fetchKintsuAPY(): Promise<number> {
  try {
    // TODO: Integrate Switchboard oracle feed when available on Monad testnet
    // For now, use baseline APY
    const apy = KINTSU_BASE_APY;

    console.log('📊 Using Kintsu APY:', (apy * 100).toFixed(2) + '%');
    return apy;
  } catch (error) {
    console.warn('⚠️ Failed to fetch Kintsu APY from oracle, using baseline:', error);
    return KINTSU_BASE_APY;
  }
}

/**
 * Calculate projected yield for a staking position
 */
export async function calculateProjectedYield(
  monAmount: bigint,
  stakedTimestamp: bigint,
  actualYield: bigint
): Promise<YieldProjection> {
  try {
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const timeStakedSeconds = Number(currentTime - stakedTimestamp);

    // Fetch current APY
    const estimatedAPY = await fetchKintsuAPY();

    // Calculate projected yield: (amount × APY × timeStaked) / secondsPerYear
    const monAmountNum = Number(ethers.formatUnits(monAmount, 18));
    const projectedYieldNum = (monAmountNum * estimatedAPY * timeStakedSeconds) / SECONDS_PER_YEAR;

    // Calculate actual APR based on on-chain yield
    const actualYieldNum = Number(ethers.formatUnits(actualYield, 18));
    const projectedAPR = timeStakedSeconds > 0
      ? (actualYieldNum / monAmountNum) * (SECONDS_PER_YEAR / timeStakedSeconds)
      : 0;

    return {
      actualYield: actualYieldNum.toFixed(6),
      projectedYield: projectedYieldNum.toFixed(6),
      estimatedAPY: estimatedAPY,
      timeStakedSeconds,
      projectedAPR,
    };
  } catch (error) {
    console.error('❌ Failed to calculate projected yield:', error);
    return {
      actualYield: '0',
      projectedYield: '0',
      estimatedAPY: KINTSU_BASE_APY,
      timeStakedSeconds: 0,
      projectedAPR: 0,
    };
  }
}

/**
 * Format yield projection for display
 */
export function formatYieldProjection(projection: YieldProjection): {
  displayActual: string;
  displayProjected: string;
  displayAPY: string;
  displayAPR: string;
  daysStaked: number;
} {
  const daysStaked = Math.floor(projection.timeStakedSeconds / (24 * 60 * 60));

  return {
    displayActual: `${projection.actualYield} MON`,
    displayProjected: `~${projection.projectedYield} MON`,
    displayAPY: `${(projection.estimatedAPY * 100).toFixed(2)}%`,
    displayAPR: projection.projectedAPR > 0
      ? `${(projection.projectedAPR * 100).toFixed(4)}%`
      : 'N/A',
    daysStaked,
  };
}

/**
 * Estimate global vault performance
 * Can be used to adjust APY estimates based on real-time data
 */
export async function estimateVaultPerformance(
  totalAssetsCurrent: bigint,
  totalAssetsPrevious: bigint,
  timeDeltaSeconds: number
): Promise<number> {
  try {
    if (timeDeltaSeconds === 0 || totalAssetsPrevious === BigInt(0)) {
      return KINTSU_BASE_APY;
    }

    const currentNum = Number(ethers.formatUnits(totalAssetsCurrent, 18));
    const previousNum = Number(ethers.formatUnits(totalAssetsPrevious, 18));

    const growth = (currentNum - previousNum) / previousNum;
    const annualizedGrowth = (growth * SECONDS_PER_YEAR) / timeDeltaSeconds;

    // Cap at reasonable bounds (5-15%)
    const estimatedAPY = Math.max(0.05, Math.min(0.15, annualizedGrowth));

    console.log('📈 Estimated vault APY from performance:', (estimatedAPY * 100).toFixed(2) + '%');
    return estimatedAPY;
  } catch (error) {
    console.error('❌ Failed to estimate vault performance:', error);
    return KINTSU_BASE_APY;
  }
}
