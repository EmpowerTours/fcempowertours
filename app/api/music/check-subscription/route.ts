import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { activeChain } from '@/app/chains';

const MUSIC_SUBSCRIPTION_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz';

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(RPC_URL),
});

const SUBSCRIPTION_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'hasActiveSubscription',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getSubscriptionInfo',
    outputs: [
      { name: 'userFid', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'active', type: 'bool' },
      { name: 'totalPlays', type: 'uint256' },
      { name: 'flagVotes', type: 'uint256' },
      { name: 'lastTier', type: 'uint8' },
      { name: 'isFlagged', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address required' },
        { status: 400 }
      );
    }

    if (!MUSIC_SUBSCRIPTION_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'Music subscription contract not configured' },
        { status: 500 }
      );
    }

    // Check if user has active subscription
    const hasSubscription = await publicClient.readContract({
      address: MUSIC_SUBSCRIPTION_ADDRESS,
      abi: SUBSCRIPTION_ABI,
      functionName: 'hasActiveSubscription',
      args: [address as `0x${string}`],
    });

    // Get subscription info if active
    let subscriptionInfo = null;
    if (hasSubscription) {
      const info = await publicClient.readContract({
        address: MUSIC_SUBSCRIPTION_ADDRESS,
        abi: SUBSCRIPTION_ABI,
        functionName: 'getSubscriptionInfo',
        args: [address as `0x${string}`],
      });

      const [userFid, expiry, active, totalPlays, flagVotes, lastTier, isFlagged] = info;
      const expiryTimestamp = Number(expiry);
      const now = Math.floor(Date.now() / 1000);
      const daysRemaining = Math.max(0, Math.floor((expiryTimestamp - now) / 86400));

      subscriptionInfo = {
        userFid: Number(userFid),
        expiry: expiryTimestamp,
        active,
        totalPlays: Number(totalPlays),
        daysRemaining,
        tier: Number(lastTier),
        isFlagged,
      };
    }

    return NextResponse.json({
      success: true,
      hasSubscription,
      subscriptionInfo,
    });
  } catch (error: any) {
    console.error('[check-subscription] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check subscription' },
      { status: 500 }
    );
  }
}
