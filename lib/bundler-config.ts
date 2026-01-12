/**
 * Bundler Configuration
 *
 * Uses Pimlico as the ERC-4337 bundler for Account Abstraction.
 */

import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { http, Address } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import env from './env';

/**
 * Get bundler RPC URL
 */
export function getBundlerUrl(): string {
  return env.PIMLICO_BUNDLER_URL;
}

/**
 * Create Pimlico bundler client
 */
export function createBundlerClient() {
  return createPimlicoClient({
    transport: http(env.PIMLICO_BUNDLER_URL),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });
}

/**
 * Get bundler health status
 */
export async function checkBundlerHealth(): Promise<boolean> {
  try {
    const response = await fetch(env.PIMLICO_BUNDLER_URL, {
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
    console.error('[Bundler] Health check failed:', error);
    return false;
  }
}

/**
 * Metrics tracking interface
 */
export interface BundlerMetrics {
  userAddress: Address;
  txHash: string;
  userOpHash: string;
  startTime: number;
  confirmationTime: number;
  gasUsed: bigint;
  success: boolean;
  error?: string;
}
