import { createThirdwebClient } from 'thirdweb';
import { facilitator, settlePayment } from 'thirdweb/x402';
import { defineChain } from 'thirdweb/chains';

// Monad Mainnet chain definition for thirdweb
export const monadMainnetThirdweb = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18,
  },
  rpc: 'https://mainnet.monad.xyz',
  blockExplorers: [
    {
      name: 'Monad Explorer',
      url: 'https://explorer.monad.xyz',
    },
  ],
});

// Initialize Thirdweb client (server-side)
export function getThirdwebClient() {
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    throw new Error('THIRDWEB_SECRET_KEY not configured');
  }
  return createThirdwebClient({ secretKey });
}

// Get Thirdweb x402 facilitator
export function getX402Facilitator() {
  const client = getThirdwebClient();
  const serverWallet = process.env.THIRDWEB_SERVER_WALLET;

  if (!serverWallet) {
    throw new Error('THIRDWEB_SERVER_WALLET not configured');
  }

  return facilitator({
    client,
    serverWalletAddress: serverWallet,
  });
}

// Pricing tiers for different endpoints
export const X402_PRICES = {
  // Oracle queries - AI processing costs
  ORACLE_QUERY: '$0.001',        // $0.001 per AI query
  ORACLE_COMPLEX: '$0.005',      // Complex multi-step queries

  // Premium data access
  LEADERBOARD_DETAILED: '$0.0005',  // Detailed analytics
  AGENT_HISTORY: '$0.001',          // Full agent history

  // Agent-to-agent services
  AGENT_SERVICE_BASE: '$0.0001',    // Base fee for agent services
} as const;

// Helper to handle x402 payment settlement
export async function handleX402Payment(
  request: Request,
  resourceUrl: string,
  price: string,
  method: 'GET' | 'POST' = 'GET'
) {
  const client = getThirdwebClient();
  const facilitatorInstance = getX402Facilitator();
  const serverWallet = process.env.THIRDWEB_SERVER_WALLET!;

  const paymentData = request.headers.get('x-payment');

  const result = await settlePayment({
    resourceUrl,
    method,
    paymentData,
    network: monadMainnetThirdweb,
    price,
    payTo: serverWallet,
    facilitator: facilitatorInstance,
  });

  return result;
}

// Check if x402 is configured
export function isX402Configured(): boolean {
  return !!(
    process.env.THIRDWEB_SECRET_KEY &&
    process.env.THIRDWEB_SERVER_WALLET &&
    process.env.THIRDWEB_CLIENT_ID
  );
}
