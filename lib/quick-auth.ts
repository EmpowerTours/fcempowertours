import { NextRequest } from "next/server";
import { createClient, Errors } from "@farcaster/quick-auth";

/**
 * 🔐 FARCASTER QUICK AUTH (server-side verification)
 *
 * Replaces the previous "trust the FID in the request body" scheme. A Quick
 * Auth JWT is issued by Farcaster's auth server only after the user signs a
 * Sign In with Farcaster credential, so possessing a valid token proves the
 * caller controls that FID — a Neynar lookup of a FID/address pair proves
 * nothing, since both values are public.
 *
 * Client obtains a token with `sdk.quickAuth.getToken()` and sends it as
 * `Authorization: Bearer <jwt>`. See lib/quick-auth-client.ts.
 *
 * ROLLOUT: verification always runs and is always logged, but requests are
 * only *rejected* when ENFORCE_QUICK_AUTH=true. This lets the token flow be
 * deployed and observed before it becomes load-bearing.
 */

const client = createClient();

export interface QuickAuthUser {
  fid: number;
  /** Lowercased addresses proven to belong to this FID. */
  addresses: string[];
  /** The address the user signed in with, when the token carries it. */
  signInAddress?: string;
}

export type QuickAuthResult =
  | { ok: true; user: QuickAuthUser }
  | { ok: false; reason: string; invalidToken: boolean };

/** Whether a failed/absent verification should block the request. */
export function isQuickAuthEnforced(): boolean {
  return process.env.ENFORCE_QUICK_AUTH === "true";
}

/**
 * The domain a token must have been issued to. Must match the mini app's
 * host exactly — a token minted for another domain is not valid here.
 */
export function getQuickAuthDomain(): string {
  const explicit = process.env.QUICK_AUTH_DOMAIN;
  if (explicit)
    return explicit.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const appUrl = process.env.NEXT_PUBLIC_URL;
  if (appUrl) {
    try {
      return new URL(appUrl).host;
    } catch {
      // fall through
    }
  }
  return "fcempowertours-production-6551.up.railway.app";
}

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Look up every address the FID has proven ownership of. Used to bind the
 * verified FID to the `userAddress` a request wants to act on.
 */
async function resolveFidAddresses(fid: number): Promise<string[]> {
  const apiKey =
    process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
  if (!apiKey) {
    console.warn(
      "[QuickAuth] No Neynar key; cannot resolve addresses for FID",
      fid,
    );
    return [];
  }

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      { headers: { api_key: apiKey, accept: "application/json" } },
    );
    if (!res.ok) {
      console.warn("[QuickAuth] Neynar lookup failed:", res.status);
      return [];
    }

    const data = await res.json();
    const user = data.users?.[0];
    if (!user) return [];

    const verified: string[] = user.verified_addresses?.eth_addresses || [];
    return [...verified, user.custody_address]
      .filter((a: string | undefined): a is string => typeof a === "string")
      .map((a) => a.toLowerCase());
  } catch (err: any) {
    console.warn("[QuickAuth] Neynar lookup error:", err?.message);
    return [];
  }
}

/**
 * Verify the Quick Auth token on a request. Does NOT decide whether the
 * request is allowed — see authorizeUserAddress for that.
 */
export async function verifyQuickAuth(
  req: NextRequest,
): Promise<QuickAuthResult> {
  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, reason: "No Bearer token", invalidToken: false };
  }

  try {
    const payload = await client.verifyJwt({
      token,
      domain: getQuickAuthDomain(),
    });

    const fid = Number(payload.sub);
    if (!Number.isInteger(fid) || fid <= 0) {
      return {
        ok: false,
        reason: "Token has no usable FID",
        invalidToken: true,
      };
    }

    // `address` is present on tokens from current Quick Auth servers but is
    // not guaranteed by the return type, so it is treated as a bonus signal
    // rather than the only source.
    const rawSignIn = (payload as { address?: unknown }).address;
    const signInAddress =
      typeof rawSignIn === "string" && /^0x[a-fA-F0-9]{40}$/.test(rawSignIn)
        ? rawSignIn.toLowerCase()
        : undefined;

    const resolved = await resolveFidAddresses(fid);
    const addresses = Array.from(
      new Set([...(signInAddress ? [signInAddress] : []), ...resolved]),
    );

    return { ok: true, user: { fid, addresses, signInAddress } };
  } catch (err: any) {
    if (err instanceof Errors.InvalidTokenError) {
      return {
        ok: false,
        reason: `Invalid token: ${err.message}`,
        invalidToken: true,
      };
    }
    console.error("[QuickAuth] Verification error:", err?.message);
    return {
      ok: false,
      reason: `Verification failed: ${err?.message}`,
      invalidToken: false,
    };
  }
}

export interface AuthorizationDecision {
  allowed: boolean;
  /** Verified FID, present only when a valid token was supplied. */
  fid?: number;
  mode: "quickauth" | "unauthenticated";
  reason?: string;
  /** True when the request would be rejected once enforcement is on. */
  wouldRejectWhenEnforced: boolean;
}

/**
 * Decide whether `userAddress` may be acted on by the caller.
 *
 * Passing requires a valid Quick Auth token whose FID owns that address.
 * While ENFORCE_QUICK_AUTH is off, failures are logged and allowed through so
 * existing flows keep working; the log line shows exactly what would break.
 */
export async function authorizeUserAddress(
  req: NextRequest,
  userAddress: string,
  context: string,
): Promise<AuthorizationDecision> {
  const enforced = isQuickAuthEnforced();
  const result = await verifyQuickAuth(req);

  if (!result.ok) {
    console.warn(
      `[QuickAuth] ${context}: unauthenticated (${result.reason})${enforced ? " — REJECTED" : " — allowed (enforcement off)"}`,
    );
    return {
      allowed: !enforced,
      mode: "unauthenticated",
      reason: result.reason,
      wouldRejectWhenEnforced: true,
    };
  }

  const target = userAddress.toLowerCase();
  if (!result.user.addresses.includes(target)) {
    console.error(
      `[QuickAuth] ${context}: FID ${result.user.fid} does not own ${target}${enforced ? " — REJECTED" : " — allowed (enforcement off)"}`,
    );
    return {
      allowed: !enforced,
      fid: result.user.fid,
      mode: "quickauth",
      reason: "Authenticated FID does not own this address",
      wouldRejectWhenEnforced: true,
    };
  }

  console.log(
    `[QuickAuth] ${context}: ✅ FID ${result.user.fid} owns ${target}`,
  );
  return {
    allowed: true,
    fid: result.user.fid,
    mode: "quickauth",
    wouldRejectWhenEnforced: false,
  };
}

/** Pass a caller's Bearer token through to an internal service call. */
export function forwardAuthHeader(req: NextRequest): Record<string, string> {
  const token = extractBearerToken(req);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
