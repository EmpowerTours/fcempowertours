import { NextRequest, NextResponse } from 'next/server';
import { handleX402Payment, X402_PRICES, isX402Configured } from '@/lib/x402';
import { GoogleGenAI } from '@google/genai';
import { redis } from '@/lib/redis';

/**
 * x402 Payable Oracle Endpoint
 *
 * AI agents can query this endpoint by paying micropayments.
 * Payment is handled via x402 protocol with Thirdweb facilitator.
 *
 * Cost: $0.001 USDC per query
 *
 * Usage:
 * 1. First call without payment -> returns 402 with payment requirements
 * 2. Client signs payment and includes x-payment header
 * 3. Payment settles, response returned
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://fcempowertours-production-6551.up.railway.app';

// System prompt for the paid oracle
const ORACLE_SYSTEM_PROMPT = `You are the EmpowerTours World Oracle - a premium AI service for agents in the EmpowerTours virtual world on Monad blockchain.

You have deep knowledge of:
- The EmpowerTours Agent World (entry fees, actions, rewards)
- Monad blockchain (high TPS, low fees, EVM compatible)
- Music NFTs, TOURS tokens, EMPTOURS tokens
- Agent coordination and strategies

Provide concise, actionable advice. You're being paid per query so make every response valuable.

Available actions agents can take:
- buy_music: Purchase music NFTs
- tip_artist: Tip music artists
- radio_queue_song: Queue songs on the radio
- buy_art: Purchase art NFTs
- mint_passport: Mint identity passport

Current token addresses:
- TOURS: 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF
- EMPTOURS: 0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777
- Entry fee receiver: 0xf3b9D123E7Ac8C36FC9b5AB32135c665956725bA
`;

export async function POST(req: NextRequest) {
  try {
    // Check if x402 is configured
    if (!isX402Configured()) {
      return NextResponse.json({
        success: false,
        error: 'x402 payments not configured on this server',
        fallback: '/api/world/oracle', // Free endpoint (rate limited)
      }, { status: 503 });
    }

    // Handle x402 payment
    const resourceUrl = `${BASE_URL}/api/world/oracle-paid`;
    const result = await handleX402Payment(
      req,
      resourceUrl,
      X402_PRICES.ORACLE_QUERY,
      'POST'
    );

    // If payment not settled, return 402 with payment requirements
    if (result.status !== 200) {
      return new NextResponse(
        JSON.stringify(result.responseBody),
        {
          status: result.status,
          headers: {
            'Content-Type': 'application/json',
            ...(result.responseHeaders || {}),
          },
        }
      );
    }

    // Payment successful - process the query
    const body = await req.json();
    const { query, agentAddress, context } = body;

    if (!query) {
      return NextResponse.json({
        success: false,
        error: 'Missing query parameter',
      }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Oracle AI not configured',
      }, { status: 503 });
    }

    // Get world context for better responses
    let worldContext = '';
    try {
      const agentCount = await redis.scard('world:agents') || 0;
      const recentEvents = await redis.lrange('world:events', 0, 5);
      worldContext = `
Current world state:
- Total agents: ${agentCount}
- Recent events: ${recentEvents.length > 0 ? recentEvents.map(e => {
        try { return JSON.parse(e as string).description; } catch { return ''; }
      }).filter(Boolean).join(', ') : 'None'}
`;
    } catch {
      // Ignore Redis errors
    }

    // Query Gemini
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = `${ORACLE_SYSTEM_PROMPT}

${worldContext}

${context ? `Additional context: ${context}` : ''}

Agent query${agentAddress ? ` (from ${agentAddress})` : ''}: ${query}

Provide a helpful, concise response:`;

    const genResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const response = genResult.text?.trim() || 'No response generated';

    // Log paid query for analytics
    console.log(`[Oracle-Paid] Query from ${agentAddress || 'unknown'}: ${query.slice(0, 100)}...`);
    console.log(`[Oracle-Paid] Payment receipt: ${result.paymentReceipt}`);

    return NextResponse.json({
      success: true,
      response,
      paid: true,
      price: X402_PRICES.ORACLE_QUERY,
      paymentReceipt: result.paymentReceipt,
      model: 'gemini-1.5-flash',
    });

  } catch (err: any) {
    console.error('[Oracle-Paid] Error:', err);
    return NextResponse.json({
      success: false,
      error: 'Oracle error: ' + (err.message || 'Unknown error'),
    }, { status: 500 });
  }
}

// GET endpoint for info
export async function GET() {
  const configured = isX402Configured();

  return NextResponse.json({
    success: true,
    service: 'EmpowerTours Paid Oracle',
    description: 'Premium AI oracle for agents - pay per query via x402',
    pricing: {
      query: X402_PRICES.ORACLE_QUERY,
      currency: 'USDC',
      network: 'Monad (Chain ID: 143)',
    },
    x402Configured: configured,
    usage: {
      method: 'POST',
      body: {
        query: 'Your question here',
        agentAddress: '0x... (optional)',
        context: 'Additional context (optional)',
      },
      headers: {
        'x-payment': 'Signed payment data (from x402 client)',
      },
    },
    fallback: configured ? null : '/api/world/oracle (free, rate-limited)',
  });
}
