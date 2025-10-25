import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { encodeFunctionData, parseEther, Address, Hex, parseAbi } from 'viem';

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

    console.log('✅ Delegation valid, transactions left:', 
      delegation.config.maxTransactions - delegation.transactionsExecuted);

    const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
    const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as Address;
    const TOKEN_SWAP = process.env.TOKEN_SWAP_ADDRESS as Address;
    const MINT_PRICE = parseEther('10');

    switch (action) {
      case 'mint_passport':
        console.log('🎫 Action: mint_passport (batched approve + mint)');

        const mintCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [PASSPORT_NFT, MINT_PRICE],
            }) as Hex,
          },
          {
            to: PASSPORT_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function mint(address to, string countryCode, string countryName, string region, string continent, string uri) external returns (uint256)'
              ]),
              functionName: 'mint',
              args: [
                userAddress as Address,
                params?.countryCode || 'US',
                params?.countryName || 'United States',
                params?.region || 'Americas',
                params?.continent || 'North America',
                params?.uri || '',
              ],
            }) as Hex,
          },
        ];

        console.log('💳 Executing batched mint transaction...');
        const mintTxHash = await sendSafeTransaction(mintCalls);

        console.log('✅ Mint successful, TX:', mintTxHash);
        await incrementTransactionCount(userAddress);

        return NextResponse.json({
          success: true,
          txHash: mintTxHash,
          action,
          userAddress,
          message: `${action} executed successfully`,
        });

      case 'swap_mon_for_tours':
        console.log('💱 Action: swap_mon_for_tours');
        
        const monAmount = params?.amount ? parseEther(params.amount) : parseEther('0.1'); // Default 0.1 MON
        console.log('  Swapping:', monAmount.toString(), 'wei MON');

        // Single call to swap contract with MON value
        const swapCalls = [
          {
            to: TOKEN_SWAP,
            value: monAmount, // Send MON with the transaction
            data: encodeFunctionData({
              abi: parseAbi(['function swapMonForTours() external payable']),
              functionName: 'swapMonForTours',
              args: [],
            }) as Hex,
          },
        ];

        console.log('💳 Executing swap transaction...');
        const swapTxHash = await sendSafeTransaction(swapCalls);

        console.log('✅ Swap successful, TX:', swapTxHash);
        await incrementTransactionCount(userAddress);

        return NextResponse.json({
          success: true,
          txHash: swapTxHash,
          action,
          userAddress,
          monAmount: monAmount.toString(),
          message: `Swapped ${params?.amount || '0.1'} MON for TOURS successfully`,
        });

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('❌ [DELEGATED] Execution error:', error.message);
    
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
