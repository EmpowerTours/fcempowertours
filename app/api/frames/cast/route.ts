import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, frameUrl } = await req.json();

    if (!process.env.NEXT_PUBLIC_NEYNAR_API_KEY || !process.env.BOT_SIGNER_UUID) {
      throw new Error("Missing NEYNAR_API_KEY or BOT_SIGNER_UUID");
    }

    const response = await fetch("https://api.neynar.com/v2/farcaster/cast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.NEXT_PUBLIC_NEYNAR_API_KEY!,
      },
      body: JSON.stringify({
        signer_uuid: process.env.BOT_SIGNER_UUID!,
        text: text || "🌍 EmpowerTours Transaction",
        embeds: frameUrl ? [{ url: frameUrl }] : [],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Neynar API error: ${data.message || response.statusText}`);
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to publish cast:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
