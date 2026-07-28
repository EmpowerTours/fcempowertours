import { NextRequest, NextResponse } from "next/server";
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { verifyQuickAuth } from "@/lib/quick-auth";
import { checkRateLimit, getClientIP, RateLimiters } from "@/lib/rate-limit";

const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID!;
// Server-only key (was NEXT_PUBLIC_, which leaks into the browser bundle).
const NEYNAR_API_KEY =
  process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;

const neynar = new NeynarAPIClient({
  apiKey: NEYNAR_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { txHash, amount, fromAddress, toAddress, username, fid } =
      await req.json();

    if (!txHash || !amount || !fromAddress) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // SECURITY: this publishes a cast from the OFFICIAL bot account. It was
    // unauthenticated, so anyone could make the bot post arbitrary
    // "@user sent N MON <link>" messages (phishing / brand abuse / paid Neynar
    // burn). Require a real, verified Farcaster user (a valid Quick Auth token)
    // and rate-limit it. Ownership isn't checked here because the caller
    // reports the platform Safe as fromAddress, not their own wallet — so the
    // meaningful gate is "authenticated human", not address ownership.
    const auth = await verifyQuickAuth(req);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Farcaster authentication required." },
        { status: 401 },
      );
    }
    const rl = await checkRateLimit(
      RateLimiters.transfer,
      getClientIP(req),
      String(auth.user.fid),
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

    console.log("📤 [SEND-MON-CALLBACK] Transaction completed:", {
      txHash,
      amount,
      fromAddress,
      toAddress,
      username,
      fid,
    });

    // Create a cast about the transaction
    const explorerUrl = `https://monadscan.com/tx/${txHash}`;

    let castText = `✅ ${username ? `@${username}` : "User"} sent ${amount} MON!\n\n`;
    castText += `View transaction:\n${explorerUrl}`;

    try {
      const cast = await neynar.publishCast({
        signerUuid: BOT_SIGNER_UUID,
        text: castText,
      });

      console.log(
        "✅ [SEND-MON-CALLBACK] Bot cast published:",
        cast.cast?.hash,
      );

      return NextResponse.json({
        success: true,
        castHash: cast.cast?.hash,
        message: "Transaction recorded and cast published",
      });
    } catch (castError: any) {
      console.error(
        "❌ [SEND-MON-CALLBACK] Failed to publish cast:",
        castError,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Failed to publish cast",
          details: castError.message,
        },
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error("❌ [SEND-MON-CALLBACK] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
