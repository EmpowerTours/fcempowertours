import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { activeChain } from '@/app/chains';
import DAOContractFactoryABI from '@/lib/abis/DAOContractFactory.json';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_DAO_CONTRACT_FACTORY as Address;
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

const client = createPublicClient({
  chain: activeChain,
  transport: http(RPC_URL),
});

/**
 * GET /api/dev-studio/proposals — List deployment proposals
 * Query params: ?id=N (specific) or no params (list all)
 */
export async function GET(req: NextRequest) {
  try {
    if (!FACTORY_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'DAO Contract Factory not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const statusNames = ['Pending', 'Approved', 'CodeGenerated', 'Compiled', 'Deployed'];

    // Get specific proposal
    if (id !== null) {
      const proposal = await client.readContract({
        address: FACTORY_ADDRESS,
        abi: DAOContractFactoryABI,
        functionName: 'getProposal',
        args: [BigInt(id)],
      }) as any[];

      return NextResponse.json({
        success: true,
        proposal: {
          id: Number(id),
          governorProposalId: proposal[0].toString(),
          proposer: proposal[1],
          prompt: proposal[2],
          ipfsCodeHash: proposal[3],
          treasuryAllocation: Number(proposal[4]),
          deployedContract: proposal[5],
          deploymentNftId: Number(proposal[6]),
          status: statusNames[Number(proposal[7])] || 'Unknown',
          statusIndex: Number(proposal[7]),
          createdAt: Number(proposal[8]),
          deployedAt: Number(proposal[9]),
          sourceCodeHash: proposal[10],
          bytecodeHash: proposal[11],
          securityScore: Number(proposal[12]),
        },
      });
    }

    // List all proposals
    const count = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: DAOContractFactoryABI,
      functionName: 'proposalCount',
    }) as bigint;

    const proposals = [];

    // Fetch last 20 proposals (most recent first)
    const start = Number(count) > 20 ? Number(count) - 20 : 0;
    for (let i = Number(count) - 1; i >= start; i--) {
      try {
        const p = await client.readContract({
          address: FACTORY_ADDRESS,
          abi: DAOContractFactoryABI,
          functionName: 'getProposal',
          args: [BigInt(i)],
        }) as any[];

        proposals.push({
          id: i,
          governorProposalId: p[0].toString(),
          proposer: p[1],
          prompt: (p[2] as string).substring(0, 100),
          ipfsCodeHash: p[3],
          treasuryAllocation: Number(p[4]),
          deployedContract: p[5],
          status: statusNames[Number(p[7])] || 'Unknown',
          statusIndex: Number(p[7]),
          createdAt: Number(p[8]),
          deployedAt: Number(p[9]),
          sourceCodeHash: p[10],
          bytecodeHash: p[11],
          securityScore: Number(p[12]),
        });
      } catch {
        // Skip failed reads
      }
    }

    return NextResponse.json({
      success: true,
      total: Number(count),
      proposals,
    });
  } catch (error: any) {
    console.error('[DevStudio] Proposals error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch proposals' },
      { status: 500 }
    );
  }
}
