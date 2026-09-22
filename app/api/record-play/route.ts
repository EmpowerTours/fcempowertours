import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { Redis } from "@upstash/redis";
import { authorizeUserAddress } from "@/lib/quick-auth";
import { isMasterPlayable } from "@/lib/master-playable";

// Configuration - Updated Dec 27, 2025
const PLAY_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_PLAY_ORACLE!;
const MUSIC_SUBSCRIPTION_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION!;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";
const ORACLE_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// Rate limiting with Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// PlayOracle ABI (for recording plays)
const ORACLE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "masterTokenId", type: "uint256" },
      { internalType: "uint256", name: "duration", type: "uint256" },
    ],
    name: "recordPlay",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "masterTokenId", type: "uint256" },
    ],
    name: "canPlay",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

// MusicSubscriptionV2 ABI (for subscription check)
const SUBSCRIPTION_ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "hasActiveSubscription",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

// Simple config
const MIN_PLAY_DURATION = 30; // seconds
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // max plays per minute per user

interface PlayRequest {
  userAddress: string;
  masterTokenId: number;
  duration: number;
  userFid?: number;
  songName?: string;
  artistName?: string;
  artistFid?: number;
  /** Cast hash from a share link (?via=), so the sharer can be credited for bringing them. */
  via?: string;
}

// Simple rate limiting
async function checkRateLimit(
  userAddress: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:play:${userAddress.toLowerCase()}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }
    return {
      allowed: current <= RATE_LIMIT_MAX_REQUESTS,
      remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current),
    };
  } catch (error) {
    // ---- FAIL CLOSED. Returning `allowed: true` here removed the only per-user cap on a
    // route that sends a transaction, exactly when Redis trouble makes a flood most likely.
    // The subscription and canPlay gates below are already fail-closed; this one was the
    // odd man out, so an outage turned the rate limiter off rather than turning plays off.
    console.error("Rate limit check failed, denying:", error);
    return { allowed: false, remaining: 0 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: PlayRequest = await req.json();
    const {
      userAddress,
      masterTokenId,
      duration,
      userFid,
      songName,
      artistName,
      artistFid,
      via,
    } = body;

    console.log("🎵 Record play request:", {
      userAddress,
      masterTokenId,
      duration,
      userFid,
    });

    // Basic validation
    if (!userAddress || !masterTokenId || duration === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: userAddress, masterTokenId, duration",
        },
        { status: 400 },
      );
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { success: false, error: "Invalid user address format" },
        { status: 400 },
      );
    }

    if (duration < MIN_PLAY_DURATION) {
      return NextResponse.json(
        {
          success: false,
          error: `Play duration must be at least ${MIN_PLAY_DURATION} seconds`,
        },
        { status: 400 },
      );
    }

    // ---- Ownership. Recording a play CREDITS `userAddress` with reward points, so an
    // unauthenticated caller cannot steal with this — but they can inflate a chosen address's
    // pro-rata share, which dilutes every honest listener.
    //
    // Observed rather than enforced, deliberately: this fires automatically after 30s of
    // audio, and a wallet-only listener has no Quick Auth token, so hard-gating would demand
    // a wallet signature per song. Inside Farcaster the header costs nothing and proves the
    // FID. The log line is what makes the remaining gap measurable instead of invisible —
    // `wouldRejectWhenEnforced` is the same signal the rest of the app migrated on.
    //
    // Note this does NOT stop self-farming, which needs no forged identity. The bounds on
    // that are the subscription requirement and the on-chain canPlay cooldown, both below.
    const authz = await authorizeUserAddress(req, userAddress, "record-play");
    if (!authz.ownsAddress) {
      console.warn(
        `[record-play] unproven caller for ${userAddress} (mode=${authz.mode}` +
          `${authz.reason ? `, ${authz.reason}` : ""})`,
      );
    }

    // Rate limit check
    const rateLimit = await checkRateLimit(userAddress);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Rate limit exceeded. Please wait before recording more plays.",
        },
        { status: 429 },
      );
    }

    // Setup contracts
    if (
      !ORACLE_PRIVATE_KEY ||
      !PLAY_ORACLE_ADDRESS ||
      !MUSIC_SUBSCRIPTION_ADDRESS
    ) {
      console.error(
        "❌ Missing config: ORACLE_PRIVATE_KEY, PLAY_ORACLE_ADDRESS, or MUSIC_SUBSCRIPTION_ADDRESS",
      );
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    const provider = new JsonRpcProvider(MONAD_RPC);
    const oracleWallet = new Wallet(ORACLE_PRIVATE_KEY, provider);
    const oracleContract = new Contract(
      PLAY_ORACLE_ADDRESS,
      ORACLE_ABI,
      oracleWallet,
    );
    const subscriptionContract = new Contract(
      MUSIC_SUBSCRIPTION_ADDRESS,
      SUBSCRIPTION_ABI,
      provider,
    );

    // ---- Subscription check. FAIL CLOSED: this gate is what makes farming cost
    // money, and swallowing an RPC error used to record the play regardless.
    try {
      const hasSubscription =
        await subscriptionContract.hasActiveSubscription(userAddress);
      if (!hasSubscription) {
        return NextResponse.json(
          { success: false, error: "No active subscription" },
          { status: 403 },
        );
      }
    } catch (error: any) {
      console.error("Subscription check failed:", error.message);
      return NextResponse.json(
        { success: false, error: "Could not verify subscription" },
        { status: 503 },
      );
    }

    // ---- Anti-replay. FAIL CLOSED for the same reason: an unchecked play is a
    // free, unbounded play.
    try {
      const canPlay = await oracleContract.canPlay(userAddress, masterTokenId);
      if (!canPlay) {
        return NextResponse.json(
          { success: false, error: "Please wait before replaying this song" },
          { status: 429 },
        );
      }
    } catch (error: any) {
      console.error("canPlay check failed:", error.message);
      return NextResponse.json(
        { success: false, error: "Could not verify replay eligibility" },
        { status: 503 },
      );
    }

    // A suspended or purged master must not earn. recordPlay itself has no such check and the
    // contract is immutable, so refusing here is the only way it is refused at all.
    const playable = await isMasterPlayable(masterTokenId);
    if (!playable.playable) {
      console.warn(`[RecordPlay] refusing: ${playable.reason}`);
      return NextResponse.json(
        { success: false, error: "This track is not available" },
        { status: 409 },
      );
    }

    // Record play via PlayOracle
    console.log("⚡ Recording play via PlayOracle...");

    try {
      const tx = await oracleContract.recordPlay(
        userAddress,
        masterTokenId,
        duration,
      );
      console.log("📤 Transaction sent:", tx.hash);

      const receipt = await tx.wait();
      if (receipt?.status !== 1) {
        throw new Error("Transaction failed");
      }

      console.log("✅ Play recorded!");

      // Credit whoever brought this listener. Rides on a play that already succeeded and
      // swallows its own errors, so it can never fail one — the same contract the discovery
      // stamp follows. The subscription gate above has already run, so a manufactured credit
      // costs a real subscription.
      if (via) {
        const { creditShareOnPlay } = await import("@/lib/share-credit");
        const credit = await creditShareOnPlay(redis, via, userAddress);
        if (credit.credited) {
          console.log(
            `[share-credit] ${credit.sharer?.slice(0, 10)} brought ${userAddress.slice(0, 10)}`,
          );
        }
      }

      // Cast to Farcaster (non-blocking, don't wait for result)
      if (userFid) {
        const appUrl =
          process.env.NEXT_PUBLIC_URL ||
          "https://fcempowertours-production-6551.up.railway.app";
        fetch(`${appUrl}/api/cast-nft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "play_recorded",
            fid: userFid,
            tokenId: masterTokenId,
            txHash: tx.hash,
            params: {
              songName: songName || `Song #${masterTokenId}`,
              artistName: artistName,
              artistFid: artistFid,
              duration: duration,
            },
          }),
        }).catch((err) =>
          console.log("Cast failed (non-blocking):", err.message),
        );
      }

      return NextResponse.json({
        success: true,
        txHash: tx.hash,
        rateLimit: {
          remaining: rateLimit.remaining - 1,
          resetIn: RATE_LIMIT_WINDOW,
        },
      });
    } catch (error: any) {
      console.error("❌ On-chain record failed:", error);

      let errorMessage = "Failed to record play";
      if (error.message?.includes("Replay too soon")) {
        errorMessage = "Please wait before replaying the same song";
      } else if (error.message?.includes("Daily play limit")) {
        errorMessage = "Daily play limit reached";
      } else if (error.message?.includes("Song play limit")) {
        errorMessage = "Song play limit reached for today";
      } else if (error.message?.includes("Account flagged")) {
        errorMessage = "Account flagged. Contact support.";
      }

      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 400 },
      );
    }
  } catch (error: any) {
    console.error("❌ Record play error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "record-play",
    contracts: {
      playOracle: PLAY_ORACLE_ADDRESS || "NOT_SET",
      musicSubscription: MUSIC_SUBSCRIPTION_ADDRESS || "NOT_SET",
    },
    limits: {
      minDuration: MIN_PLAY_DURATION,
      maxPlaysPerMinute: RATE_LIMIT_MAX_REQUESTS,
    },
  });
}
