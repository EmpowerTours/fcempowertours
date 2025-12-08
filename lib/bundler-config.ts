/**
 * Bundler Abstraction Layer
 *
 * Supports both Pimlico and FastLane shBundler.
 * Allows A/B testing and strategic bundler selection.
 */

import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { http, Address, hashMessage } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import env from './env';

export type BundlerProvider = 'pimlico' | 'fastlane';

/**
 * Get bundler RPC URL by provider
 */
export function getBundlerUrl(provider: BundlerProvider = 'pimlico'): string {
  switch (provider) {
    case 'pimlico':
      return env.PIMLICO_BUNDLER_URL;
    case 'fastlane':
      return env.FASTLANE_BUNDLER_URL;
    default:
      return env.PIMLICO_BUNDLER_URL; // Fallback to Pimlico
  }
}

/**
 * Determine if FastLane should be used for this user
 *
 * A/B Test Strategy:
 * - If FASTLANE_ENABLED=false: Always use Pimlico
 * - If FASTLANE_ENABLED=true: 10% of users get FastLane (based on address hash)
 */
export function shouldUseFastLane(userAddress?: Address): boolean {
  // Feature flag: FastLane disabled by default
  if (!env.FASTLANE_ENABLED) {
    return false;
  }

  // If no user address, default to Pimlico
  if (!userAddress) {
    return false;
  }

  // A/B test: 10% of users get FastLane
  // Hash the address and use last 2 hex digits (0-255)
  // If value < 26 (~10%), use FastLane
  const hash = hashMessage(userAddress);
  const lastByte = parseInt(hash.slice(-2), 16);

  return lastByte < 26; // ~10% get FastLane
}

/**
 * Choose bundler provider based on strategy
 *
 * Priority:
 * 1. If explicitly specified, use that provider
 * 2. If FastLane enabled, A/B test based on user address
 * 3. Default to Pimlico (battle-tested)
 */
export function selectBundlerProvider(
  userAddress?: Address,
  preferredProvider?: BundlerProvider
): BundlerProvider {
  // If explicitly requested, honor it
  if (preferredProvider) {
    return preferredProvider;
  }

  // A/B test based on user address
  if (shouldUseFastLane(userAddress)) {
    return 'fastlane';
  }

  // Default: Pimlico
  return 'pimlico';
}

/**
 * Create Pimlico client for specified bundler
 *
 * Works with both Pimlico and FastLane (both ERC-4337 compliant)
 */
export function createBundlerClient(provider: BundlerProvider = 'pimlico') {
  const bundlerUrl = getBundlerUrl(provider);

  return createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });
}

/**
 * Get bundler name for logging
 */
export function getBundlerName(provider: BundlerProvider): string {
  return provider === 'fastlane' ? 'FastLane shBundler' : 'Pimlico';
}

/**
 * Metrics tracking interface
 */
export interface BundlerMetrics {
  provider: BundlerProvider;
  userAddress: Address;
  txHash: string;
  userOpHash: string;
  startTime: number;
  confirmationTime: number;
  gasUsed: bigint;
  success: boolean;
  error?: string;
}

/**
 * Log bundler selection (for monitoring)
 */
export function logBundlerSelection(
  userAddress: Address,
  provider: BundlerProvider,
  reason: string
) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Bundler] ${getBundlerName(provider)} selected for ${userAddress}`);
    console.log(`[Bundler] Reason: ${reason}`);
  }
}

/**
 * Get bundler health status
 */
export async function checkBundlerHealth(provider: BundlerProvider): Promise<boolean> {
  try {
    const bundlerUrl = getBundlerUrl(provider);
    const response = await fetch(bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
    });

    return response.ok;
  } catch (error) {
    console.error(`[Bundler] Health check failed for ${getBundlerName(provider)}:`, error);
    return false;
  }
}

/**
 * Fallback strategy: Try primary bundler, fall back to secondary
 */
export async function getBundlerWithFallback(
  primaryProvider: BundlerProvider
): Promise<BundlerProvider> {
  const primary = await checkBundlerHealth(primaryProvider);

  if (primary) {
    return primaryProvider;
  }

  // Fallback to other provider
  const fallbackProvider: BundlerProvider = primaryProvider === 'pimlico' ? 'fastlane' : 'pimlico';
  const fallback = await checkBundlerHealth(fallbackProvider);

  if (fallback) {
    console.warn(`[Bundler] ${getBundlerName(primaryProvider)} unhealthy, falling back to ${getBundlerName(fallbackProvider)}`);
    return fallbackProvider;
  }

  // Both unhealthy, return primary and let error propagate
  console.error('[Bundler] Both bundlers unhealthy!');
  return primaryProvider;
}
