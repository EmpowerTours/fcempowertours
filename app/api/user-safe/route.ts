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

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Safe info fetch timed out after 30s')), 30000)
    );

    const safeInfo = await Promise.race([
      getUserSafeInfo(address),
      timeoutPromise
    ]);

    // Also get WMON and TOURS balances of Safe + wallet TOURS balance
    let wmonBalance = '0';
    let wmonBalanceWei = '0';
    let toursBalance = '0';
    let toursBalanceWei = '0';
    let toursWalletBalance = '0';
    let toursWalletBalanceWei = '0';

    // Is the Safe already an authorised minter on the passport? The client needs
    // this to decide whether calling /api/register-user-safe is worth a wallet
    // signature: registration is a one-time on-chain write, and re-requesting a
    // signature on every later mint just to be told "already_registered" is pure
    // friction. Read-only and unauthenticated, like the balances beside it.
    let isRegisteredAsMinter = false;
    const PASSPORT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address;

    const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
    const erc20BalanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);

    const balancePromises: Promise<void>[] = [];

    if (PASSPORT_ADDRESS) {
      balancePromises.push(
        publicClient.readContract({
          address: PASSPORT_ADDRESS,
          abi: parseAbi(['function authorizedMinters(address) view returns (bool)']),
          functionName: 'authorizedMinters',
          args: [safeInfo.safeAddress],
        }).then((ok) => {
          isRegisteredAsMinter = ok as boolean;
        }).catch(() => {
          // Leave it false. A failed read must not claim the Safe is registered
          // when it is not — that would skip registration and revert the mint.
        })
      );
    }

    if (WMON_ADDRESS) {
      balancePromises.push(
        publicClient.readContract({
          address: WMON_ADDRESS,
          abi: erc20BalanceAbi,
          functionName: 'balanceOf',
          args: [safeInfo.safeAddress],
        }).then((balance) => {
          wmonBalance = (Number(balance as bigint) / 1e18).toFixed(4);
          wmonBalanceWei = (balance as bigint).toString();
        }).catch((e) => {
          console.error('Failed to get WMON balance:', e);
        })
      );
    }

    if (TOURS_ADDRESS) {
      // Safe TOURS balance
      balancePromises.push(
        publicClient.readContract({
          address: TOURS_ADDRESS,
          abi: erc20BalanceAbi,
          functionName: 'balanceOf',
          args: [safeInfo.safeAddress],
        }).then((balance) => {
          toursBalance = (Number(balance as bigint) / 1e18).toFixed(4);
          toursBalanceWei = (balance as bigint).toString();
        }).catch((e) => {
          console.error('Failed to get Safe TOURS balance:', e);
        })
      );

      // Wallet TOURS balance (radio rewards are sent here)
      balancePromises.push(
        publicClient.readContract({
          address: TOURS_ADDRESS,
          abi: erc20BalanceAbi,
          functionName: 'balanceOf',
          args: [address as Address],
        }).then((balance) => {
          toursWalletBalance = (Number(balance as bigint) / 1e18).toFixed(4);
          toursWalletBalanceWei = (balance as bigint).toString();
        }).catch((e) => {
          console.error('Failed to get wallet TOURS balance:', e);
        })
      );
    }

    await Promise.all(balancePromises);

    const isAdequatelyFunded = parseFloat(safeInfo.balance) >= RECOMMENDED_SAFE_BALANCE;

    return NextResponse.json({
      success: true,
      mode: getSafeModeLabel(),
      userSafesEnabled: isUserSafeMode(),
      safeAddress: safeInfo.safeAddress,
      isDeployed: safeInfo.isDeployed,
      isRegisteredAsMinter,
      balance: safeInfo.balance,
      balanceWei: safeInfo.balanceWei.toString(),
      wmonBalance,
      wmonBalanceWei,
      toursBalance,
      toursBalanceWei,
      toursWalletBalance,
      toursWalletBalanceWei,
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
