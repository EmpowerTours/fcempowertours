import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseAbi, Address, Hex, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const dynamic = 'force-dynamic';

const TURBO_GOVERNANCE = process.env.TURBO_GOVERNANCE_ADDRESS as Address;
const TURBO_COHORT = process.env.NEXT_PUBLIC_TURBO_COHORT as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

const TIER_MAP: Record<string, { id: number; name: string }> = {
  explorer: { id: 1, name: 'Explorer' },
  builder: { id: 2, name: 'Builder' },
  founder: { id: 3, name: 'Founder' },
};

export async function POST(req: NextRequest) {
  try {
    const { userAddress, newTier } = await req.json();

    if (!userAddress || !newTier) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or newTier' },
        { status: 400 }
      );
    }

    if (!TURBO_GOVERNANCE || !DEPLOYER_KEY) {
      return NextResponse.json(
        { success: false, error: 'Governance not configured' },
        { status: 500 }
      );
    }

    const tierInfo = TIER_MAP[newTier.toLowerCase()];
    if (!tierInfo) {
      return NextResponse.json(
        { success: false, error: 'Invalid tier' },
        { status: 400 }
      );
    }

    const client = createPublicClient({ transport: http(RPC_URL) });

    // Get current cohort and member info
    const cohortId = await client.readContract({
      address: TURBO_COHORT,
      abi: parseAbi(['function currentCohortId() external view returns (uint256)']),
      functionName: 'currentCohortId',
    }) as bigint;

    const member = await client.readContract({
      address: TURBO_COHORT,
      abi: parseAbi([
        'function getMember(uint256 cohortId, address member) external view returns (tuple(uint8 tier, uint256 cohortId, uint256 monthsPaid, uint256 lastPaymentTime, uint256 totalPaid, bool isFounder, uint256 founderAmount, uint256 tokenId, bool banned))',
      ]),
      functionName: 'getMember',
      args: [cohortId, userAddress as Address],
    }) as any;

    const currentTier = Number(member.tier);

    if (currentTier === 0) {
      return NextResponse.json(
        { success: false, error: 'Not a member yet. Make your first payment to join.' },
        { status: 400 }
      );
    }

    if (tierInfo.id <= currentTier) {
      const tierNames = ['None', 'Explorer', 'Builder', 'Founder'];
      return NextResponse.json(
        { success: false, error: `Can only upgrade. Current tier: ${tierNames[currentTier]}` },
        { status: 400 }
      );
    }

    console.log(`[TurboUpgrade] ${userAddress} upgrading from tier ${currentTier} to ${tierInfo.name}`);

    // Call governance.upgradeTier(member, newTier) using deployer key
    const account = privateKeyToAccount(DEPLOYER_KEY);
    const walletClient = createWalletClient({
      account,
      transport: http(RPC_URL),
    });

    const txHash = await walletClient.sendTransaction({
      chain: null,
      to: TURBO_GOVERNANCE,
      data: encodeFunctionData({
        abi: parseAbi(['function upgradeTier(address member, uint8 newTier) external']),
        functionName: 'upgradeTier',
        args: [userAddress as Address, tierInfo.id],
      }),
    });

    console.log(`[TurboUpgrade] Upgrade tx: ${txHash}`);

    return NextResponse.json({
      success: true,
      txHash,
      previousTier: currentTier,
      newTier: tierInfo.name,
      newTierId: tierInfo.id,
    });
  } catch (error: any) {
    console.error('[TurboUpgrade] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
