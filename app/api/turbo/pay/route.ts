import { NextRequest, NextResponse } from 'next/server';
import { sendUserSafeTransaction, checkUserSafeBalance, getUserSafeAddress } from '@/lib/user-safe';
import { encodeFunctionData, parseEther, Address, Hex, parseAbi, formatEther, createPublicClient, http } from 'viem';

export const dynamic = 'force-dynamic';

const TURBO_COHORT = (process.env.NEXT_PUBLIC_TURBO_COHORT) as Address;
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

const TIER_MAP: Record<string, { id: number; name: string }> = {
  explorer: { id: 1, name: 'Explorer' },
  builder: { id: 2, name: 'Builder' },
  founder: { id: 3, name: 'Founder' },
};

export async function POST(req: NextRequest) {
  try {
    const { userAddress, tier } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress' },
        { status: 400 }
      );
    }

    const tierInfo = TIER_MAP[tier?.toLowerCase()];
    if (!tierInfo) {
      return NextResponse.json(
        { success: false, error: 'Invalid tier. Must be explorer, builder, or founder' },
        { status: 400 }
      );
    }

    console.log(`[TurboPay] ${userAddress} paying as ${tierInfo.name}`);

    const userSafeAddress = await getUserSafeAddress(userAddress as Address);

    // Read tier price from contract
    const client = createPublicClient({
      transport: http(RPC_URL),
    });

    const tierPrice = await client.readContract({
      address: TURBO_COHORT,
      abi: parseAbi(['function tierPrice(uint8 tier) external view returns (uint256)']),
      functionName: 'tierPrice',
      args: [tierInfo.id],
    }) as bigint;

    if (tierPrice === 0n) {
      return NextResponse.json(
        { success: false, error: 'Tier price not set on contract. Contact admin.' },
        { status: 400 }
      );
    }

    console.log(`[TurboPay] Tier price: ${formatEther(tierPrice)} WMON`);

    // Check WMON balance of user's Safe
    const wmonBalance = await client.readContract({
      address: WMON_ADDRESS,
      abi: parseAbi(['function balanceOf(address) external view returns (uint256)']),
      functionName: 'balanceOf',
      args: [userSafeAddress],
    }) as bigint;

    if (wmonBalance < tierPrice) {
      return NextResponse.json({
        success: false,
        error: `Insufficient WMON balance. Need ${formatEther(tierPrice)} WMON, have ${formatEther(wmonBalance)} WMON`,
        safeAddress: userSafeAddress,
        required: formatEther(tierPrice),
        balance: formatEther(wmonBalance),
      }, { status: 400 });
    }

    // Check MON balance for gas
    const balanceCheck = await checkUserSafeBalance(userAddress, 0n);
    if (!balanceCheck.hasSufficientBalance) {
      return NextResponse.json({
        success: false,
        error: `Insufficient MON for gas. Balance: ${balanceCheck.currentBalance} MON`,
        safeAddress: userSafeAddress,
        fundingInstructions: `Send MON to ${userSafeAddress}`,
      }, { status: 400 });
    }

    // Step 1: Approve WMON for TurboCohort (with 10% buffer)
    const approveAmount = tierPrice + (tierPrice / 10n);
    console.log(`[TurboPay] Step 1: Approving ${formatEther(approveAmount)} WMON`);

    const approveResult = await sendUserSafeTransaction(userAddress, [
      {
        to: WMON_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
          functionName: 'approve',
          args: [TURBO_COHORT, approveAmount],
        }) as Hex,
      },
    ]);

    console.log(`[TurboPay] Approve tx: ${approveResult.txHash}`);

    // Wait for approval to settle
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Call payMonthly on TurboCohort
    console.log(`[TurboPay] Step 2: Calling payMonthly(${tierInfo.id})`);

    const payResult = await sendUserSafeTransaction(userAddress, [
      {
        to: TURBO_COHORT,
        value: 0n,
        data: encodeFunctionData({
          abi: parseAbi(['function payMonthly(uint8 tier) external']),
          functionName: 'payMonthly',
          args: [tierInfo.id],
        }) as Hex,
      },
    ]);

    console.log(`[TurboPay] Payment tx: ${payResult.txHash}`);

    return NextResponse.json({
      success: true,
      tier: tierInfo.name,
      amount: formatEther(tierPrice),
      approveTxHash: approveResult.txHash,
      paymentTxHash: payResult.txHash,
      safeAddress: userSafeAddress,
      explorerLink: `https://monadscan.com/tx/${payResult.txHash}`,
    });
  } catch (error: any) {
    console.error('[TurboPay] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// GET: Check member status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing address parameter' },
        { status: 400 }
      );
    }

    const client = createPublicClient({
      transport: http(RPC_URL),
    });

    // Get current cohort ID
    const cohortId = await client.readContract({
      address: TURBO_COHORT,
      abi: parseAbi(['function currentCohortId() external view returns (uint256)']),
      functionName: 'currentCohortId',
    }) as bigint;

    // Get member info
    const member = await client.readContract({
      address: TURBO_COHORT,
      abi: parseAbi([
        'function getMember(uint256 cohortId, address member) external view returns (tuple(uint8 tier, uint256 cohortId, uint256 monthsPaid, uint256 lastPaymentTime, uint256 totalPaid, bool isFounder, uint256 founderAmount, uint256 tokenId))',
      ]),
      functionName: 'getMember',
      args: [cohortId, userAddress as Address],
    }) as any;

    // Get tier prices
    const [explorerPrice, builderPrice, founderPrice] = await Promise.all([
      client.readContract({
        address: TURBO_COHORT,
        abi: parseAbi(['function tierPrice(uint8) external view returns (uint256)']),
        functionName: 'tierPrice',
        args: [1],
      }),
      client.readContract({
        address: TURBO_COHORT,
        abi: parseAbi(['function tierPrice(uint8) external view returns (uint256)']),
        functionName: 'tierPrice',
        args: [2],
      }),
      client.readContract({
        address: TURBO_COHORT,
        abi: parseAbi(['function tierPrice(uint8) external view returns (uint256)']),
        functionName: 'tierPrice',
        args: [3],
      }),
    ]);

    const tierNames = ['None', 'Explorer', 'Builder', 'Founder'];

    return NextResponse.json({
      success: true,
      cohortId: Number(cohortId),
      member: {
        tier: tierNames[Number(member.tier)] || 'None',
        tierId: Number(member.tier),
        monthsPaid: Number(member.monthsPaid),
        totalPaid: formatEther(member.totalPaid as bigint),
        lastPaymentTime: Number(member.lastPaymentTime),
        isFounder: member.isFounder,
        tokenId: Number(member.tokenId),
      },
      tierPrices: {
        explorer: formatEther(explorerPrice as bigint),
        builder: formatEther(builderPrice as bigint),
        founder: formatEther(founderPrice as bigint),
      },
    });
  } catch (error: any) {
    console.error('[TurboPay] GET Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
