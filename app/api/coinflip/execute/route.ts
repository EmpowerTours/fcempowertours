import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  decodeEventLog,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadMainnet } from '@/app/chains';
import {
  getOrCreateCurrentRound,
  closeBetting,
  markExecuting,
  resolveRound,
  updateAgentStats,
  createNewRound,
  calculateConsolationPrizes,
} from '@/lib/coinflip/state';
import {
  COINFLIP_CONTRACT,
  CoinflipPrediction,
  TOURS_TOKEN,
  ConsolationPrize,
} from '@/lib/coinflip/types';
import { notifyDiscord } from '@/lib/discord-notify';
import { addEvent } from '@/lib/world/state';

// ERC20 ABI for TOURS token transfer
const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

// AicoinflipMON ABI (minimal - just the flip function)
const COINFLIP_ABI = [
  {
    type: 'function',
    name: 'flip',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'FlipResult',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'won', type: 'bool', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const FLIP_AMOUNT = '0.1'; // Minimum required by AicoinflipMON contract

const publicClient = createPublicClient({
  chain: monadMainnet,
  transport: http(),
});

/**
 * POST /api/coinflip/execute
 *
 * Close betting, execute on-chain flip, resolve round, pay winners
 * This should be called by a cron job or manually by admin
 */
export async function POST(req: NextRequest) {
  try {
    // Simple auth check - could be enhanced
    const authHeader = req.headers.get('x-admin-key');
    const adminKey = process.env.ADMIN_API_KEY;

    // Allow if admin key matches OR if called internally (no auth header but from cron)
    const isAuthorized = !adminKey || authHeader === adminKey || req.headers.get('x-cron-job') === 'true';

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!AGENT_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Agent wallet not configured' },
        { status: 503 }
      );
    }

    // Get current round
    const round = await getOrCreateCurrentRound();

    if (round.status === 'resolved') {
      return NextResponse.json(
        { success: false, error: 'Round already resolved' },
        { status: 400 }
      );
    }

    if (round.bets.length === 0) {
      // No bets, just create a new round
      await createNewRound();
      return NextResponse.json({
        success: true,
        message: 'No bets this round. New round created.',
        newRoundCreated: true,
      });
    }

    // Close betting
    await closeBetting();

    // Mark as executing
    await markExecuting();

    // Notify Discord
    const totalPool = (parseFloat(round.totalHeads) + parseFloat(round.totalTails)).toFixed(2);
    await notifyDiscord(
      `🎰 **Coinflip Round ${round.id} - Executing!**\n` +
      `📊 Total Pool: ${totalPool} EMPTOURS\n` +
      `🪙 Heads: ${round.totalHeads} | Tails: ${round.totalTails}\n` +
      `👥 ${round.bets.length} bets placed\n` +
      `⏳ Flipping coin on-chain...`
    ).catch(console.error);

    // Execute on-chain flip
    const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: monadMainnet,
      transport: http(),
    });

    console.log(`[Coinflip] Executing flip for round ${round.id}...`);

    const flipAmountWei = parseEther(FLIP_AMOUNT);

    const txHash = await walletClient.writeContract({
      address: COINFLIP_CONTRACT,
      abi: COINFLIP_ABI,
      functionName: 'flip',
      value: flipAmountWei,
    });

    console.log(`[Coinflip] Flip TX: ${txHash}`);

    // Wait for receipt and get result
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse the FlipResult event to get the outcome
    let flipWon = false;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: COINFLIP_ABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'FlipResult') {
          flipWon = decoded.args.won;
          break;
        }
      } catch {
        // Not our event, continue
      }
    }

    // Map flip result to heads/tails
    // won = true -> heads, won = false -> tails (arbitrary mapping)
    const result: CoinflipPrediction = flipWon ? 'heads' : 'tails';

    console.log(`[Coinflip] Flip result: ${result.toUpperCase()} (won: ${flipWon})`);

    // Resolve the round
    const resolution = await resolveRound(result, txHash);

    if (!resolution) {
      return NextResponse.json(
        { success: false, error: 'Failed to resolve round' },
        { status: 500 }
      );
    }

    // Update agent stats and record world events
    for (const winner of resolution.winners) {
      await updateAgentStats(winner.agentAddress, true, winner.betAmount, winner.totalPayout);
      // Record win event (triggers celebration in AgentWorld)
      await addEvent({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'action',
        agent: winner.agentAddress,
        agentName: winner.agentName,
        description: `Executed coinflip_win (+${winner.winnings} EMPTOURS)`,
        txHash,
        timestamp: Date.now(),
      }).catch(() => {});
    }
    for (const loserAddr of resolution.losers) {
      const loserBet = round.bets.find(b => b.agentAddress === loserAddr);
      if (loserBet) {
        await updateAgentStats(loserAddr, false, loserBet.amount, '0');
        // Record loss event
        await addEvent({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'action',
          agent: loserAddr,
          agentName: loserBet.agentName,
          description: `Executed coinflip_lose (-${loserBet.amount} EMPTOURS)`,
          txHash,
          timestamp: Date.now(),
        }).catch(() => {});
      }
    }

    // Calculate and distribute TOURS consolation prizes to losers
    const consolationPrizes = calculateConsolationPrizes(round, result, txHash);
    resolution.consolationPrizes = consolationPrizes;

    // Distribute TOURS to losers (uses tx hash as entropy for random 1-5x multiplier)
    const consolationTxHashes: string[] = [];
    for (const prize of consolationPrizes) {
      try {
        const prizeWei = parseEther(prize.amount);
        const prizeTxHash = await walletClient.writeContract({
          address: TOURS_TOKEN,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [prize.agentAddress as `0x${string}`, prizeWei],
        });
        consolationTxHashes.push(prizeTxHash);
        console.log(`[Coinflip] Sent ${prize.amount} TOURS (${prize.multiplier}x) to ${prize.agentName}: ${prizeTxHash}`);
      } catch (err: any) {
        console.error(`[Coinflip] Failed to send consolation to ${prize.agentName}:`, err.message);
      }
    }

    // Discord notification for results
    const winnersText = resolution.winners.length > 0
      ? resolution.winners.map(w => `• ${w.agentName}: +${w.winnings} EMPTOURS`).join('\n')
      : 'No winners this round';

    const consolationText = consolationPrizes.length > 0
      ? consolationPrizes.map(p => `• ${p.agentName}: +${p.amount} TOURS (${p.multiplier}x)`).join('\n')
      : '';

    const losersSection = resolution.losers.length > 0
      ? `🎁 **Consolation Prizes (TOURS):**\n${consolationText}`
      : '';

    await notifyDiscord(
      `🎲 **Coinflip Round ${round.id} - ${result.toUpperCase()} WINS!**\n\n` +
      `💰 **Winners:**\n${winnersText}\n\n` +
      `${losersSection}\n\n` +
      `[View TX](https://monadscan.com/tx/${txHash})`
    ).catch(console.error);

    // Create new round for next hour
    const newRound = await createNewRound();

    return NextResponse.json({
      success: true,
      result: resolution,
      newRound: {
        id: newRound.id,
        closesAt: newRound.closesAt,
      },
      txHash,
    });
  } catch (err: any) {
    console.error('[Coinflip] Execute error:', err);

    // Notify Discord of error
    await notifyDiscord(
      `❌ **Coinflip Execution Failed**\n` +
      `Error: ${err.message || 'Unknown error'}`
    ).catch(console.error);

    return NextResponse.json(
      { success: false, error: 'Failed to execute flip: ' + (err.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
