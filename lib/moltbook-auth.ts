/**
 * Moltbook Authentication for EmpowerTours Agent World
 *
 * Allows agents to authenticate using their Moltbook identity.
 * Benefits:
 * - Verified agent identity (not just any wallet)
 * - Karma-based reputation from Moltbook
 * - Owner verification (linked X/Twitter account)
 * - Prevents sybil attacks from low-karma bots
 */

export interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  follower_count: number;
  stats: {
    posts: number;
    comments: number;
  };
  owner: {
    x_handle: string;
    x_verified: boolean;
    x_follower_count: number;
  };
}

export interface MoltbookVerifyResult {
  valid: boolean;
  agent?: MoltbookAgent;
  error?: string;
}

// Minimum karma required for different tiers
export const MOLTBOOK_KARMA_TIERS = {
  BASIC: 0,        // Any verified Moltbook agent
  TRUSTED: 50,     // Skip some verification
  PREMIUM: 200,    // Premium features
  VIP: 1000,       // VIP access, reduced fees
} as const;

/**
 * Verify a Moltbook identity token
 *
 * @param token - The identity token from the agent
 * @param audience - Optional audience restriction (your domain)
 * @returns Verification result with agent profile if valid
 */
export async function verifyMoltbookIdentity(
  token: string,
  audience?: string
): Promise<MoltbookVerifyResult> {
  try {
    const body: Record<string, string> = { token };
    if (audience) {
      body.audience = audience;
    }

    const response = await fetch('https://moltbook.com/api/v1/agents/verify-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.valid) {
      return {
        valid: false,
        error: data.error || 'Invalid token',
      };
    }

    return {
      valid: true,
      agent: data.agent as MoltbookAgent,
    };
  } catch (error) {
    console.error('[MoltbookAuth] Verification error:', error);
    return {
      valid: false,
      error: 'Failed to verify with Moltbook',
    };
  }
}

/**
 * Get karma tier for an agent
 */
export function getKarmaTier(karma: number): keyof typeof MOLTBOOK_KARMA_TIERS {
  if (karma >= MOLTBOOK_KARMA_TIERS.VIP) return 'VIP';
  if (karma >= MOLTBOOK_KARMA_TIERS.PREMIUM) return 'PREMIUM';
  if (karma >= MOLTBOOK_KARMA_TIERS.TRUSTED) return 'TRUSTED';
  return 'BASIC';
}

/**
 * Get benefits for a karma tier
 */
export function getTierBenefits(tier: keyof typeof MOLTBOOK_KARMA_TIERS) {
  switch (tier) {
    case 'VIP':
      return {
        entryFeeDiscount: 0.5, // 50% off
        faucetBonus: 20,       // Extra EMPTOURS
        priorityActions: true,
        skipAntiSybil: true,
      };
    case 'PREMIUM':
      return {
        entryFeeDiscount: 0.25, // 25% off
        faucetBonus: 10,
        priorityActions: true,
        skipAntiSybil: true,
      };
    case 'TRUSTED':
      return {
        entryFeeDiscount: 0.1, // 10% off
        faucetBonus: 5,
        priorityActions: false,
        skipAntiSybil: true,
      };
    default:
      return {
        entryFeeDiscount: 0,
        faucetBonus: 0,
        priorityActions: false,
        skipAntiSybil: false,
      };
  }
}

/**
 * Extract Moltbook identity token from request headers
 */
export function getMoltbookToken(headers: Headers): string | null {
  return headers.get('X-Moltbook-Identity') || headers.get('x-moltbook-identity');
}

/**
 * Middleware helper to verify Moltbook identity
 * Returns agent info or null if not authenticated
 */
export async function authenticateMoltbook(
  headers: Headers,
  audience?: string
): Promise<MoltbookAgent | null> {
  const token = getMoltbookToken(headers);
  if (!token) return null;

  const result = await verifyMoltbookIdentity(token, audience);
  if (!result.valid || !result.agent) return null;

  return result.agent;
}

/**
 * Generate auth URL for agents to get instructions
 */
export function getMoltbookAuthUrl(appName: string, endpoint: string): string {
  return `https://moltbook.com/auth.md?app=${encodeURIComponent(appName)}&endpoint=${encodeURIComponent(endpoint)}`;
}
