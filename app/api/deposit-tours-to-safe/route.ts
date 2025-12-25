import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, formatEther, parseEther } from 'ethers';
import { getUserSafeAddress } from '@/lib/user-safe';
import { Address } from 'viem';

const TOURS_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN || '0x46d048EB424b0A95d5185f39C760c5FA754491d0';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// ERC20 ABI for checking balance, allowance, and transferFrom
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * GET /api/deposit-tours-to-safe?address=0x...
 *
 * Returns info about user's TOURS balance and what they need to do to deposit to Safe
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'address parameter required' },
        { status: 400 }
      );
    }

    const provider = new JsonRpcProvider(MONAD_RPC);
    const toursContract = new Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, provider);
    const deployerAddress = new Wallet(DEPLOYER_PRIVATE_KEY!, provider).address;

    // Get user's Safe address
    const safeAddress = await getUserSafeAddress(userAddress as Address);

    // Get balances and allowance
    const [walletBalance, safeBalance, allowance] = await Promise.all([
      toursContract.balanceOf(userAddress),
      toursContract.balanceOf(safeAddress),
      toursContract.allowance(userAddress, deployerAddress),
    ]);

    const walletBalanceFormatted = formatEther(walletBalance);
    const safeBalanceFormatted = formatEther(safeBalance);
    const allowanceFormatted = formatEther(allowance);
    const hasAllowance = BigInt(allowance) > 0n;
    const canTransfer = hasAllowance && BigInt(walletBalance) > 0n;

    return NextResponse.json({
      success: true,
      userAddress,
      safeAddress,
      walletBalance: walletBalanceFormatted,
      safeBalance: safeBalanceFormatted,
      allowance: allowanceFormatted,
      hasAllowance,
      canTransfer,
      deployerAddress,
      toursTokenAddress: TOURS_TOKEN_ADDRESS,
      instructions: hasAllowance
        ? 'You have approved TOURS. POST to this endpoint to transfer to your Safe.'
        : `Approve the deployer (${deployerAddress}) to spend your TOURS first, then POST to transfer.`,
    });

  } catch (error: any) {
    console.error('❌ Error checking deposit status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/deposit-tours-to-safe
 *
 * Transfers TOURS from user's wallet to their Safe
 * Requires user to have approved deployer to spend their TOURS first
 *
 * Body: { userAddress: string, amount?: string }
 * - If amount not specified, transfers entire wallet balance
 */
export async function POST(req: NextRequest) {
  try {
    const { userAddress, amount } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'userAddress required' },
        { status: 400 }
      );
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    console.log(`💰 Deposit TOURS to Safe for: ${userAddress}`);

    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const toursContract = new Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, deployer);

    // Get user's Safe address
    const safeAddress = await getUserSafeAddress(userAddress as Address);
    console.log(`📦 User Safe: ${safeAddress}`);

    // Check wallet balance
    const walletBalance = await toursContract.balanceOf(userAddress);
    if (BigInt(walletBalance) === 0n) {
      return NextResponse.json({
        success: false,
        error: 'No TOURS in wallet to transfer',
        walletBalance: '0',
        safeAddress,
      }, { status: 400 });
    }

    // Determine transfer amount
    let transferAmount: bigint;
    if (amount) {
      transferAmount = parseEther(amount);
      if (transferAmount > BigInt(walletBalance)) {
        return NextResponse.json({
          success: false,
          error: `Insufficient balance. Wallet has ${formatEther(walletBalance)} TOURS`,
          walletBalance: formatEther(walletBalance),
        }, { status: 400 });
      }
    } else {
      // Transfer entire balance
      transferAmount = BigInt(walletBalance);
    }

    // Check allowance
    const allowance = await toursContract.allowance(userAddress, deployer.address);
    if (BigInt(allowance) < transferAmount) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient allowance. Please approve the deployer to spend your TOURS first.',
        currentAllowance: formatEther(allowance),
        requiredAmount: formatEther(transferAmount),
        deployerAddress: deployer.address,
        toursTokenAddress: TOURS_TOKEN_ADDRESS,
        approveInstructions: `Call TOURS.approve("${deployer.address}", amount) from your wallet`,
      }, { status: 400 });
    }

    console.log(`⚡ Transferring ${formatEther(transferAmount)} TOURS from wallet to Safe...`);

    // Execute transferFrom
    const tx = await toursContract.transferFrom(userAddress, safeAddress, transferAmount);
    console.log('📤 Transfer TX sent:', tx.hash);

    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      throw new Error('Transfer transaction failed');
    }

    // Get updated balances
    const [newWalletBalance, newSafeBalance] = await Promise.all([
      toursContract.balanceOf(userAddress),
      toursContract.balanceOf(safeAddress),
    ]);

    console.log('✅ TOURS deposited to Safe!', {
      txHash: tx.hash,
      amount: formatEther(transferAmount),
      newWalletBalance: formatEther(newWalletBalance),
      newSafeBalance: formatEther(newSafeBalance),
    });

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      userAddress,
      safeAddress,
      amountTransferred: formatEther(transferAmount),
      newWalletBalance: formatEther(newWalletBalance),
      newSafeBalance: formatEther(newSafeBalance),
      message: `Successfully deposited ${formatEther(transferAmount)} TOURS to your Safe!`,
    });

  } catch (error: any) {
    console.error('❌ Deposit error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Deposit failed',
        details: error.reason || error.shortMessage,
      },
      { status: 500 }
    );
  }
}
