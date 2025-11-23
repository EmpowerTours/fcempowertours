import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, parseEther, formatEther } from 'ethers';

const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA';
const TOURS_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN || '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// TokenSwap ABI - just the swap function
const TOKEN_SWAP_ABI = [
  {
    inputs: [],
    name: 'swap',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'exchangeRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// ERC20 ABI for transferring TOURS to user
const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export async function POST(req: NextRequest) {
  try {
    const { userAddress, amount } = await req.json();
    
    if (!userAddress || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or amount' },
        { status: 400 }
      );
    }
    
    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0 || amountFloat > 10) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount. Must be between 0.01 and 10 MON' },
        { status: 400 }
      );
    }
    
    console.log(`💱 Executing swap for ${userAddress}: ${amount} MON`);
    
    // Connect to Monad with deployer wallet (we pay gas)
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(TOKEN_SWAP_ADDRESS, TOKEN_SWAP_ABI, deployer);
    
    // Get exchange rate
    const rate = await contract.exchangeRate();
    const monValue = parseEther(amount);
    const toursReceived = (BigInt(monValue) * BigInt(rate)) / BigInt(10 ** 18);
    
    console.log(`📊 Exchange rate: 1 MON = ${formatEther(rate)} TOURS`);
    console.log(`📊 User will receive: ${formatEther(toursReceived)} TOURS`);
    
    // Step 1: Execute swap (TOURS goes to deployer)
    console.log('⚡ Step 1: Executing swap (deployer receives TOURS)...');
    const tx = await contract.swap({ value: monValue });
    console.log('📤 Swap TX sent:', tx.hash);

    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Swap transaction failed');
    }
    console.log('✅ Swap successful, deployer received TOURS');

    // Step 2: Transfer TOURS from deployer to user
    console.log(`⚡ Step 2: Transferring ${formatEther(toursReceived)} TOURS to user ${userAddress}...`);
    const toursContract = new Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, deployer);
    const transferTx = await toursContract.transfer(userAddress, toursReceived);
    console.log('📤 Transfer TX sent:', transferTx.hash);

    const transferReceipt = await transferTx.wait();

    if (transferReceipt?.status !== 1) {
      throw new Error('TOURS transfer to user failed');
    }

    console.log('✅ Swap complete! TOURS sent to user.', {
      swapTxHash: tx.hash,
      transferTxHash: transferTx.hash,
      userAddress,
      monSpent: amount,
      toursReceived: formatEther(toursReceived)
    });

    return NextResponse.json({
      success: true,
      txHash: transferTx.hash,  // Return the transfer tx so user sees their tokens
      swapTxHash: tx.hash,
      userAddress,
      monSpent: amount,
      toursReceived: formatEther(toursReceived),
      message: 'Swap executed and TOURS sent to your wallet!',
    });
    
  } catch (error: any) {
    console.error('❌ Swap execution error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Swap failed',
        details: error.reason || error.shortMessage
      },
      { status: 500 }
    );
  }
}
