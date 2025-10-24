import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction, checkSafeBalance } from '@/lib/pimlico-safe-aa';
import { encodeFunctionData, parseEther, Address, Hex } from 'viem';

export async function POST(req: NextRequest) {
  try {
    const { userAddress, action, params } = await req.json();

    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or action' },
        { status: 400 }
      );
    }

    console.log('🎫 [DELEGATED] Checking delegation for:', userAddress);

    // Check delegation
    const delegation = await getDelegation(userAddress);
    if (!delegation || delegation.expiresAt < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'No active delegation' },
        { status: 403 }
      );
    }

    // Check permission
    if (!(await hasPermission(userAddress, action))) {
      return NextResponse.json(
        { success: false, error: `No permission for ${action}` },
        { status: 403 }
      );
    }

    // Check transaction limit
    if (delegation.transactionsExecuted >= delegation.config.maxTransactions) {
      return NextResponse.json(
        { success: false, error: 'Transaction limit reached' },
        { status: 403 }
      );
    }

    console.log('✅ Delegation valid, transactions left:', 
      delegation.config.maxTransactions - delegation.transactionsExecuted);

    let targetContract: Address;
    let callData: Hex;
    let value = 0n;

    // Parse action
    switch (action) {
      case 'mint_passport':
        targetContract = process.env.NEXT_PUBLIC_PASSPORT as Address;
        value = parseEther('0.01');
        callData = encodeFunctionData({
          abi: [{
            inputs: [{ name: 'to', type: 'address' }],
            name: 'mint',
            outputs: [],
            stateMutability: 'payable',
            type: 'function',
          }],
          functionName: 'mint',
          args: [userAddress as Address],
        }) as Hex;
        console.log('🎫 Action: mint_passport');
        console.log('  Target:', targetContract);
        console.log('  Value:', value.toString(), 'wei');
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // Check Safe has enough balance
    if (value > 0n && !(await checkSafeBalance(value))) {
      return NextResponse.json(
        { success: false, error: 'Insufficient Safe balance', needsFunding: true },
        { status: 400 }
      );
    }

    console.log('💳 Executing delegated transaction...');

    // Send through Safe SmartAccount (handles all AA logic internally)
    const txHash = await sendSafeTransaction({
      to: targetContract,
      value,
      data: callData,
    });

    console.log('✅ Transaction successful');
    console.log('   TX Hash:', txHash);

    // Increment transaction count
    await incrementTransactionCount(userAddress);
    console.log('📝 Transaction count incremented');

    return NextResponse.json({
      success: true,
      txHash,
      action,
      userAddress,
      message: `${action} executed successfully`,
    });

  } catch (error: any) {
    console.error('❌ [DELEGATED] Execution error:', error.message);
    console.error('   Stack:', error.stack);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to execute action',
        action: 'execute_delegated',
      },
      { status: 500 }
    );
  }
}
