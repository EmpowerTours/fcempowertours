import { NextRequest, NextResponse } from 'next/server';
import { recordAccessPayment, LOTTERY_CONFIG } from '@/lib/lottery';

// Configuration
const BOT_WALLET = '0x2d5dd9aa1dc42949d203d1946d599ba47f0b6d1c';
const MIN_PAYMENT_ETH = 0.001;
const PAYMENT_WINDOW_MINUTES = 60; // Look back 60 minutes for payments

export async function POST(req: NextRequest) {
  try {
    // Check if lottery is enabled
    if (!LOTTERY_CONFIG.ENABLED) {
      return NextResponse.json(
        { success: false, error: 'Lottery feature is currently disabled' },
        { status: 503 }
      );
    }

    const { userAddress, fid, username } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing user address' },
        { status: 400 }
      );
    }

    console.log(`🔍 Verifying payment for ${userAddress} (FID: ${fid})`);

    // Fetch recent transactions to bot wallet from this user on Base
    const transactions = await fetchRecentTransactions(userAddress.toLowerCase(), BOT_WALLET.toLowerCase());

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No payments found from your wallet to ${BOT_WALLET.slice(0, 10)}... in the last ${PAYMENT_WINDOW_MINUTES} minutes. Please send ${MIN_PAYMENT_ETH} ETH on Base and try again.`,
      });
    }

    // Find a valid payment (>= minimum amount, recent enough)
    const validPayment = transactions.find((tx: any) => {
      const valueEth = Number(tx.value) / 1e18;
      return valueEth >= MIN_PAYMENT_ETH;
    });

    if (!validPayment) {
      const highestPayment = Math.max(...transactions.map((tx: any) => Number(tx.value) / 1e18));
      return NextResponse.json({
        success: false,
        error: `Found ${transactions.length} transaction(s), but none meet the minimum ${MIN_PAYMENT_ETH} ETH. Highest found: ${highestPayment.toFixed(6)} ETH`,
      });
    }

    const paymentAmountETH = Number(validPayment.value) / 1e18;
    const txHash = validPayment.hash;

    console.log(`✅ Valid payment found: ${paymentAmountETH} ETH, tx: ${txHash}`);

    // Record the payment in our lottery system
    const payment = await recordAccessPayment({
      userAddress,
      fid: fid || 0,
      username: username || 'unknown',
      txHash,
      amountETH: paymentAmountETH,
    });

    return NextResponse.json({
      success: true,
      message: `Access granted for 24 hours! ${payment.lotteryContribution.toFixed(6)} ETH added to lottery pool.`,
      txHash,
      amountETH: paymentAmountETH,
      lotteryContribution: payment.lotteryContribution,
      expiresAt: payment.expiresAt,
    });

  } catch (error: any) {
    console.error('❌ Verify payment error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Verification failed' },
      { status: 500 }
    );
  }
}

// Fetch recent transactions from user to bot wallet on Base
async function fetchRecentTransactions(fromAddress: string, toAddress: string): Promise<any[]> {
  try {
    // Use Blockscout API for Base (free, no API key needed)
    const url = `https://base.blockscout.com/api/v2/addresses/${toAddress}/transactions?filter=to`;

    console.log(`📡 Fetching transactions from Blockscout: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Blockscout API error:', response.status, response.statusText);
      // Fall back to Base RPC method
      return await fetchTransactionsViaRPC(fromAddress, toAddress);
    }

    const data = await response.json();
    const transactions = data.items || [];

    // Filter for transactions from user in the last PAYMENT_WINDOW_MINUTES
    const cutoffTime = Date.now() - (PAYMENT_WINDOW_MINUTES * 60 * 1000);

    const relevantTxs = transactions.filter((tx: any) => {
      const txFrom = tx.from?.hash?.toLowerCase();
      const txTime = new Date(tx.timestamp).getTime();
      const isFromUser = txFrom === fromAddress;
      const isRecent = txTime > cutoffTime;
      const hasValue = BigInt(tx.value || '0') > 0n;

      return isFromUser && isRecent && hasValue;
    });

    console.log(`📊 Found ${relevantTxs.length} relevant transactions from ${fromAddress}`);

    return relevantTxs;
  } catch (error) {
    console.error('Error fetching from Blockscout:', error);
    // Try fallback
    return await fetchTransactionsViaRPC(fromAddress, toAddress);
  }
}

// Fallback: Check last few blocks for transactions
async function fetchTransactionsViaRPC(fromAddress: string, toAddress: string): Promise<any[]> {
  try {
    console.log('📡 Fallback: Checking via Base RPC...');

    // Get latest block number
    const blockResponse = await fetch('https://mainnet.base.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const blockData = await blockResponse.json();
    const latestBlock = parseInt(blockData.result, 16);

    // Check last ~300 blocks (~10 minutes on Base with 2s blocks)
    const transactions: any[] = [];
    const blocksToCheck = 300;

    for (let i = 0; i < blocksToCheck; i += 50) {
      const blockNum = latestBlock - i;
      const blockHex = '0x' + blockNum.toString(16);

      const txResponse = await fetch('https://mainnet.base.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [blockHex, true],
          id: 1,
        }),
      });

      const txData = await txResponse.json();
      const block = txData.result;

      if (block && block.transactions) {
        const relevantTxs = block.transactions.filter((tx: any) => {
          return (
            tx.from?.toLowerCase() === fromAddress &&
            tx.to?.toLowerCase() === toAddress &&
            BigInt(tx.value || '0') > 0n
          );
        });

        transactions.push(...relevantTxs);
      }
    }

    return transactions;
  } catch (error) {
    console.error('RPC fallback error:', error);
    return [];
  }
}
