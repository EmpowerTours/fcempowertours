import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { activeChain } from '@/app/chains';

const redis = Redis.fromEnv();

const client = createPublicClient({
  chain: activeChain,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// Agent's wallet address - where users deposit MON
const AGENT_WALLET = '0x868469E5D124f81cf63e1A3808795649cA6c3D77';

// Redis key helpers
const balanceKey = (discordId: string) => `discord:balance:${discordId}`;
const depositKey = (txHash: string) => `discord:deposit:${txHash.toLowerCase()}`;
const ticketsKey = (roundId: string, discordId: string) => `discord:tickets:${roundId}:${discordId}`;

/**
 * GET /api/discord/balance?discordId=...
 * Returns user's internal MON balance
 */
export async function GET(req: NextRequest) {
  try {
    const discordId = req.nextUrl.searchParams.get('discordId');

    if (!discordId) {
      return NextResponse.json(
        { success: false, error: 'Missing discordId parameter' },
        { status: 400 }
      );
    }

    const balanceWei = await redis.get<string>(balanceKey(discordId)) || '0';
    const balanceMon = formatEther(BigInt(balanceWei));

    return NextResponse.json({
      success: true,
      discordId,
      balanceWei,
      balanceMon,
    });
  } catch (err: any) {
    console.error('[Discord Balance] GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/discord/balance
 * Actions: deposit (confirm), withdraw, buy_lottery
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, discordId, txHash, amount, toAddress, ticketCount, roundId } = body;

    if (!discordId) {
      return NextResponse.json(
        { success: false, error: 'Missing discordId' },
        { status: 400 }
      );
    }

    // ==================== CONFIRM DEPOSIT ====================
    if (action === 'deposit') {
      if (!txHash) {
        return NextResponse.json(
          { success: false, error: 'Missing txHash' },
          { status: 400 }
        );
      }

      // Check if deposit already processed
      const existingDeposit = await redis.get(depositKey(txHash));
      if (existingDeposit) {
        return NextResponse.json(
          { success: false, error: 'Deposit already credited' },
          { status: 400 }
        );
      }

      // Verify transaction on-chain
      try {
        const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
        const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

        if (!receipt || receipt.status !== 'success') {
          return NextResponse.json(
            { success: false, error: 'Transaction not confirmed or failed' },
            { status: 400 }
          );
        }

        // Verify recipient is agent wallet
        if (tx.to?.toLowerCase() !== AGENT_WALLET.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: `Transaction must be sent to ${AGENT_WALLET}` },
            { status: 400 }
          );
        }

        const depositAmount = tx.value;
        if (depositAmount <= 0n) {
          return NextResponse.json(
            { success: false, error: 'No MON value in transaction' },
            { status: 400 }
          );
        }

        // Credit user's balance
        const currentBalance = await redis.get<string>(balanceKey(discordId)) || '0';
        const newBalance = (BigInt(currentBalance) + depositAmount).toString();

        await redis.set(balanceKey(discordId), newBalance);
        await redis.set(depositKey(txHash), JSON.stringify({
          discordId,
          amount: depositAmount.toString(),
          timestamp: Date.now(),
        }));

        const depositMon = formatEther(depositAmount);
        const newBalanceMon = formatEther(BigInt(newBalance));

        console.log(`[Discord Deposit] ${discordId} deposited ${depositMon} MON (tx: ${txHash})`);

        return NextResponse.json({
          success: true,
          message: `Deposited ${depositMon} MON`,
          depositAmount: depositMon,
          newBalance: newBalanceMon,
          txHash,
        });
      } catch (txErr: any) {
        console.error('[Discord Deposit] TX verification error:', txErr);
        return NextResponse.json(
          { success: false, error: 'Failed to verify transaction. Make sure the tx is confirmed.' },
          { status: 400 }
        );
      }
    }

    // ==================== BUY LOTTERY TICKETS ====================
    if (action === 'buy_lottery') {
      const tickets = ticketCount || 1;
      const ticketPriceWei = parseEther('2'); // 2 WMON per ticket
      const totalCostWei = ticketPriceWei * BigInt(tickets);

      const currentBalance = await redis.get<string>(balanceKey(discordId)) || '0';

      if (BigInt(currentBalance) < totalCostWei) {
        const needed = formatEther(totalCostWei);
        const have = formatEther(BigInt(currentBalance));
        return NextResponse.json({
          success: false,
          error: `Insufficient balance. Need ${needed} MON, have ${have} MON. Use "deposit" to add funds.`,
        }, { status: 400 });
      }

      // Deduct from user's balance
      const newBalance = (BigInt(currentBalance) - totalCostWei).toString();
      await redis.set(balanceKey(discordId), newBalance);

      // Buy tickets using agent's wallet via execute-delegated
      const APP_URL = process.env.NEXT_PUBLIC_URL;
      const buyRes = await fetch(`${APP_URL}/api/execute-delegated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: AGENT_WALLET,
          action: 'daily_lottery_buy',
          params: { ticketCount: tickets },
          fid: '0',
        }),
      });

      const buyResult = await buyRes.json();

      if (!buyResult.success) {
        // Refund on failure
        await redis.set(balanceKey(discordId), currentBalance);
        return NextResponse.json({
          success: false,
          error: `Failed to buy tickets: ${buyResult.error}`,
        }, { status: 500 });
      }

      // Track tickets owned by this Discord user for this round
      const currentRoundId = roundId || '1'; // TODO: Get from lottery API
      const userTickets = await redis.get<number>(ticketsKey(currentRoundId, discordId)) || 0;
      await redis.set(ticketsKey(currentRoundId, discordId), userTickets + tickets);

      const costMon = formatEther(totalCostWei);
      const newBalanceMon = formatEther(BigInt(newBalance));

      console.log(`[Discord Lottery] ${discordId} bought ${tickets} tickets for ${costMon} MON`);

      return NextResponse.json({
        success: true,
        message: `Bought ${tickets} lottery ticket(s)!`,
        ticketCount: tickets,
        cost: costMon,
        newBalance: newBalanceMon,
        txHash: buyResult.txHash,
        roundId: currentRoundId,
      });
    }

    // ==================== WITHDRAW ====================
    if (action === 'withdraw') {
      if (!amount || !toAddress) {
        return NextResponse.json(
          { success: false, error: 'Missing amount or toAddress' },
          { status: 400 }
        );
      }

      // Validate address
      if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
        return NextResponse.json(
          { success: false, error: 'Invalid withdrawal address' },
          { status: 400 }
        );
      }

      const withdrawWei = parseEther(amount.toString());
      const currentBalance = await redis.get<string>(balanceKey(discordId)) || '0';

      if (BigInt(currentBalance) < withdrawWei) {
        const have = formatEther(BigInt(currentBalance));
        return NextResponse.json({
          success: false,
          error: `Insufficient balance. Have ${have} MON, trying to withdraw ${amount} MON.`,
        }, { status: 400 });
      }

      // Deduct from balance first
      const newBalance = (BigInt(currentBalance) - withdrawWei).toString();
      await redis.set(balanceKey(discordId), newBalance);

      // Execute withdrawal via agent wallet
      const APP_URL = process.env.NEXT_PUBLIC_URL;
      const withdrawRes = await fetch(`${APP_URL}/api/execute-delegated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: AGENT_WALLET,
          action: 'send_mon',
          params: {
            to: toAddress,
            amount: amount.toString(),
          },
          fid: '0',
        }),
      });

      const withdrawResult = await withdrawRes.json();

      if (!withdrawResult.success) {
        // Refund on failure
        await redis.set(balanceKey(discordId), currentBalance);
        return NextResponse.json({
          success: false,
          error: `Withdrawal failed: ${withdrawResult.error}`,
        }, { status: 500 });
      }

      const newBalanceMon = formatEther(BigInt(newBalance));

      console.log(`[Discord Withdraw] ${discordId} withdrew ${amount} MON to ${toAddress}`);

      return NextResponse.json({
        success: true,
        message: `Withdrew ${amount} MON to ${toAddress}`,
        amount,
        toAddress,
        newBalance: newBalanceMon,
        txHash: withdrawResult.txHash,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use: deposit, buy_lottery, withdraw' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[Discord Balance] POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Operation failed' },
      { status: 500 }
    );
  }
}
