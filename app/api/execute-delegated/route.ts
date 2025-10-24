import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import {
  createSafeUserOperation,
  estimateUserOperationGas,
  sendUserOperation,
  getUserOperationReceipt
} from '@/lib/pimlico';
import { checkSafeBalance } from '@/lib/safe';
import { encodeFunctionData, parseEther, Address, Hex } from 'viem';

const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;

export async function POST(req: NextRequest) {
  try {
    const { userAddress, action, params } = await req.json();

    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or action' },
        { status: 400 }
      );
    }

    console.log('Checking delegation for:', userAddress);
    console.log('Using entrypoint:', ENTRYPOINT_ADDRESS);

    const delegation = await getDelegation(userAddress);
    if (!delegation || delegation.expiresAt < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'No active delegation' },
        { status: 403 }
      );
    }

    if (!(await hasPermission(userAddress, action))) {
      return NextResponse.json(
        { success: false, error: `No permission for ${action}` },
        { status: 403 }
      );
    }

    if (delegation.transactionsExecuted >= delegation.config.maxTransactions) {
      return NextResponse.json(
        { success: false, error: 'Transaction limit reached' },
        { status: 403 }
      );
    }

    let targetContract: Address;
    let callData: Hex;
    let value = 0n;

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
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    if (value > 0n && !(await checkSafeBalance(value))) {
      return NextResponse.json(
        { success: false, error: 'Insufficient Safe balance', needsFunding: true },
        { status: 400 }
      );
    }

    console.log('Creating Safe UserOp...');
    const userOp = await createSafeUserOperation({
      to: targetContract,
      value,
      data: callData,
    });

    console.log('UserOp created, sender:', userOp.sender);

    // Estimate gas
    let gasEstimate;
    try {
      gasEstimate = await estimateUserOperationGas(userOp);
      userOp.callGasLimit = BigInt(gasEstimate.callGasLimit);
      userOp.verificationGasLimit = BigInt(gasEstimate.verificationGasLimit);
      userOp.preVerificationGas = BigInt(gasEstimate.preVerificationGas);
    } catch (err: any) {
      console.warn('Gas estimation failed:', err.message);
      userOp.callGasLimit = 400_000n;
      userOp.verificationGasLimit = 200_000n;
      userOp.preVerificationGas = 60_000n;
    }

    console.log('Sending UserOp...');
    const userOpHash = await sendUserOperation(userOp);
    console.log('UserOp sent:', userOpHash);

    let receipt = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      receipt = await getUserOperationReceipt(userOpHash);
      if (receipt) break;
    }

    if (!receipt) throw new Error('Timeout');

    await incrementTransactionCount(userAddress);

    return NextResponse.json({
      success: true,
      userOpHash,
      txHash: receipt.receipt.transactionHash,
      action,
      message: 'Mint successful!',
    });

  } catch (error: any) {
    console.error('Execution error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed' },
      { status: 500 }
    );
  }
}
