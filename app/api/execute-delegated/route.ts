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
import { encodeFunctionData, parseEther, Address, Hex, isHex } from 'viem';

// 🔥 CRITICAL: Define entrypoint constant
const ENTRYPOINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7B57b04B0ee495b1C' as Hex;

// Helper to convert BigInt to hex for serialization
function bigintToHex(value: bigint | undefined): Hex {
  if (value === undefined) return '0x0';
  if (typeof value === 'string') return value as Hex;
  return `0x${value.toString(16)}` as Hex;
}

// Helper to ensure address is valid hex
function ensureValidHexAddress(addr: any): Hex {
  if (!addr) return '0x0000000000000000000000000000000000000000' as Hex;
  
  const addrStr = typeof addr === 'string' ? addr : String(addr);
  
  if (!isHex(addrStr)) {
    console.error('❌ Invalid hex address:', addrStr, 'Type:', typeof addrStr);
    throw new Error(`Invalid hex address: ${addrStr}`);
  }
  
  if (addrStr.length !== 42) { // 0x + 40 hex chars
    console.error('❌ Address wrong length:', addrStr, 'Length:', addrStr.length);
    throw new Error(`Address wrong length: ${addrStr}`);
  }
  
  return addrStr as Hex;
}

// Helper to convert UserOp with BigInts to RPC-compatible format
function userOpToRPC(userOp: any) {
  console.log('📤 Converting UserOp to RPC format...');
  console.log('   sender:', userOp.sender, 'Type:', typeof userOp.sender);
  console.log('   nonce:', userOp.nonce, 'Type:', typeof userOp.nonce);
  
  // Validate sender is a proper hex address
  const validSender = ensureValidHexAddress(userOp.sender);
  
  const rpcUserOp = {
    sender: validSender,
    nonce: bigintToHex(userOp.nonce),
    initCode: userOp.initCode || '0x',
    callData: userOp.callData,
    callGasLimit: bigintToHex(userOp.callGasLimit),
    verificationGasLimit: bigintToHex(userOp.verificationGasLimit),
    preVerificationGas: bigintToHex(userOp.preVerificationGas),
    maxFeePerGas: bigintToHex(userOp.maxFeePerGas),
    maxPriorityFeePerGas: bigintToHex(userOp.maxPriorityFeePerGas),
    paymasterAndData: userOp.paymasterAndData || '0x',
    signature: userOp.signature || '0x',
  };
  
  console.log('✅ RPC UserOp created:', {
    sender: rpcUserOp.sender,
    nonce: rpcUserOp.nonce,
    callGasLimit: rpcUserOp.callGasLimit,
    verificationGasLimit: rpcUserOp.verificationGasLimit,
  });
  
  return rpcUserOp;
}

export async function POST(req: NextRequest) {
  try {
    const { userAddress, action, params } = await req.json();

    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userAddress, action' },
        { status: 400 }
      );
    }

    console.log('🔐 Checking delegation for:', userAddress);
    console.log('📍 Using entrypoint:', ENTRYPOINT_ADDRESS);

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

    console.log('✅ UserOp created');
    console.log('   Sender:', userOp.sender);

    // Estimate gas
    let gasEstimate;
    try {
      console.log('Estimating gas...');
      
      // 🔥 CRITICAL: Validate sender before RPC call
      console.log('Validating sender address:', userOp.sender);
      ensureValidHexAddress(userOp.sender);
      
      const userOpForEstimate = userOpToRPC(userOp);
      
      console.log('UserOp for gas estimation:', {
        sender: userOpForEstimate.sender,
        nonce: userOpForEstimate.nonce,
        callGasLimit: userOpForEstimate.callGasLimit,
        verificationGasLimit: userOpForEstimate.verificationGasLimit,
        callDataLength: userOpForEstimate.callData.length,
      });

      gasEstimate = await estimateUserOperationGas(userOpForEstimate);

      console.log('Gas estimate:', {
        callGasLimit: gasEstimate.callGasLimit,
        verificationGasLimit: gasEstimate.verificationGasLimit,
        preVerificationGas: gasEstimate.preVerificationGas,
      });

      // Parse properly - handle both hex strings and numbers
      userOp.callGasLimit = typeof gasEstimate.callGasLimit === 'string' 
        ? BigInt(gasEstimate.callGasLimit)
        : BigInt(gasEstimate.callGasLimit);
      userOp.verificationGasLimit = typeof gasEstimate.verificationGasLimit === 'string'
        ? BigInt(gasEstimate.verificationGasLimit)
        : BigInt(gasEstimate.verificationGasLimit);
      userOp.preVerificationGas = typeof gasEstimate.preVerificationGas === 'string'
        ? BigInt(gasEstimate.preVerificationGas)
        : BigInt(gasEstimate.preVerificationGas);
    } catch (gasError: any) {
      console.warn('⚠️ Gas estimation failed:', gasError.message);
      console.warn('Using defaults instead');
      userOp.callGasLimit = 200000n;
      userOp.verificationGasLimit = 200000n;
      userOp.preVerificationGas = 35000n;
    }

    console.log('Sending UserOp via Pimlico...');
    const userOpHash = await sendUserOperation(userOp);
    console.log('UserOp sent:', userOpHash);

    let receipt = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      receipt = await getUserOperationReceipt(userOpHash as Hex);
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
    console.error('❌ Delegated execution error:', error);
    console.error('Stack:', error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Execution failed',
        details: error.response?.data || error.reason || undefined,
      },
      { status: 500 }
    );
  }
}
