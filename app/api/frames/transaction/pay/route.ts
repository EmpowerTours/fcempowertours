import { NextRequest, NextResponse } from "next/server";
import { activeChain } from '@/app/chains';

export async function POST(req: NextRequest) {
  try {
    const { name, description, image, receiver, amount } = await req.json();

    if (!process.env.NEXT_PUBLIC_NEYNAR_API_KEY) {
      throw new Error("Missing NEYNAR_API_KEY in environment");
    }

    const payload = {
      transaction: {
        to: {
          network: "monad",
          chain_id: activeChain.id,
          address: receiver || process.env.TREASURY_ADDRESS,
          token_contract_address: process.env.NEXT_PUBLIC_TOURS_TOKEN,
          amount,
        },
      },
      config: {
        line_items: [
          {
            name,
            description,
            image: image || `https://${process.env.PINATA_GATEWAY}/ipfs/QmEmpowerToursDefault`, // Replace QmEmpowerToursDefault
          },
        ],
        action: {
          text: "Pay Now",
          text_color: "#FFFFFF",
          button_color: "#6D28D9", // EmpowerTours purple
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
      throw new Error(`Neynar API error: ${data.message || response.statusText}`);
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to create transaction frame:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
