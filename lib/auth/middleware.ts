/**
 * Auth Middleware
 *
 * Server-side middleware for authenticating requests from multiple platforms.
 * Detects the platform from request headers and validates accordingly:
 *
 *   - Telegram: validates initData via HMAC-SHA256 (lib/auth/telegram.ts)
 *   - Farcaster: validates FID from request body or Neynar verification
 *   - Web: extracts wallet address from authorization header
 *
 * Usage in API routes:
 *   import { authenticateRequest } from '@/lib/auth/middleware';
 *
 *   export async function POST(req: NextRequest) {
 *     const auth = await authenticateRequest(req);
 *     if (!auth.authenticated) {
 *       return NextResponse.json({ error: auth.error }, { status: 401 });
 *     }
 *     // auth.user has the normalized user data
 *   }
 */

import { NextRequest } from 'next/server';
import { validateTelegramInitData, type TelegramAuthUser } from './telegram';

type Platform = 'farcaster' | 'telegram' | 'web';

/**
 * Normalized authenticated user returned by the middleware.
 */
export interface AuthenticatedUser {
  /** Unique user identifier (FID, telegramId, or wallet address) */
  id: string;
  /** Which platform the request came from */
  platform: Platform;
  /** Username if available */
  username?: string;
  /** Display name if available */
  displayName?: string;
  /** Farcaster FID (only for Farcaster users) */
  fid?: number;
  /** Telegram user ID (only for Telegram users) */
  telegramId?: number;
  /** Wallet address if available */
  walletAddress?: string;
}

/**
 * Result of the authentication attempt.
 */
export interface AuthResult {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  platform: Platform;
  error?: string;
}

/**
 * Authenticate an incoming request by detecting platform and validating credentials.
 *
 * Platform detection order:
 *   1. x-platform header (explicit platform declaration)
 *   2. x-telegram-init-data header (Telegram Mini App)
 *   3. Request body with fid field (Farcaster)
 *   4. Authorization header with wallet address (Web)
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  // 1. Check explicit platform header
  const declaredPlatform = req.headers.get('x-platform') as Platform | null;

  // 2. Check for Telegram initData
  const telegramInitData = req.headers.get('x-telegram-init-data');

  if (telegramInitData || declaredPlatform === 'telegram') {
    return authenticateTelegram(telegramInitData);
  }

  // 3. Try to read body for Farcaster FID
  //    Clone the request so it can still be read by the handler
  if (declaredPlatform === 'farcaster') {
    return authenticateFarcasterFromHeaders(req);
  }

  // 4. Try to auto-detect from body content
  try {
    const clonedReq = req.clone();
    const body = await clonedReq.json().catch(() => null);

    if (body) {
      // Farcaster: request body contains fid
      if (body.fid && typeof body.fid === 'number') {
        return authenticateFarcasterFromBody(body);
      }

      // Telegram: request body contains telegramInitData
      if (body.telegramInitData) {
        return authenticateTelegram(body.telegramInitData);
      }

      // Web: body contains walletAddress
      if (body.walletAddress) {
        return authenticateWeb(body.walletAddress);
      }
    }
  } catch {
    // Body parsing failed, continue to header-based auth
  }

  // 5. Check Authorization header for wallet-based auth
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const walletAddress = extractWalletFromAuth(authHeader);
    if (walletAddress) {
      return authenticateWeb(walletAddress);
    }
  }

  // 6. Check x-wallet-address header
  const walletHeader = req.headers.get('x-wallet-address');
  if (walletHeader) {
    return authenticateWeb(walletHeader);
  }

  return {
    authenticated: false,
    user: null,
    platform: 'web',
    error: 'No authentication credentials found. Send x-platform header with appropriate credentials.',
  };
}

/**
 * Authenticate a Telegram Mini App request.
 */
function authenticateTelegram(initData: string | null): AuthResult {
  if (!initData) {
    return {
      authenticated: false,
      user: null,
      platform: 'telegram',
      error: 'Telegram initData is required. Send via x-telegram-init-data header.',
    };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[Auth] TELEGRAM_BOT_TOKEN not configured');
    return {
      authenticated: false,
      user: null,
      platform: 'telegram',
      error: 'Server misconfiguration: Telegram bot token not set',
    };
  }

  const result = validateTelegramInitData(initData, botToken);

  if (!result.valid || !result.user) {
    return {
      authenticated: false,
      user: null,
      platform: 'telegram',
      error: result.error || 'Telegram auth validation failed',
    };
  }

  const tgUser: TelegramAuthUser = result.user;
  const displayName = [tgUser.first_name, tgUser.last_name]
    .filter(Boolean)
    .join(' ');

  return {
    authenticated: true,
    user: {
      id: String(tgUser.id),
      platform: 'telegram',
      username: tgUser.username,
      displayName,
      telegramId: tgUser.id,
    },
    platform: 'telegram',
  };
}

/**
 * Authenticate a Farcaster request from explicit headers.
 */
function authenticateFarcasterFromHeaders(req: NextRequest): AuthResult {
  const fidHeader = req.headers.get('x-farcaster-fid');
  const usernameHeader = req.headers.get('x-farcaster-username');
  const walletHeader = req.headers.get('x-wallet-address');

  if (!fidHeader) {
    return {
      authenticated: false,
      user: null,
      platform: 'farcaster',
      error: 'Farcaster FID required. Send via x-farcaster-fid header.',
    };
  }

  const fid = parseInt(fidHeader, 10);
  if (isNaN(fid) || fid <= 0) {
    return {
      authenticated: false,
      user: null,
      platform: 'farcaster',
      error: 'Invalid Farcaster FID',
    };
  }

  return {
    authenticated: true,
    user: {
      id: String(fid),
      platform: 'farcaster',
      fid,
      username: usernameHeader || undefined,
      walletAddress: walletHeader || undefined,
    },
    platform: 'farcaster',
  };
}

/**
 * Authenticate a Farcaster request from parsed body.
 */
function authenticateFarcasterFromBody(body: any): AuthResult {
  const fid = body.fid;

  if (!fid || typeof fid !== 'number' || fid <= 0) {
    return {
      authenticated: false,
      user: null,
      platform: 'farcaster',
      error: 'Invalid Farcaster FID in request body',
    };
  }

  return {
    authenticated: true,
    user: {
      id: String(fid),
      platform: 'farcaster',
      fid,
      username: body.username || undefined,
      walletAddress: body.walletAddress || body.custody_address || undefined,
    },
    platform: 'farcaster',
  };
}

/**
 * Authenticate a standalone web request with wallet address.
 */
function authenticateWeb(walletAddress: string): AuthResult {
  // Basic validation: must look like an Ethereum address
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return {
      authenticated: false,
      user: null,
      platform: 'web',
      error: 'Invalid wallet address format',
    };
  }

  return {
    authenticated: true,
    user: {
      id: walletAddress.toLowerCase(),
      platform: 'web',
      username: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      walletAddress: walletAddress.toLowerCase(),
    },
    platform: 'web',
  };
}

/**
 * Extract wallet address from Authorization header.
 * Supports: "Bearer <address>" or "Wallet <address>"
 */
function extractWalletFromAuth(header: string): string | null {
  const parts = header.split(' ');
  if (parts.length !== 2) return null;

  const [scheme, value] = parts;
  if (
    (scheme.toLowerCase() === 'bearer' || scheme.toLowerCase() === 'wallet') &&
    /^0x[a-fA-F0-9]{40}$/.test(value)
  ) {
    return value;
  }

  return null;
}
