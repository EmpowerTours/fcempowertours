import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi } from 'viem';
import { monad } from '@/lib/chains';

// ERC-8004 Registry addresses on Monad
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const;

// EmpowerToursAgent info
const AGENT_WALLET = '0x868469E5D124f81cf63e1A3808795649cA6c3D77';
const AGENT_CARD_URL = 'https://fcempowertours-production-6551.up.railway.app/agent-card.json';

const identityRegistryAbi = parseAbi([
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
]);

const reputationRegistryAbi = parseAbi([
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function getClients(uint256 agentId) external view returns (address[])',
]);

/**
 * GET /api/agent
 * Returns EmpowerToursAgent ERC-8004 registration info
 */
export async function GET() {
  try {
    const publicClient = createPublicClient({
      chain: monad,
      transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz'),
    });

    // Check if agent is registered
    let agentId: bigint | null = null;
    let tokenURI: string | null = null;
    let reputationSummary: { count: number; score: number } | null = null;

    try {
      // Check balance of agent wallet in Identity Registry
      const balance = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: 'balanceOf',
        args: [AGENT_WALLET as `0x${string}`],
      });

      if (balance > 0n) {
        // Get the first token (agent ID)
        agentId = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: identityRegistryAbi,
          functionName: 'tokenOfOwnerByIndex',
          args: [AGENT_WALLET as `0x${string}`, 0n],
        });

        // Get token URI
        tokenURI = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: identityRegistryAbi,
          functionName: 'tokenURI',
          args: [agentId],
        });

        // Try to get reputation summary
        try {
          const [count, summaryValue, decimals] = await publicClient.readContract({
            address: REPUTATION_REGISTRY,
            abi: reputationRegistryAbi,
            functionName: 'getSummary',
            args: [agentId, [], '', ''],
          });
          reputationSummary = {
            count: Number(count),
            score: Number(summaryValue) / Math.pow(10, decimals),
          };
        } catch {
          // Reputation not available yet
        }
      }
    } catch (e) {
      // Not registered yet
      console.log('[Agent] Not registered with ERC-8004 yet');
    }

    const response = {
      success: true,
      agent: {
        name: 'EmpowerToursAgent',
        description: 'World Host for the EmpowerTours Agent World on Monad',
        wallet: AGENT_WALLET,
        agentCardUrl: AGENT_CARD_URL,
        erc8004: {
          registered: agentId !== null,
          agentId: agentId ? Number(agentId) : null,
          tokenURI: tokenURI,
          identityRegistry: IDENTITY_REGISTRY,
          reputationRegistry: REPUTATION_REGISTRY,
          reputation: reputationSummary,
        },
        world: {
          entryFee: '1 MON',
          entryFeeReceiver: '0xf3b9D123E7Ac8C36FC9b5AB32135c665956725bA',
          tokenGate: 'EMPTOURS',
          tokenGateAddress: '0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777',
          rewardToken: 'TOURS',
          rewardTokenAddress: '0x45b76a127167fD7FC7Ed264ad490144300eCfcBF',
        },
        endpoints: {
          worldState: '/api/world/state',
          worldEnter: '/api/world/enter',
          worldAction: '/api/world/action',
          worldAgents: '/api/world/agents',
          worldLeaderboard: '/api/world/leaderboard',
          worldOracle: '/api/world/oracle',
        },
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Agent] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
