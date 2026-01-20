import { NextRequest, NextResponse } from 'next/server';
import {
  LOTTERY_CONFIG,
  checkUserAccess,
  recordAccessPayment,
  verifyPaymentOnBase,
} from '@/lib/lottery';

export async function POST(req: NextRequest) {
  try {
    // Check if lottery is enabled
    if (!LOTTERY_CONFIG.ENABLED) {
      return NextResponse.json(
        { success: false, error: 'Lottery feature is currently disabled' },
        { status: 503 }
      );
    }

    const { userAddress, txHash, fid, username } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress' },
        { status: 400 }
      );
    }

    if (!txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing txHash' },
        { status: 400 }
      );
    }

    console.log(`[LOTTERY] Processing access payment from ${userAddress}`);
    console.log(`[LOTTERY] TX Hash: ${txHash}`);

    // Check if user already has access
    const existingAccess = await checkUserAccess(userAddress);
    if (existingAccess.hasAccess) {
      const hoursRemaining = Math.ceil(
        (existingAccess.expiresAt! - Date.now()) / (1000 * 60 * 60)
      );
      return NextResponse.json({
        success: true,
        alreadyHasAccess: true,
        expiresAt: existingAccess.expiresAt,
        message: `You already have access for ${hoursRemaining} more hours`,
      });
    }

    // Verify payment on Base network
    console.log(`[LOTTERY] Verifying payment on Base...`);
    const verification = await verifyPaymentOnBase(txHash, LOTTERY_CONFIG.ACCESS_FEE_ETH);

    if (!verification.verified) {
      console.log(`[LOTTERY] Payment verification failed: ${verification.error}`);
      return NextResponse.json(
        {
          success: false,
          error: verification.error || 'Payment verification failed',
          details: {
            expectedAmount: LOTTERY_CONFIG.ACCESS_FEE_ETH,
            expectedRecipient: LOTTERY_CONFIG.BOT_WALLET_ADDRESS,
            network: 'Base',
          }
        },
        { status: 400 }
      );
    }

    console.log(`[LOTTERY] Payment verified! From: ${verification.from}, Amount: ${verification.amount} ETH`);

    // Record the access payment
    const payment = await recordAccessPayment({
      userAddress,
      fid,
      username,
      txHash,
      amountETH: verification.amount!,
    });

    console.log(`[LOTTERY] Access granted until ${new Date(payment.expiresAt).toISOString()}`);
    console.log(`[LOTTERY] Lottery contribution: ${payment.lotteryContribution} ETH`);
    console.log(`[LOTTERY] Treasury contribution: ${payment.treasuryContribution} ETH`);

    return NextResponse.json({
      success: true,
      payment: {
        txHash: payment.txHash,
        amountETH: payment.amountETH,
        lotteryContribution: payment.lotteryContribution,
        treasuryContribution: payment.treasuryContribution,
        expiresAt: payment.expiresAt,
        lotteryDay: payment.lotteryDay,
      },
      message: `Access granted for 24 hours! ${payment.lotteryContribution} ETH added to today's lottery pool.`,
    });

  } catch (error: any) {
    console.error('[LOTTERY] Error processing payment:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process payment' },
      { status: 500 }
    );
  }
}

// GET: Get payment instructions
export async function GET() {
  return NextResponse.json({
    accessFee: LOTTERY_CONFIG.ACCESS_FEE_ETH,
    network: LOTTERY_CONFIG.NETWORK,
    paymentAddress: LOTTERY_CONFIG.BOT_WALLET_ADDRESS,
    accessDuration: `${LOTTERY_CONFIG.ACCESS_DURATION_HOURS} hours`,
    lotteryShare: `${LOTTERY_CONFIG.LOTTERY_SHARE * 100}%`,
    treasuryShare: `${LOTTERY_CONFIG.TREASURY_SHARE * 100}%`,
    instructions: [
      `1. Send ${LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH to ${LOTTERY_CONFIG.BOT_WALLET_ADDRESS} on Base`,
      '2. Copy the transaction hash',
      '3. Submit the hash to /api/lottery/pay-access with your wallet address',
      '4. Access granted for 24 hours!',
      '5. You are automatically entered into today\'s lottery',
    ],
  });
}
