import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { createPublicClient, http, parseEther, formatEther, verifyMessage } from 'viem';
import { activeChain } from '@/app/chains';
import { getUserSafeInfo } from '@/lib/user-safe';

// Lottery contract for reading ticket price
const DAILY_LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_DAILY_LOTTERY as `0x${string}` | undefined;

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
const walletKey = (discordId: string) => `discord:wallet:${discordId}`;
const challengeKey = (discordId: string) => `discord:challenge:${discordId}`;

/**
 * GET /api/discord/balance?discordId=...
 * Returns user's internal MON balance and linked wallet
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
    const linkedWallet = await redis.get<string>(walletKey(discordId));

    return NextResponse.json({
      success: true,
      discordId,
      balanceWei,
      balanceMon,
      linkedWallet: linkedWallet || null,
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
 * Actions: link_wallet, verify_signature, deposit, withdraw, buy_lottery
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, discordId, txHash, amount, toAddress, ticketCount, roundId, walletAddress, signature } = body;

    if (!discordId) {
      return NextResponse.json(
        { success: false, error: 'Missing discordId' },
        { status: 400 }
      );
    }

    // ==================== LINK WALLET (Step 1: Generate Challenge) ====================
    if (action === 'link_wallet') {
      if (!walletAddress) {
        return NextResponse.json(
          { success: false, error: 'Missing walletAddress' },
          { status: 400 }
        );
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return NextResponse.json(
          { success: false, error: 'Invalid wallet address format' },
          { status: 400 }
        );
      }

      // Generate a unique challenge message
      const timestamp = Date.now();
      const challenge = `EmpowerTours Wallet Verification\n\nDiscord ID: ${discordId}\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\n\nSign this message to link your wallet.`;

      // Store challenge with 10 minute expiry
      await redis.set(challengeKey(discordId), JSON.stringify({
        walletAddress: walletAddress.toLowerCase(),
        challenge,
        timestamp,
      }), { ex: 600 }); // 10 min expiry

      console.log(`[Discord Link] Challenge generated for ${discordId} → ${walletAddress}`);

      return NextResponse.json({
        success: true,
        message: 'Sign this message with your wallet',
        challenge,
        walletAddress,
        expiresIn: '10 minutes',
      });
    }

    // ==================== VERIFY SIGNATURE (Step 2: Complete Linking) ====================
    if (action === 'verify_signature') {
      if (!signature) {
        return NextResponse.json(
          { success: false, error: 'Missing signature' },
          { status: 400 }
        );
      }

      // Get pending challenge (Upstash auto-deserializes JSON)
      const challengeData = await redis.get<{ walletAddress: string; challenge: string; timestamp: number }>(challengeKey(discordId));
      if (!challengeData) {
        return NextResponse.json(
          { success: false, error: 'No pending wallet link. Use "link wallet 0x..." first.' },
          { status: 400 }
        );
      }

      const { walletAddress, challenge } = challengeData;

      // Verify signature
      try {
        const isValid = await verifyMessage({
          address: walletAddress as `0x${string}`,
          message: challenge,
          signature: signature as `0x${string}`,
        });

        if (!isValid) {
          return NextResponse.json(
            { success: false, error: 'Invalid signature. Make sure you signed with the correct wallet.' },
            { status: 400 }
          );
        }

        // Link wallet to Discord ID
        await redis.set(walletKey(discordId), walletAddress.toLowerCase());
        await redis.del(challengeKey(discordId)); // Clean up challenge

        console.log(`[Discord Link] Wallet linked: ${discordId} → ${walletAddress}`);

        return NextResponse.json({
          success: true,
          message: `Wallet ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} linked successfully!`,
          linkedWallet: walletAddress,
        });
      } catch (verifyErr: any) {
        console.error('[Discord Link] Signature verification error:', verifyErr);
        return NextResponse.json(
          { success: false, error: 'Signature verification failed' },
          { status: 400 }
        );
      }
    }

    // ==================== CONFIRM DEPOSIT ====================
    if (action === 'deposit') {
      if (!txHash) {
        return NextResponse.json(
          { success: false, error: 'Missing txHash' },
          { status: 400 }
        );
      }

      // Check if user has linked wallet
      const linkedWallet = await redis.get<string>(walletKey(discordId));
      if (!linkedWallet) {
        return NextResponse.json({
          success: false,
          error: 'No wallet linked. First use "link wallet 0x..." to link your wallet for security.',
        }, { status: 400 });
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

        // ✅ SECURITY: Verify sender matches linked wallet
        if (tx.from.toLowerCase() !== linkedWallet.toLowerCase()) {
          return NextResponse.json({
            success: false,
            error: `Transaction must be from your linked wallet (${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}). This tx is from ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}.`,
          }, { status: 400 });
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
          from: tx.from.toLowerCase(),
          amount: depositAmount.toString(),
          timestamp: Date.now(),
        }));

        const depositMon = formatEther(depositAmount);
        const newBalanceMon = formatEther(BigInt(newBalance));

        console.log(`[Discord Deposit] ${discordId} deposited ${depositMon} MON from ${tx.from} (tx: ${txHash})`);

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
      console.log('[Discord Lottery] buy_lottery action received:', { discordId, ticketCount, roundId });

      const tickets = ticketCount || 1;

      // Read ticket price from contract (or fallback to 5 MON)
      let ticketPriceWei = parseEther('5'); // Default 5 MON
      if (DAILY_LOTTERY_ADDRESS) {
        try {
          console.log('[Discord Lottery] Reading ticket price from contract:', DAILY_LOTTERY_ADDRESS);
          const priceResult = await client.readContract({
            address: DAILY_LOTTERY_ADDRESS,
            abi: [{ name: 'ticketPrice', type: 'function', inputs: [], outputs: [{ type: 'uint256' }] }],
            functionName: 'ticketPrice',
          });
          ticketPriceWei = priceResult as bigint;
          console.log('[Discord Lottery] Ticket price from contract:', formatEther(ticketPriceWei), 'MON');
        } catch (e: any) {
          console.error('[Discord Lottery] Failed to read ticket price:', e.message);
          console.log('[Discord Lottery] Using fallback ticket price: 5 MON');
        }
      } else {
        console.warn('[Discord Lottery] DAILY_LOTTERY_ADDRESS not configured');
      }
      const totalCostWei = ticketPriceWei * BigInt(tickets);

      const currentBalance = await redis.get<string>(balanceKey(discordId)) || '0';
      console.log('[Discord Lottery] User balance:', formatEther(BigInt(currentBalance)), 'MON, need:', formatEther(totalCostWei), 'MON');

      if (BigInt(currentBalance) < totalCostWei) {
        const needed = formatEther(totalCostWei);
        const have = formatEther(BigInt(currentBalance));
        console.warn('[Discord Lottery] Insufficient balance');
        return NextResponse.json({
          success: false,
          error: `Insufficient balance. Need ${needed} MON, have ${have} MON. Use "deposit" to add funds.`,
        }, { status: 400 });
      }

      // Deduct from user's balance
      const newBalance = (BigInt(currentBalance) - totalCostWei).toString();
      await redis.set(balanceKey(discordId), newBalance);
      console.log('[Discord Lottery] Balance deducted, new balance:', formatEther(BigInt(newBalance)), 'MON');

      // Buy tickets using agent's wallet via execute-delegated
      const APP_URL = process.env.NEXT_PUBLIC_URL;
      console.log('[Discord Lottery] Calling execute-delegated:', `${APP_URL}/api/execute-delegated`);

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

      console.log('[Discord Lottery] execute-delegated response status:', buyRes.status);
      const buyResult = await buyRes.json();
      console.log('[Discord Lottery] execute-delegated result:', { success: buyResult.success, error: buyResult.error, txHash: buyResult.txHash?.slice(0, 10) });

      if (!buyResult.success) {
        // Refund on failure
        await redis.set(balanceKey(discordId), currentBalance);
        console.error('[Discord Lottery] Purchase failed, refunded balance');
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

      console.log(`[Discord Lottery] SUCCESS: ${discordId} bought ${tickets} tickets for ${costMon} MON, tx: ${buyResult.txHash}`);

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

    // ==================== GET SAFE INFO ====================
    if (action === 'get_safe_info') {
      // Check if user has linked wallet
      const linkedWallet = await redis.get<string>(walletKey(discordId));
      if (!linkedWallet) {
        return NextResponse.json({
          success: false,
          error: 'No wallet linked. Use "link wallet" first to connect your wallet.',
        }, { status: 400 });
      }

      try {
        const safeInfo = await getUserSafeInfo(linkedWallet);

        return NextResponse.json({
          success: true,
          linkedWallet,
          safeAddress: safeInfo.safeAddress,
          balance: safeInfo.balance,
          balanceWei: safeInfo.balanceWei.toString(),
          isDeployed: safeInfo.isDeployed,
          isFunded: safeInfo.isFunded,
          minRequired: safeInfo.minRequired,
        });
      } catch (err: any) {
        console.error('[Discord Balance] Safe info error:', err);
        return NextResponse.json({
          success: false,
          error: 'Failed to get Safe info: ' + err.message,
        }, { status: 500 });
      }
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
      { success: false, error: 'Invalid action. Use: link_wallet, verify_signature, deposit, buy_lottery, withdraw, get_safe_info' },
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
