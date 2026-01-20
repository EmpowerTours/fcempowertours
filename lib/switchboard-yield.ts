import { ethers } from 'ethers';
import { fetchKintsuVaultAPY, batchFetchOracleData } from './switchboard/oracle-service';

/**
 * Switchboard-powered yield tracking for EmpowerTours
 * Uses Switchboard oracles for real-time APY data from Kintsu vault
 */

// Fallback APY if oracle fails (historical Kintsu range: 8-12%)
const KINTSU_FALLBACK_APY = 0.10; // 10% baseline
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

export interface YieldProjection {
  actualYield: string;        // On-chain yield (from YieldStrategy contract)
  projectedYield: string;     // Estimated yield based on Switchboard APY
  estimatedAPY: number;       // Current estimated APY from oracle
  timeStakedSeconds: number;  // Seconds since staking
  projectedAPR: number;       // Annualized return based on actual yield
  oracleSource: 'switchboard' | 'fallback';
}

/**
 * Fetch Kintsu vault APY from Switchboard oracle
 * Returns real-time APY data with fallback to baseline
 */
export async function fetchKintsuAPY(): Promise<number> {
  try {
    console.log('[Switchboard] Fetching Kintsu APY from oracle...');
    const apy = await fetchKintsuVaultAPY();

    // Validate APY is within reasonable bounds (1% - 50%)
    if (apy > 0.01 && apy < 0.50) {
      console.log(`[Switchboard] Kintsu APY: ${(apy * 100).toFixed(2)}%`);
      return apy;
    }

    console.warn('[Switchboard] APY out of bounds, using fallback');
    return KINTSU_FALLBACK_APY;
  } catch (error) {
    console.warn('[Switchboard] Failed to fetch APY from oracle, using fallback:', error);
    return KINTSU_FALLBACK_APY;
  }
}

/**
 * Calculate projected yield for a staking position
 * Uses Switchboard oracle for real-time APY estimates
 */
export async function calculateProjectedYield(
  monAmount: bigint,
  stakedTimestamp: bigint,
  actualYield: bigint
): Promise<YieldProjection> {
  try {
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const timeStakedSeconds = Number(currentTime - stakedTimestamp);

    // Fetch current APY from Switchboard oracle
    let estimatedAPY: number;
    let oracleSource: 'switchboard' | 'fallback' = 'switchboard';

    try {
      estimatedAPY = await fetchKintsuAPY();
    } catch {
      estimatedAPY = KINTSU_FALLBACK_APY;
      oracleSource = 'fallback';
    }

    // Calculate projected yield: (amount × APY × timeStaked) / secondsPerYear
    const monAmountNum = Number(ethers.formatUnits(monAmount, 18));
    const projectedYieldNum = (monAmountNum * estimatedAPY * timeStakedSeconds) / SECONDS_PER_YEAR;

    // Calculate actual APR based on on-chain yield
    const actualYieldNum = Number(ethers.formatUnits(actualYield, 18));
    const projectedAPR = timeStakedSeconds > 0 && monAmountNum > 0
      ? (actualYieldNum / monAmountNum) * (SECONDS_PER_YEAR / timeStakedSeconds)
      : 0;

    return {
      actualYield: actualYieldNum.toFixed(6),
      projectedYield: projectedYieldNum.toFixed(6),
      estimatedAPY,
      timeStakedSeconds,
      projectedAPR,
      oracleSource,
    };
  } catch (error) {
    console.error('[Switchboard] Failed to calculate projected yield:', error);
    return {
      actualYield: '0',
      projectedYield: '0',
      estimatedAPY: KINTSU_FALLBACK_APY,
      timeStakedSeconds: 0,
      projectedAPR: 0,
      oracleSource: 'fallback',
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
  oracleStatus: string;
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
    oracleStatus: projection.oracleSource === 'switchboard' ? 'Live' : 'Estimated',
  };
}

/**
 * Estimate vault performance based on asset growth
 * Can be used to dynamically adjust APY estimates
 */
export async function estimateVaultPerformance(
  totalAssetsCurrent: bigint,
  totalAssetsPrevious: bigint,
  timeDeltaSeconds: number
): Promise<number> {
  try {
    if (timeDeltaSeconds === 0 || totalAssetsPrevious === BigInt(0)) {
      return KINTSU_FALLBACK_APY;
    }

    const currentNum = Number(ethers.formatUnits(totalAssetsCurrent, 18));
    const previousNum = Number(ethers.formatUnits(totalAssetsPrevious, 18));

    const growth = (currentNum - previousNum) / previousNum;
    const annualizedGrowth = (growth * SECONDS_PER_YEAR) / timeDeltaSeconds;

    // Cap at reasonable bounds (5-15%)
    const estimatedAPY = Math.max(0.05, Math.min(0.15, annualizedGrowth));

    console.log('[Switchboard] Estimated vault APY from performance:', (estimatedAPY * 100).toFixed(2) + '%');
    return estimatedAPY;
  } catch (error) {
    console.error('[Switchboard] Failed to estimate vault performance:', error);
    return KINTSU_FALLBACK_APY;
  }
}

/**
 * Get comprehensive oracle data including prices and APY
 */
export async function getOracleData(): Promise<{
  kintsuAPY: number;
  monPrice: number;
  ethPrice: number;
  timestamp: number;
}> {
  const data = await batchFetchOracleData();
  return {
    ...data,
    timestamp: Date.now(),
  };
}

/**
 * Calculate USD value of staked MON using oracle prices
 */
export async function calculateStakedValueUSD(monAmount: bigint): Promise<number> {
  try {
    const { monPrice } = await batchFetchOracleData();
    const monAmountNum = Number(ethers.formatUnits(monAmount, 18));
    return monAmountNum * monPrice;
  } catch {
    return 0;
  }
}
