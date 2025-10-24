import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import {
  createSafeUserOperation,
  sendUserOperation,
  getUserOperationReceipt,
  estimateUserOperationGas
} from '@/lib/pimlico';
import { checkSafeBalance } from '@/lib/safe';
import { encodeFunctionData, parseEther, Address, Hex } from 'viem';

export async function POST(req: NextRequest) {
  try {
    const { userAddress, action, params } = await req.json();

    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userAddress, action' },
        { status: 400 }
      );
    }

    console.log('Checking delegation for:', userAddress);

    let delegation;
    try {
      delegation = await getDelegation(userAddress);
    } catch (error: any) {
      console.error('Error retrieving delegation:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to check delegation status' },
        { status: 500 }
      );
    }

    if (!delegation) {
      return NextResponse.json(
        { success: false, error: 'No active delegation found. Please create one first!' },
        { status: 403 }
      );
    }

    console.log('Delegation found:', {
      expiresAt: new Date(delegation.expiresAt).toISOString(),
      permissions: delegation.config.permissions,
      used: delegation.transactionsExecuted,
      max: delegation.config.maxTransactions
    });

    if (delegation.expiresAt < Date.now()) {
      console.log('Delegation expired');
      return NextResponse.json(
        { success: false, error: 'Delegation has expired' },
        { status: 403 }
      );
    }

    const hasAccess = await hasPermission(userAddress, action);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: `No permission for action: ${action}` },
        { status: 403 }
      );
    }

    console.log('User has permission for:', action);

    if (delegation.transactionsExecuted >= delegation.config.maxTransactions) {
      return NextResponse.json(
        { success: false, error: 'Transaction limit reached' },
        { status: 403 }
      );
    }

    console.log(`Transaction count: ${delegation.transactionsExecuted}/${delegation.config.maxTransactions}`);

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

      case 'mint_music':
        targetContract = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS as Address;
        value = 0n;
        callData = encodeFunctionData({
          abi: [{
            inputs: [
              { name: 'artist', type: 'address' },
              { name: 'tokenURI', type: 'string' },
              { name: 'price', type: 'uint256' }
            ],
            name: 'mintMaster',
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'nonpayable',
            type: 'function',
          }],
          functionName: 'mintMaster',
          args: [
            userAddress as Address,
            params.tokenURI,
            params.price || 10000000000000000n
          ],
        }) as Hex;
        break;

      case 'swap':
        targetContract = process.env.TOKEN_SWAP_ADDRESS as Address;
        value = parseEther(params.amount || '0.1');
        callData = encodeFunctionData({
          abi: [{
            inputs: [],
            name: 'swap',
            outputs: [],
            stateMutability: 'payable',
            type: 'function',
          }],
          functionName: 'swap',
        }) as Hex;
        break;

      case 'buy_itinerary':
        targetContract = process.env.NEXT_PUBLIC_MARKET as Address;
        value = 0n;
        callData = encodeFunctionData({
          abi: [{
            inputs: [{ name: 'id', type: 'uint256' }],
            name: 'purchaseItinerary',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          }],
          functionName: 'purchaseItinerary',
          args: [BigInt(params.itineraryId || 0)],
        }) as Hex;
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    if (value > 0n) {
      const hasBalance = await checkSafeBalance(value);
      if (!hasBalance) {
        return NextResponse.json(
          {
            success: false,
            error: `Safe account needs ${(Number(value) / 1e18).toFixed(2)} MON. Please fund it first.`,
            needsFunding: true,
          },
          { status: 400 }
        );
      }
    }

    console.log('Creating Safe UserOp for', action);
    console.log('Target:', targetContract);
    console.log('Value:', value.toString());

    const userOp = await createSafeUserOperation({
      to: targetContract,
      value,
      data: callData,
    });

    // Estimate gas — Convert BigInt → 0x hex strings
    let gasEstimate;
    try {
      const toHex = (n: bigint | undefined) => n !== undefined ? `0x${n.toString(16)}` : '0x0';

      const userOpForEstimate = {
        sender: userOp.sender,
        nonce: toHex(userOp.nonce),
        initCode: userOp.initCode,
        callData: userOp.callData,
        callGasLimit: toHex(userOp.callGasLimit),
        verificationGasLimit: toHex(userOp.verificationGasLimit),
        preVerificationGas: toHex(userOp.preVerificationGas),
        maxFeePerGas: toHex(userOp.maxFeePerGas),
        maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
        paymasterAndData: userOp.paymasterAndData,
        signature: userOp.signature,
      };

      console.log('Estimating gas with hex strings...');
      gasEstimate = await estimateUserOperationGas(userOpForEstimate);

      console.log('Gas estimate:', {
        callGasLimit: gasEstimate.callGasLimit,
        verificationGasLimit: gasEstimate.verificationGasLimit,
        preVerificationGas: gasEstimate.preVerificationGas,
      });

      userOp.callGasLimit = BigInt(gasEstimate.callGasLimit);
      userOp.verificationGasLimit = BigInt(gasEstimate.verificationGasLimit);
      userOp.preVerificationGas = BigInt(gasEstimate.preVerificationGas);
    } catch (gasError) {
      console.warn('Gas estimation failed, using defaults:', gasError);
      userOp.callGasLimit = 150000n;
      userOp.verificationGasLimit = 150000n;
      userOp.preVerificationGas = 21000n;
    }

    console.log('Sending UserOp via Pimlico...');
    const userOpHash = await sendUserOperation(userOp);
    console.log('UserOp sent:', userOpHash);

    let receipt = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      receipt = await getUserOperationReceipt(userOpHash);
      if (receipt) break;
    }

    if (!receipt) throw new Error('Transaction timeout - check Pimlico dashboard');

    const txHash = receipt.receipt?.transactionHash;
    console.log('Transaction confirmed:', txHash);

    try {
      await incrementTransactionCount(userAddress);
      console.log('Transaction count updated');
    } catch (error) {
      console.warn('Failed to update transaction count:', error);
    }

    const callGas = BigInt(userOp.callGasLimit || 0n);
    const verifyGas = BigInt(userOp.verificationGasLimit || 0n);
    const preVerifyGas = BigInt(userOp.preVerificationGas || 0n);
    const gasPrice = BigInt(userOp.maxFeePerGas || 0n);
    const totalGas = (callGas + verifyGas + preVerifyGas) * gasPrice;
    const gasSponsored = (Number(totalGas) / 1e18).toFixed(4);

    return NextResponse.json({
      success: true,
      userOpHash,
      txHash,
      action,
      amountOut: params.minAmountOut || '0',
      gasSponsored,
      message: 'Transaction executed successfully via Pimlico delegation',
    });

  } catch (error: any) {
    console.error('Delegated execution error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Execution failed',
      },
      { status: 500 }
    );
  }
}
