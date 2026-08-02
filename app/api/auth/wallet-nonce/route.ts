import { NextRequest, NextResponse } from "next/server";

import { buildActionMessage } from "@/lib/auth";
import { checkRateLimit, getClientIP, RateLimiters } from "@/lib/rate-limit";
import { issueWalletNonce } from "@/lib/wallet-auth";

export const dynamic = "force-dynamic";

/**
 * Issue a nonce for wallet-signature authentication.
 *
 *   GET /api/auth/wallet-nonce?address=0x...&context=execute-delegated:send_mon
 *
 * Returns the nonce, timestamp and the exact message to sign. Returning the
 * message rather than asking the client to rebuild it removes a whole class of
 * "signature doesn't verify" bugs where the two sides format it differently.
 *
 * The nonce is bound to BOTH the address and the context, so a nonce issued for
 * one action cannot be spent on another. It is single-use and expires; see
 * NONCE_EXPIRY_SECONDS in lib/auth.ts.
 *
 * This is only needed by wallet-only users. Farcaster mini app callers keep
 * using Quick Auth and never touch this endpoint.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    const context = searchParams.get("context");

    if (!address || !context) {
      return NextResponse.json(
        { success: false, error: "address and context parameters required" },
        { status: 400 },
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: "Invalid Ethereum address format" },
        { status: 400 },
      );
    }

    // Keep the context a bounded, predictable token — it is echoed into the
    // signed message and used as a Redis key component.
    if (!/^[a-zA-Z0-9:_-]{1,64}$/.test(context)) {
      return NextResponse.json(
        { success: false, error: "Invalid context" },
        { status: 400 },
      );
    }

    const rateLimit = await checkRateLimit(
      RateLimiters.general,
      getClientIP(req),
      address,
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

    const nonce = await issueWalletNonce(address, context);
    const timestamp = Date.now();
    const message = buildActionMessage(
      address.toLowerCase(),
      timestamp,
      nonce,
      context,
    );

    return NextResponse.json({
      success: true,
      nonce,
      timestamp,
      message,
    });
  } catch (error: any) {
    console.error("[WalletNonce] Failed to issue nonce:", error?.message);
    return NextResponse.json(
      { success: false, error: "Failed to issue nonce" },
      { status: 500 },
    );
  }
}
