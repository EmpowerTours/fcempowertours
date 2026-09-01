import { NextRequest, NextResponse } from "next/server";
import { registerUserSafeOnV2Contracts } from "@/lib/user-safe";
import { authorizeUserAddress } from "@/lib/quick-auth";
import { delegationProvesOwnership } from "@/lib/delegation-proof";
import { checkRateLimit, getClientIP, RateLimiters } from "@/lib/rate-limit";
import {
  reservePlatformGas,
  PlatformGasBudgets,
} from "@/lib/platform-gas-budget";

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
    // A proven delegation is accepted here for the same reason execute-delegated
    // accepts one: it was created only after ownership was proven, so demanding
    // a second signature re-establishes a fact already established and costs the
    // user a second wallet prompt on their very first mint.
    //
    // No action name is passed. Registering the Safe is a prerequisite of using
    // the delegation at all rather than one of its listed permissions — an
    // unregistered Safe cannot mint, so every permission it holds is inert
    // until this runs.
    //
    // The gas exposure this route worried about is bounded elsewhere and still
    // is: reservePlatformGas caps total daily spend across all callers, and the
    // rate limit below caps one caller. Neither depends on the signature, and an
    // attacker's cost is unchanged — a delegation itself requires proving
    // ownership once, which is exactly what the second signature asked for.
    if (!authz.ownsAddress && !(await delegationProvesOwnership(userAddress))) {
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

    // A global ceiling, not a per-caller one. The rate limit above bounds what ONE caller can
    // do; proving ownership of an address is free and unlimited, so N fresh wallets each pass
    // authentication and each pass their own limit while the platform pays for all of them.
    //
    // This became a live concern on 2026-08-24 rather than a theoretical one: until
    // PassportNFTV4.platformOperator was set (9d2e660), the registration batch reverted during
    // gas estimation and no transaction was ever sent. Fixing the feature turned a route that
    // spent nothing into one that spends.
    const budget = await reservePlatformGas(
      PlatformGasBudgets.registerUserSafe,
    );
    if (!budget.allowed) {
      console.warn(
        `[RegisterUserSafe] refused: platform gas budget ${budget.degraded ? "unavailable" : "exhausted"}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: budget.degraded
            ? "Safe registration is temporarily unavailable. Please try again shortly."
            : "Daily Safe-registration limit reached. Please try again tomorrow.",
        },
        { status: 503, headers: { "Retry-After": String(budget.resetIn) } },
      );
    }

    console.log(
      `[RegisterUserSafe] Registering: ${userAddress} (${budget.remaining} left in today's budget)`,
    );

    const result = await registerUserSafeOnV2Contracts(userAddress);

    // Answer 200 only when the Safe is actually registered. This used to return
    // 200 carrying success:false, and registerUserSafeOnV2Contracts swallows
    // every error into exactly that — so a caller checking res.ok believed the
    // Safe was registered, went on to mint, and reverted with "Not authorized
    // to mint". The failure that mattered was reported nowhere, and the error
    // the user saw named nothing.
    if (!result.success) {
      console.error(
        `[RegisterUserSafe] FAILED for ${userAddress}: ${result.status} ${result.detail || ""}`,
      );
      return NextResponse.json(
        {
          success: false,
          status: result.status,
          detail: result.detail,
          error: result.detail
            ? `Could not register your account for minting: ${result.detail}`
            : "Could not register your account for minting. This is a platform-side " +
              "failure, not something you can fix by retrying — please report it.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
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
