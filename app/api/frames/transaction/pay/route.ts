import { NextRequest, NextResponse } from "next/server";
import { activeChain } from '@/app/chains';
import { validatePaymentReceiver, WHITELISTED_RECEIVERS, sanitizeErrorForResponse } from '@/lib/auth';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';

/**
 * 🔐 FRAME PAYMENT ENDPOINT (SECURED)
 *
 * SECURITY CHANGES:
 * - Payment receiver must be whitelisted (prevents redirection attacks)
 * - Rate limited
 * - Input validation
 */

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(RateLimiters.general, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.` },
        { status: 429 }
      );
    }

    const { name, description, image, receiver, amount } = await req.json();

    if (!process.env.NEXT_PUBLIC_NEYNAR_API_KEY) {
      throw new Error("Server configuration error");
    }

    // SECURITY: Validate and sanitize inputs
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // SECURITY: Validate receiver is whitelisted
    // If no receiver provided, use treasury (default safe behavior)
    const finalReceiver = receiver || process.env.TREASURY_ADDRESS;

    const receiverValidation = validatePaymentReceiver(finalReceiver);
    if (!receiverValidation.valid) {
      console.error(`[FramePay] Blocked invalid receiver: ${receiver}`);
      return NextResponse.json(
        { error: receiverValidation.error },
        { status: 403 }
      );
    }

    // Sanitize text inputs
    const sanitizedName = (name || 'Payment')
      .toString()
      .slice(0, 100)
      .replace(/[<>"']/g, '');

    const sanitizedDescription = (description || '')
      .toString()
      .slice(0, 500)
      .replace(/[<>"']/g, '');

    console.log(`[FramePay] Creating payment: ${sanitizedName} - ${amount} TOURS to ${finalReceiver}`);

    const payload = {
      transaction: {
        to: {
          network: "monad",
          chain_id: activeChain.id,
          address: finalReceiver,
          token_contract_address: process.env.NEXT_PUBLIC_TOURS_TOKEN,
          amount,
        },
      },
      config: {
        line_items: [
          {
            name: sanitizedName,
            description: sanitizedDescription,
            image: image || `https://${process.env.PINATA_GATEWAY}/ipfs/QmEmpowerToursDefault`,
          },
        ],
        action: {
          text: "Pay Now",
          text_color: "#FFFFFF",
          button_color: "#6D28D9",
        },
      },
    };

    const response = await fetch("https://api.neynar.com/v2/farcaster/frame/transaction/pay", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.NEXT_PUBLIC_NEYNAR_API_KEY!,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Payment service error`);
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error("[FramePay] Error:", error);
    return NextResponse.json(
      { error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}
