import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
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
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Get stored delegation
    const key = `delegation:${userAddress.toLowerCase()}`;
    const delegationData = await redis.get(key);
    
    if (!delegationData) {
      return NextResponse.json(
        { success: false, error: 'No active delegation found' },
        { status: 403 }
      );
    }
    
    const delegation = JSON.parse(delegationData as string);
    
    // Check if delegation expired
    if (delegation.expiresAt < Date.now()) {
      await redis.del(key);
      return NextResponse.json(
        { success: false, error: 'Delegation expired' },
        { status: 403 }
      );
    }
    
    // Check permissions
    if (!delegation.config.permissions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `No permission for action: ${action}` },
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
    
    // Prepare transaction based on action
    let targetContract: Address;
    let callData: Hex;
    let value = 0n;
    
    switch (action) {
      case 'mint_passport':
        targetContract = process.env.NEXT_PUBLIC_PASSPORT as Address;
        value = parseEther('0.01'); // Passport mint costs 0.01 MON
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
        value = 0n; // Music minting is free
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
        value = parseEther(params.amount || '0.1'); // Default 0.1 MON
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
        
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
    
    // Check if Safe has enough balance for the value transfer
    if (value > 0n) {
      const hasBalance = await checkSafeBalance(value);
      if (!hasBalance) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Safe account needs ${Number(value) / 1e18} MON. Please fund it first.`,
            needsFunding: true,
          },
          { status: 400 }
        );
      }
    }
    
    console.log('🚀 Creating Safe UserOp for', action);
    console.log('Target:', targetContract);
    console.log('Value:', value.toString());
    
    // Create user operation
    const userOp = await createSafeUserOperation({
      to: targetContract,
      value,
      data: callData,
    });
    
    // Estimate gas
    try {
      const gasEstimate = await estimateUserOperationGas(userOp);
      console.log('⛽ Gas estimate:', gasEstimate);
      
      // Update user op with estimates
      if (gasEstimate.callGasLimit) {
        userOp.callGasLimit = BigInt(gasEstimate.callGasLimit);
      }
      if (gasEstimate.verificationGasLimit) {
        userOp.verificationGasLimit = BigInt(gasEstimate.verificationGasLimit);
      }
      if (gasEstimate.preVerificationGas) {
        userOp.preVerificationGas = BigInt(gasEstimate.preVerificationGas);
      }
    } catch (gasError) {
      console.warn('⚠️ Gas estimation failed, using defaults:', gasError);
    }
    
    // Send user operation
    console.log('📤 Sending UserOp via Pimlico...');
    const userOpHash = await sendUserOperation(userOp);
    
    // Wait for receipt (with timeout)
    let receipt = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      receipt = await getUserOperationReceipt(userOpHash);
      if (receipt) break;
    }
    
    if (!receipt) {
      throw new Error('Transaction timeout - check Pimlico dashboard');
    }
    
    const txHash = receipt.receipt?.transactionHash;
    
    console.log('✅ Transaction confirmed:', txHash);
    
    // Update delegation usage
    delegation.transactionsExecuted++;
    await redis.setex(
      key,
      Math.floor((delegation.expiresAt - Date.now()) / 1000),
      JSON.stringify(delegation)
    );
    
    return NextResponse.json({
      success: true,
      userOpHash,
      txHash,
      action,
      message: 'Transaction executed successfully via Pimlico',
    });
    
  } catch (error: any) {
    console.error('❌ Delegated execution error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Execution failed',
        details: error.stack 
      },
      { status: 500 }
    );
  }
}
