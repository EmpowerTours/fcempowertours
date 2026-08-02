import { NextRequest, NextResponse } from "next/server";
import { registerUserSafeOnV2Contracts } from "@/lib/user-safe";
import { authorizeUserAddress } from "@/lib/quick-auth";
import { checkRateLimit, getClientIP, RateLimiters } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { userAddress } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: "Missing userAddress" },
        { status: 400 },
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: "Invalid Ethereum address format" },
        { status: 400 },
      );
    }

    // SECURITY: this route spends PLATFORM gas to register a Safe on-chain.
    // Unauthenticated, it was an unbounded gas-drain: every fresh address
    // forces up to 3 platform-funded txs. Fail-closed on proven ownership of
    // userAddress, plus a rate limit. (Internal callers don't use this HTTP
    // route — execute-delegated registers via the ensureUserSafeRegistered
    // lib function directly.)
    const authz = await authorizeUserAddress(
      req,
      userAddress,
      "register-user-safe",
    );
    if (!authz.ownsAddress) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Authentication required. Reopen the mini app to sign in with Farcaster, or connect your wallet and sign to prove you own this address.",
        },
        { status: 401 },
      );
    }

    const rl = await checkRateLimit(
      RateLimiters.execute,
      getClientIP(req),
      userAddress,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rl.resetIn}s.`,
        },
        { status: 429 },
      );
    }

    console.log("[RegisterUserSafe] Registering:", userAddress);

    const result = await registerUserSafeOnV2Contracts(userAddress);

    return NextResponse.json({
      success: result.success,
      status: result.status,
      txHash: result.txHash || null,
    });
  } catch (error: any) {
    console.error("[RegisterUserSafe] Error:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
