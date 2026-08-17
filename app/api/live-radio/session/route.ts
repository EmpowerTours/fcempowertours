import { NextRequest, NextResponse } from "next/server";

import { authorizeUserAddress } from "@/lib/quick-auth";
import { checkRateLimit, getClientIP, RateLimiters } from "@/lib/rate-limit";
import { createRadioSession, RADIO_SESSION_CONTEXT } from "@/lib/radio-session";

export const dynamic = "force-dynamic";

/**
 * Mint a radio listen session.
 *
 *   POST /api/live-radio/session   { userAddress }
 *   → { success, token, expiresIn }
 *
 * Prove you control the address once here, then carry the returned token in the
 * `x-radio-session` header on every heartbeat. See lib/radio-session.ts for why
 * the heartbeat itself cannot ask for a signature.
 *
 * Ownership is proven through the existing authorizeUserAddress(): a Quick Auth
 * token for mini app users, a wallet signature for anyone else (which is what
 * will let the web player at api.empowertours.xyz earn plays without Farcaster).
 *
 * NOTE ON STRICTNESS: this endpoint requires `ownsAddress`, not merely
 * `allowed`. With ENFORCE_QUICK_AUTH off, authorizeUserAddress still returns
 * allowed:true for an unauthenticated caller so that pre-existing routes keep
 * working. This route is new surface with nothing to keep working, so it rejects
 * unproven callers today rather than waiting for the enforcement flag to flip.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userAddress } = body as { userAddress?: string };

    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: "A valid userAddress is required" },
        { status: 400 },
      );
    }

    const rateLimit = await checkRateLimit(
      RateLimiters.general,
      getClientIP(req),
      userAddress,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 },
      );
    }

    const decision = await authorizeUserAddress(
      req,
      userAddress,
      RADIO_SESSION_CONTEXT,
    );

    if (!decision.ownsAddress) {
      return NextResponse.json(
        {
          success: false,
          error:
            decision.reason ||
            "Prove you control this address with a Quick Auth token or a wallet signature",
        },
        { status: 401 },
      );
    }

    const { token, expiresIn } = await createRadioSession(userAddress);

    return NextResponse.json({ success: true, token, expiresIn });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[RadioSession] Mint failed:", message.slice(0, 120));
    return NextResponse.json(
      { success: false, error: "Could not start a listen session" },
      { status: 500 },
    );
  }
}
