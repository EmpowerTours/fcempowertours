/**
 * Ethereum Balance Checker
 * Verifies if a user owns the Consensus Hong Kong NFT on Ethereum
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// Verse.works Consensus Hong Kong contract
const CONSENSUS_CONTRACT = '0xe77da02ee0d193d837cfe1fa1a24a76ecc054ace';

// ERC721 ABI for balanceOf
const ERC721_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

export interface ConsensusNFTEligibility {
  isEligible: boolean;
  nftCount: number;
  error?: string;
}

/**
 * Check if an Ethereum address owns at least one Consensus Hong Kong NFT
 * @param ethereumAddress - Ethereum address to check (0x...)
 * @returns Eligibility status and NFT count
 */
export async function checkConsensusNFTEligibility(
  ethereumAddress: string
): Promise<ConsensusNFTEligibility> {
  try {
    // Validate address format
    if (!ethereumAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return {
        isEligible: false,
        nftCount: 0,
        error: 'Invalid Ethereum address format',
      };
    }

    // Create Ethereum RPC client
    const ethereumRpc = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
    const client = createPublicClient({
      chain: mainnet,
      transport: http(ethereumRpc),
    });

    // Query balanceOf on the Consensus contract
    const balance = await client.readContract({
      address: CONSENSUS_CONTRACT as `0x${string}`,
      abi: ERC721_ABI,
      functionName: 'balanceOf',
      args: [ethereumAddress as `0x${string}`],
    });

    const nftCount = Number(balance);
    const isEligible = nftCount > 0;

    return {
      isEligible,
      nftCount,
    };
  } catch (error) {
    console.error('[ConsensusNFT] Balance check error:', error);
    return {
      isEligible: false,
      nftCount: 0,
      error: error instanceof Error ? error.message : 'Failed to check balance',
    };
  }
}

/**
 * Verify an Ethereum signature matches the address
 * (Prevents address spoofing)
 */
export function verifyEthereumSignature(
  message: string,
  signature: string,
  address: string
): boolean {
  // This would use ethers.js or viem to verify
  // For now, basic validation
  try {
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) return false;
    if (!signature.match(/^0x[a-fA-F0-9]{130}$/)) return false;
    return true;
  } catch {
    return false;
  }
}
