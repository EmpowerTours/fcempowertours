import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, formatEther, parseEther } from 'ethers';

const TOURS_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN!;
const PLATFORM_SAFE_ADDRESS = process.env.NEXT_PUBLIC_PLATFORM_SAFE!;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const KEEPER_SECRET = process.env.KEEPER_SECRET || '';

// ERC20 ABI for transfer
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
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * GET /api/fund-platform-safe
 *
 * Check the balance of deployer and platform Safe
 */
export async function GET(req: NextRequest) {
  try {
    const provider = new JsonRpcProvider(MONAD_RPC);
    const toursContract = new Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, provider);

    const deployerAddress = DEPLOYER_PRIVATE_KEY
      ? new Wallet(DEPLOYER_PRIVATE_KEY, provider).address
      : 'NOT_CONFIGURED';

    const [deployerBalance, platformSafeBalance] = await Promise.all([
      deployerAddress !== 'NOT_CONFIGURED'
        ? toursContract.balanceOf(deployerAddress)
        : 0n,
      toursContract.balanceOf(PLATFORM_SAFE_ADDRESS),
    ]);

    return NextResponse.json({
      success: true,
      deployerAddress,
      platformSafeAddress: PLATFORM_SAFE_ADDRESS,
      deployerBalance: formatEther(deployerBalance),
      platformSafeBalance: formatEther(platformSafeBalance),
      toursTokenAddress: TOURS_TOKEN_ADDRESS,
    });

  } catch (error: any) {
    console.error('[FundPlatformSafe] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fund-platform-safe
 *
 * Transfer TOURS from deployer to platform Safe
 * Body: { secret: string, amount: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { secret, amount } = await req.json();

    // Verify keeper secret for security
    if (secret !== KEEPER_SECRET || !KEEPER_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!amount) {
      return NextResponse.json(
        { success: false, error: 'amount required (in TOURS)' },
        { status: 400 }
      );
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error - no deployer key' },
        { status: 500 }
      );
    }

    console.log(`[FundPlatformSafe] Funding platform Safe with ${amount} TOURS`);

    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const toursContract = new Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, deployer);

    // Check deployer balance
    const deployerBalance = await toursContract.balanceOf(deployer.address);
    const transferAmount = parseEther(amount);

    if (BigInt(deployerBalance) < transferAmount) {
      return NextResponse.json({
        success: false,
        error: `Insufficient deployer balance. Has ${formatEther(deployerBalance)} TOURS, needs ${amount} TOURS`,
        deployerBalance: formatEther(deployerBalance),
      }, { status: 400 });
    }

    // Get balance before
    const safeBefore = await toursContract.balanceOf(PLATFORM_SAFE_ADDRESS);
    console.log(`[FundPlatformSafe] Platform Safe balance before: ${formatEther(safeBefore)} TOURS`);

    // Execute transfer
    console.log(`[FundPlatformSafe] Transferring ${amount} TOURS from ${deployer.address} to ${PLATFORM_SAFE_ADDRESS}`);
    const tx = await toursContract.transfer(PLATFORM_SAFE_ADDRESS, transferAmount);
    console.log(`[FundPlatformSafe] TX sent: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      throw new Error('Transfer transaction failed');
    }

    // Get balance after
    const safeAfter = await toursContract.balanceOf(PLATFORM_SAFE_ADDRESS);
    console.log(`[FundPlatformSafe] Platform Safe balance after: ${formatEther(safeAfter)} TOURS`);

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amountTransferred: amount,
      platformSafeAddress: PLATFORM_SAFE_ADDRESS,
      balanceBefore: formatEther(safeBefore),
      balanceAfter: formatEther(safeAfter),
      message: `Successfully funded platform Safe with ${amount} TOURS`,
    });

  } catch (error: any) {
    console.error('[FundPlatformSafe] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Transfer failed',
        details: error.reason || error.shortMessage,
      },
      { status: 500 }
    );
  }
}
