import { NextRequest, NextResponse } from 'next/server';
import { getUserSafeInfo } from '@/lib/user-safe';
import { isUserSafeMode, getSafeModeLabel, MIN_SAFE_BALANCE, RECOMMENDED_SAFE_BALANCE } from '@/lib/safe-mode';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter required' },
        { status: 400 }
      );
    }

    console.log('📊 [USER-SAFE] Getting Safe info for:', address);

    const safeInfo = await getUserSafeInfo(address);

    const isAdequatelyFunded = parseFloat(safeInfo.balance) >= RECOMMENDED_SAFE_BALANCE;

    return NextResponse.json({
      success: true,
      mode: getSafeModeLabel(),
      userSafesEnabled: isUserSafeMode(),
      safeAddress: safeInfo.safeAddress,
      isDeployed: safeInfo.isDeployed,
      balance: safeInfo.balance,
      balanceWei: safeInfo.balanceWei.toString(),
      isFunded: safeInfo.isFunded,
      isAdequatelyFunded,
      minRequired: safeInfo.minRequired,
      recommendedBalance: RECOMMENDED_SAFE_BALANCE.toString(),
      fundingInstructions: safeInfo.isFunded
        ? null
        : `Send at least ${MIN_SAFE_BALANCE} MON to ${safeInfo.safeAddress} to enable gasless transactions.`,
    });
  } catch (error: any) {
    console.error('❌ [USER-SAFE] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
