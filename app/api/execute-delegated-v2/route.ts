/**
 * Execute Delegated V2 - User-Funded Safe Version
 * 
 * This route uses the user's own Safe (funded by them) instead of the bot's Safe.
 * Gas is paid from user's Safe balance.
 * 
 * To use: Set NEXT_PUBLIC_USE_USER_SAFES=true and call /api/execute-delegated-v2
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendUserSafeTransaction, checkUserSafeBalance, getUserSafeAddress } from '@/lib/user-safe';
import { encodeFunctionData, parseEther, Address, Hex, parseAbi, formatEther } from 'viem';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function POST(req: NextRequest) {
  try {
    const { userAddress, action, params } = await req.json();
    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or action' },
        { status: 400 }
      );
    }

    console.log('🎫 [V2-DELEGATED] User-funded Safe mode');
    console.log('   User:', userAddress);
    console.log('   Action:', action);

    // Get user's Safe address
    const userSafeAddress = await getUserSafeAddress(userAddress as Address);
    console.log('   User Safe:', userSafeAddress);

    // Check delegation
    let delegation = null;
    let retries = 3;

    while (retries > 0 && !delegation) {
      delegation = await getDelegation(userAddress);
      if (!delegation) {
        retries--;
        if (retries > 0) await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!delegation || delegation.expiresAt < Date.now()) {
      return NextResponse.json({
        success: false,
        error: 'No active delegation. Please create a delegation first.',
        safeAddress: userSafeAddress,
      }, { status: 403 });
    }

    if (!(await hasPermission(userAddress, action))) {
      return NextResponse.json({
        success: false,
        error: `No permission for ${action}`,
        safeAddress: userSafeAddress,
      }, { status: 403 });
    }

    if (delegation.transactionsExecuted >= delegation.config.maxTransactions) {
      return NextResponse.json({
        success: false,
        error: 'Transaction limit reached',
        safeAddress: userSafeAddress,
      }, { status: 403 });
    }

    // Contract addresses
    const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
    const PASSPORT_NFT = (process.env.NEXT_PUBLIC_PASSPORT_NFT_V2 || process.env.NEXT_PUBLIC_PASSPORT) as Address;
    const EMPOWER_TOURS_NFT = process.env.NEXT_PUBLIC_NFT_ADDRESS as Address;
    const AMM_POOL = process.env.NEXT_PUBLIC_TOURS_WMON_POOL as Address;
    const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;
    const WMON_UNWRAP_HELPER = (process.env.NEXT_PUBLIC_WMON_UNWRAP_HELPER || '0x70580F77d7602f9A03fD34F17f3cC395BbCe6938') as Address;

    let calls: Array<{ to: Address; value: bigint; data: Hex }> = [];
    let requiredValue = 0n;

    // Build transaction based on action
    switch (action) {
      // ==================== SWAP TOURS FOR WMON ====================
      case 'swap_tours_for_wmon':
        if (!params?.toursAmount || !params?.minWMONOut) {
          return NextResponse.json({
            success: false,
            error: 'Missing toursAmount or minWMONOut',
            safeAddress: userSafeAddress,
          }, { status: 400 });
        }

        const toursSwapAmount = parseEther(params.toursAmount.toString());
        const minWMONOut = parseEther(params.minWMONOut.toString());

        calls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [AMM_POOL, toursSwapAmount],
            }) as Hex,
          },
          {
            to: AMM_POOL,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function swapToursForWMON(uint256 toursIn, uint256 minWMONOut) external returns (uint256)']),
              functionName: 'swapToursForWMON',
              args: [toursSwapAmount, minWMONOut],
            }) as Hex,
          },
        ];
        break;

      // ==================== SWAP WMON FOR TOURS ====================
      case 'swap_wmon_for_tours':
        if (!params?.wmonAmount || !params?.minToursOut) {
          return NextResponse.json({
            success: false,
            error: 'Missing wmonAmount or minToursOut',
            safeAddress: userSafeAddress,
          }, { status: 400 });
        }

        const wmonSwapAmount = parseEther(params.wmonAmount.toString());
        const minToursOut = parseEther(params.minToursOut.toString());

        calls = [
          {
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [AMM_POOL, wmonSwapAmount],
            }) as Hex,
          },
          {
            to: AMM_POOL,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function swapWMONForTours(uint256 wmonIn, uint256 minToursOut) external returns (uint256)']),
              functionName: 'swapWMONForTours',
              args: [wmonSwapAmount, minToursOut],
            }) as Hex,
          },
        ];
        break;

      // ==================== WRAP MON TO WMON ====================
      case 'wrap_mon':
        if (!params?.amount) {
          return NextResponse.json({
            success: false,
            error: 'Missing amount',
            safeAddress: userSafeAddress,
          }, { status: 400 });
        }

        const wrapAmount = parseEther(params.amount.toString());
        requiredValue = wrapAmount;

        calls = [
          {
            to: WMON_ADDRESS,
            value: wrapAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          },
        ];
        break;

      // ==================== UNWRAP WMON TO MON ====================
      case 'unwrap_wmon':
        if (!params?.amount) {
          return NextResponse.json({
            success: false,
            error: 'Missing amount',
            safeAddress: userSafeAddress,
          }, { status: 400 });
        }

        const unwrapAmount = parseEther(params.amount.toString());

        calls = [
          {
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [WMON_UNWRAP_HELPER, unwrapAmount],
            }) as Hex,
          },
          {
            to: WMON_UNWRAP_HELPER,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function unwrapTo(uint256 amount, address recipient) external']),
              functionName: 'unwrapTo',
              args: [unwrapAmount, userSafeAddress],
            }) as Hex,
          },
        ];
        break;

      // ==================== SEND TOURS ====================
      case 'send_tours':
        if (!params?.recipient || !params?.amount) {
          return NextResponse.json({
            success: false,
            error: 'Missing recipient or amount',
            safeAddress: userSafeAddress,
          }, { status: 400 });
        }

        const sendToursAmount = parseEther(params.amount.toString());

        calls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [params.recipient as Address, sendToursAmount],
            }) as Hex,
          },
        ];
        break;

      // ==================== SEND MON ====================
      case 'send_mon':
        if (!params?.recipient || !params?.amount) {
          return NextResponse.json({
            success: false,
            error: 'Missing recipient or amount',
            safeAddress: userSafeAddress,
          }, { status: 400 });
        }

        const sendMonAmount = parseEther(params.amount.toString());
        requiredValue = sendMonAmount;

        calls = [
          {
            to: params.recipient as Address,
            value: sendMonAmount,
            data: '0x' as Hex,
          },
        ];
        break;

      default:
        return NextResponse.json({
          success: false,
          error: `Action '${action}' not supported in V2 yet. Use /api/execute-delegated for other actions.`,
          safeAddress: userSafeAddress,
        }, { status: 400 });
    }

    // Check user Safe balance
    const balanceCheck = await checkUserSafeBalance(userAddress, requiredValue);
    if (!balanceCheck.hasSufficientBalance) {
      return NextResponse.json({
        success: false,
        error: `Insufficient funds in your Safe. Balance: ${balanceCheck.currentBalance} MON, Required: ${balanceCheck.requiredBalance} MON`,
        safeAddress: balanceCheck.safeAddress,
        currentBalance: balanceCheck.currentBalance,
        requiredBalance: balanceCheck.requiredBalance,
        shortfall: balanceCheck.shortfall,
        fundingInstructions: `Send at least ${balanceCheck.shortfall} MON to ${balanceCheck.safeAddress}`,
      }, { status: 400 });
    }

    // Execute transaction from user's Safe
    console.log('🚀 [V2] Executing from user Safe...');
    const { txHash, safeAddress, gasUsed } = await sendUserSafeTransaction(userAddress, calls);

    await incrementTransactionCount(userAddress);

    return NextResponse.json({
      success: true,
      txHash,
      action,
      userAddress,
      safeAddress,
      gasUsed,
      message: `${action} executed successfully from your Safe`,
      explorerLink: `https://testnet.monadscan.com/tx/${txHash}`,
    });

  } catch (error: any) {
    console.error('❌ [V2-DELEGATED] Error:', error.message);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
