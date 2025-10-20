import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { command } = await req.json();

    if (!command) {
      throw new Error("Missing command in request");
    }

    // ✅ FIX: Use correct model name for Gemini API
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const aiPrompt = `
Analyze this user command for EmpowerTours app context: "${command}".
Decide if it should trigger a transaction, mint, cast, or navigation.

Output JSON ONLY:
{
  "actions": [
    {
      "type": "navigate" | "mint_passport" | "create_pay_frame" | "post_cast",
      "params": {
        "path"?: string,
        "country"?: string,
        "name"?: string,
        "description"?: string,
        "receiver"?: string,
        "amount"?: number,
        "image"?: string
      }
    }
  ],
  "reason": "Brief explanation"
}
Examples:
- "Book a trip to Japan" → { "type": "create_pay_frame", "params": { "name": "Japan Itinerary", "description": "Book a trip to Japan for 0.01 TOK", "receiver": "${process.env.TREASURY_ADDRESS}", "amount": 0.01, "image": "https://${process.env.PINATA_GATEWAY}/ipfs/QmJapanImage" } }
- "Mint passport for France" → { "type": "mint_passport", "params": { "country": "FR" } }
- "Go to profile" → { "type": "navigate", "params": { "path": "/profile" } }
- "Share update" → { "type": "post_cast", "params": { "text": "EmpowerTours update!" } }
`;
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
      generationConfig: { maxOutputTokens: 256 },
    });
    const rawText = result.response.text().trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid Gemini response format");
    }
    const parsedResponse = JSON.parse(jsonMatch[0]);

    const results = [];
    for (const action of parsedResponse.actions) {
      if (action.type === "create_pay_frame") {
        const frameRes = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/frames/transaction/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.params),
        });
        const frame = await frameRes.json();
        if (!frame.transaction_frame?.url) {
          throw new Error("Failed to get frame URL");
        }
        const castRes = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/frames/cast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `🎟️ ${action.params?.description || "New EmpowerTours transaction!"}`,
            frameUrl: frame.transaction_frame.url,
          }),
        });
        results.push({ type: action.type, status: "success", cast: await castRes.json() });
      } else if (action.type === "mint_passport") {
        results.push({ type: action.type, status: "pending", message: `Mint requested for ${action.params.country}` });
      } else if (action.type === "navigate") {
        results.push({ type: action.type, status: "success", path: action.params.path });
      } else if (action.type === "post_cast") {
        const castRes = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/frames/cast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: action.params.text || "🌍 EmpowerTours update!" }),
        });
        results.push({ type: action.type, status: "success", cast: await castRes.json() });
      }
    }

    return NextResponse.json({ results, reason: parsedResponse.reason });
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
