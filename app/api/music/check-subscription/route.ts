import { NextRequest, NextResponse } from "next/server";
import {
  subscriptionInfoAbi,
  decodeSubscriptionInfo,
} from "@/lib/contract-generation";
import { createPublicClient, http } from "viem";
import { activeChain } from "@/app/chains";

const MUSIC_SUBSCRIPTION_ADDRESS = process.env
  .NEXT_PUBLIC_MUSIC_SUBSCRIPTION as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC!;

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(RPC_URL),
});

const SUBSCRIPTION_ABI = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "hasActiveSubscription",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { success: false, error: "Address required" },
        { status: 400 },
      );
    }

    if (!MUSIC_SUBSCRIPTION_ADDRESS) {
      return NextResponse.json(
        { success: false, error: "Music subscription contract not configured" },
        { status: 500 },
      );
    }

    // Check if subscription contract exists
    const contractCode = await publicClient.getCode({
      address: MUSIC_SUBSCRIPTION_ADDRESS,
    });
    if (!contractCode || contractCode === "0x") {
      // Contract not deployed at this address
      return NextResponse.json({
        success: true,
        hasSubscription: false,
        subscriptionInfo: null,
      });
    }

    // Check if user has active subscription
    let hasSubscription = false;
    try {
      hasSubscription = (await publicClient.readContract({
        address: MUSIC_SUBSCRIPTION_ADDRESS,
        abi: SUBSCRIPTION_ABI,
        functionName: "hasActiveSubscription",
        args: [address as `0x${string}`],
      })) as boolean;
    } catch (readErr: any) {
      // Contract exists but function reverted or returned invalid data
      console.warn(
        "[check-subscription] hasActiveSubscription failed:",
        readErr.message,
      );
      return NextResponse.json({
        success: true,
        hasSubscription: false,
        subscriptionInfo: null,
      });
    }

    // Get subscription info if active
    let subscriptionInfo = null;
    if (hasSubscription) {
      try {
        // The tuple shape depends on which subscription contract is deployed: V6 dropped
        // `flagVotes`, so `lastTier` moves from index 5 to index 4. Decoding that positionally
        // here would not throw against the wrong generation — it would silently report the
        // wrong tier and flag state. `decodeSubscriptionInfo` resolves it by generation.
        const info = (await publicClient.readContract({
          address: MUSIC_SUBSCRIPTION_ADDRESS,
          abi: subscriptionInfoAbi(),
          functionName: "getSubscriptionInfo",
          args: [address as `0x${string}`],
        })) as readonly unknown[];

        const { userFid, expiry, active, totalPlays, lastTier, isFlagged } =
          decodeSubscriptionInfo(info);
        const expiryTimestamp = Number(expiry);
        const now = Math.floor(Date.now() / 1000);
        const daysRemaining = Math.max(
          0,
          Math.floor((expiryTimestamp - now) / 86400),
        );

        subscriptionInfo = {
          // 0 means the subscriber has no Farcaster account, which is normal from V6 onward.
          userFid: Number(userFid),
          expiry: expiryTimestamp,
          active,
          totalPlays: Number(totalPlays),
          daysRemaining,
          tier: lastTier,
          isFlagged,
        };
      } catch (infoErr: any) {
        console.warn(
          "[check-subscription] getSubscriptionInfo failed:",
          infoErr.message,
        );
      }
    }

    return NextResponse.json({
      success: true,
      hasSubscription,
      subscriptionInfo,
    });
  } catch (error: any) {
    console.error("[check-subscription] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to check subscription",
      },
      { status: 500 },
    );
  }
}
