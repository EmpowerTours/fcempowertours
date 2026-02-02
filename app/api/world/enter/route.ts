import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { monadMainnet } from '@/app/chains';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/auth';
import { registerAgent, isAgentRegistered } from '@/lib/world/state';
import {
  WORLD_ENTRY_FEE,
  WORLD_FEE_RECEIVER,
  WorldRateLimits,
  WorldAgent,
} from '@/lib/world/types';

const client = createPublicClient({
  chain: monadMainnet,
  transport: http(),
});

/**
 * POST /api/world/enter
 *
 * Register an agent in the world by paying 1 MON entry fee.
 * Body: { address, name, description, txHash }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(WorldRateLimits.enter, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. Try again in ${rateLimit.resetIn}s.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { address, name, description, txHash } = body;

    if (!address || !name || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: address, name, txHash' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // Validate tx hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction hash format' },
        { status: 400 }
      );
    }

    // Check if already registered
    if (await isAgentRegistered(address)) {
      return NextResponse.json(
        { success: false, error: 'Agent already registered' },
        { status: 409 }
      );
    }

    // Verify the entry fee transaction on-chain
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (!receipt || receipt.status !== 'success') {
      return NextResponse.json(
        { success: false, error: 'Transaction failed or not found' },
        { status: 400 }
      );
    }

    // Verify the tx was sent by the agent's address
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
    if (tx.from.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Transaction sender does not match agent address' },
        { status: 400 }
      );
    }

    // Verify the tx sent at least 1 MON to the fee receiver
    if (tx.to?.toLowerCase() !== WORLD_FEE_RECEIVER.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: `Transaction must be sent to ${WORLD_FEE_RECEIVER}` },
        { status: 400 }
      );
    }

    const requiredWei = parseEther(WORLD_ENTRY_FEE);
    if (tx.value < requiredWei) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient entry fee. Sent ${formatEther(tx.value)} MON, required ${WORLD_ENTRY_FEE} MON`,
        },
        { status: 400 }
      );
    }

    // Register the agent
    const sanitizedName = sanitizeInput(name, 50);
    const sanitizedDesc = sanitizeInput(description || '', 200);

    const agent: WorldAgent = {
      address: address.toLowerCase(),
      name: sanitizedName || `Agent-${address.slice(0, 8)}`,
      description: sanitizedDesc,
      entryTxHash: txHash,
      registeredAt: Date.now(),
      lastActionAt: 0,
      totalActions: 0,
      toursEarned: '0',
    };

    await registerAgent(agent);

    console.log(`[World] Agent registered: ${agent.name} (${address})`);

    return NextResponse.json({
      success: true,
      agent,
      message: `Welcome to the world, ${agent.name}! You can now perform actions.`,
    });
  } catch (err: any) {
    console.error('[World] Enter error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to register agent' },
      { status: 500 }
    );
  }
}
