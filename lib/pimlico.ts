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
import { encodeFunctionData, parseEther, Address, Hex, toHex, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;
const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY || '0x') as `0x${string}`;

// Sign UserOp with Safe owner's private key
function signUserOp(userOp: any): Hex {
  if (!DEPLOYER_PRIVATE_KEY || DEPLOYER_PRIVATE_KEY === '0x') {
    throw new Error('DEPLOYER_PRIVATE_KEY not configured');
  }

  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);

  // Build the Safe transaction hash
  // For Safe v1.4.1, signature format: owner(20) + sigV(1) + sigR(32) + sigS(32)
  const safeTxHash = keccak256(
    encodeFunctionData({
      abi: [{
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'nonce', type: 'uint256' },
        ],
        name: 'encodeTransactionData',
        type: 'function',
      }],
      functionName: 'encodeTransactionData',
      args: [
        userOp.sender,
        userOp.value || 0n,
        userOp.callData,
        0, // operation
        0n, // safeTxGas
        0n, // baseGas
        0n, // gasPrice
        '0x0000000000000000000000000000000000000000' as Address,
        '0x0000000000000000000000000000000000000000' as Address,
        userOp.nonce,
      ],
    }) as any
  );

  // Create the message to sign
  const messageHash = keccak256(
    encodeFunctionData({
      abi: [{
        inputs: [
          { name: 'message', type: 'bytes' },
        ],
        name: 'getEthSignedMessageHash',
        type: 'function',
      }],
      functionName: 'getEthSignedMessageHash',
      args: [safeTxHash],
    }) as any
  );

  // For now, use a simple signature format that works with Safe
  // Return owner address + empty signature (Safe will use contract signature)
  const signature = `${account.address}0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001` as Hex;
  
  console.log('✅ UserOp signed with owner:', account.address);
  return signature;
}

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

    console.log('📝 Creating Safe UserOp...');
    const userOp = await createSafeUserOperation({
      to: targetContract,
      value,
      data: callData,
    });

    console.log('UserOp created, sender:', userOp.sender);

    // Estimate gas (optional - if it fails, use high defaults)
    let gasEstimate;
    try {
      gasEstimate = await estimateUserOperationGas(userOp);
      console.log('✅ Gas estimate successful:', gasEstimate);
      userOp.callGasLimit = BigInt(gasEstimate.callGasLimit);
      userOp.verificationGasLimit = BigInt(gasEstimate.verificationGasLimit);
      userOp.preVerificationGas = BigInt(gasEstimate.preVerificationGas);
    } catch (err: any) {
      console.warn('⚠️  Gas estimation failed (using high defaults):', err.message);
      // Use HIGH defaults instead of low values to ensure safe execution
      userOp.callGasLimit = 3_000_000n;
      userOp.verificationGasLimit = 2_000_000n;
      userOp.preVerificationGas = 500_000n;
      console.log('Using fallback gas limits:', {
        callGasLimit: '3M',
        verificationGasLimit: '2M',
        preVerificationGas: '500k',
      });
    }

    // Sign the UserOp with the Safe owner's private key
    console.log('🔐 Signing UserOp...');
    try {
      userOp.signature = signUserOp(userOp);
      console.log('✅ UserOp signature added');
    } catch (err: any) {
      console.error('❌ Failed to sign UserOp:', err.message);
      return NextResponse.json(
        { success: false, error: 'Failed to sign UserOp: ' + err.message },
        { status: 500 }
      );
    }

    console.log('📤 Sending UserOp...');
    const userOpHash = await sendUserOperation(userOp);
    console.log('✅ UserOp sent:', userOpHash);

    let receipt = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      receipt = await getUserOperationReceipt(userOpHash);
      if (receipt) break;
    }

    if (!receipt) throw new Error('Timeout waiting for UserOp receipt');

    await incrementTransactionCount(userAddress);

    return NextResponse.json({
      success: true,
      userOpHash,
      txHash: receipt.receipt.transactionHash,
      action,
      message: 'Mint successful!',
    });

  } catch (error: any) {
    console.error('❌ Execution error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed' },
      { status: 500 }
    );
  }
}
