import { NextRequest, NextResponse } from 'next/server';
import { getUserSafeInfo, publicClient } from '@/lib/user-safe';
import { isUserSafeMode, getSafeModeLabel, MIN_SAFE_BALANCE, RECOMMENDED_SAFE_BALANCE } from '@/lib/safe-mode';
import { Address, parseAbi } from 'viem';

const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;

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

    // Also get WMON balance of Safe
    let wmonBalance = '0';
    let wmonBalanceWei = '0';
    if (WMON_ADDRESS) {
      try {
        const balance = await publicClient.readContract({
          address: WMON_ADDRESS,
          abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [safeInfo.safeAddress],
        }) as bigint;
        wmonBalance = (Number(balance) / 1e18).toFixed(4);
        wmonBalanceWei = balance.toString();
      } catch (e) {
        console.error('Failed to get WMON balance:', e);
      }
    }

    const isAdequatelyFunded = parseFloat(safeInfo.balance) >= RECOMMENDED_SAFE_BALANCE;

    return NextResponse.json({
      success: true,
      mode: getSafeModeLabel(),
      userSafesEnabled: isUserSafeMode(),
      safeAddress: safeInfo.safeAddress,
      isDeployed: safeInfo.isDeployed,
      balance: safeInfo.balance,
      balanceWei: safeInfo.balanceWei.toString(),
      wmonBalance,
      wmonBalanceWei,
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
