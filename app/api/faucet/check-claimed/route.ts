import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, Address, parseAbi } from 'viem';
import { activeChain } from '@/app/chains';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const FAUCET_ADDRESS = process.env.NEXT_PUBLIC_WMON_FAUCET as Address;

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(MONAD_RPC),
});

const faucetAbi = parseAbi([
  'function lastClaimByFid(uint256 fid) view returns (uint256)',
  'function fidToWallet(uint256 fid) view returns (address)',
  'function canClaim(address user, uint256 fid) view returns (bool canClaim_, uint256 walletCooldown, uint256 fidCooldown)',
]);

/**
 * Check if a user has claimed from the WMON faucet
 * GET /api/faucet/check-claimed?fid=12345
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get('fid');
    const addressParam = searchParams.get('address');

    if (!fidParam) {
      return NextResponse.json({ error: 'FID parameter required' }, { status: 400 });
    }

    if (!FAUCET_ADDRESS) {
      return NextResponse.json({
        success: true,
        hasClaimed: false,
        message: 'Faucet contract not configured',
      });
    }

    const fid = BigInt(fidParam);

    // Check if this FID has ever claimed (lastClaimByFid > 0)
    const lastClaimTime = await publicClient.readContract({
      address: FAUCET_ADDRESS,
      abi: faucetAbi,
      functionName: 'lastClaimByFid',
      args: [fid],
    }) as bigint;

    const hasClaimed = lastClaimTime > 0n;

    // Also check if they can claim now (for display purposes)
    let canClaimNow = false;
    let walletCooldown = 0n;
    let fidCooldown = 0n;

    if (addressParam) {
      try {
        const [canClaim_, wCooldown, fCooldown] = await publicClient.readContract({
          address: FAUCET_ADDRESS,
          abi: faucetAbi,
          functionName: 'canClaim',
          args: [addressParam as Address, fid],
        }) as [boolean, bigint, bigint];

        canClaimNow = canClaim_;
        walletCooldown = wCooldown;
        fidCooldown = fCooldown;
      } catch (err) {
        console.error('[Faucet] canClaim check failed:', err);
      }
    }

    return NextResponse.json({
      success: true,
      hasClaimed,
      lastClaimTime: lastClaimTime.toString(),
      lastClaimDate: lastClaimTime > 0n ? new Date(Number(lastClaimTime) * 1000).toISOString() : null,
      canClaimNow,
      walletCooldownSeconds: Number(walletCooldown),
      fidCooldownSeconds: Number(fidCooldown),
    });

  } catch (error: any) {
    console.error('[Faucet] Check claimed error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check faucet status',
    }, { status: 500 });
  }
}
