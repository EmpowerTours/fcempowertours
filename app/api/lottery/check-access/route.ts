import { NextRequest, NextResponse } from 'next/server';
import { checkUserAccess, getTodayPool, LOTTERY_CONFIG } from '@/lib/lottery';

export async function GET(req: NextRequest) {
  try {
    // Check if lottery is enabled
    if (!LOTTERY_CONFIG.ENABLED) {
      return NextResponse.json({
        success: true,
        enabled: false,
        hasAccess: true, // Grant access when lottery is disabled (no paywall)
        message: 'Lottery feature is currently disabled - access granted',
      });
    }

    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing address parameter' },
        { status: 400 }
      );
    }

    const access = await checkUserAccess(userAddress);
    const todayPool = await getTodayPool();

    if (access.hasAccess) {
      const hoursRemaining = Math.ceil(
        (access.expiresAt! - Date.now()) / (1000 * 60 * 60)
      );
      const minutesRemaining = Math.ceil(
        (access.expiresAt! - Date.now()) / (1000 * 60)
      );

      return NextResponse.json({
        success: true,
        hasAccess: true,
        expiresAt: access.expiresAt,
        hoursRemaining,
        minutesRemaining,
        payment: access.payment,
        todayPool: todayPool ? {
          totalPool: todayPool.totalPool,
          participantCount: todayPool.participantCount,
          status: todayPool.status,
        } : null,
      });
    }

    return NextResponse.json({
      success: true,
      hasAccess: false,
      accessFee: LOTTERY_CONFIG.ACCESS_FEE_ETH,
      paymentAddress: LOTTERY_CONFIG.BOT_WALLET_ADDRESS,
      network: LOTTERY_CONFIG.NETWORK,
      todayPool: todayPool ? {
        totalPool: todayPool.totalPool,
        participantCount: todayPool.participantCount,
        status: todayPool.status,
      } : null,
      message: `Pay ${LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH on Base to gain 24-hour access`,
    });

  } catch (error: any) {
    console.error('[LOTTERY] Error checking access:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
