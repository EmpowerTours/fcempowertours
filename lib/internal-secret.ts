import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Shared secret for ops / scheduler / bot-to-self routes that must not be
 * callable by end users (radio start/stop, frames/cast, sponsorship finalize).
 *
 * Uses KEEPER_SECRET (already required for crons). INTERNAL_API_SECRET is an
 * accepted alias so a deployment can name the role more clearly without
 * breaking existing Railway config.
 *
 * Fail-CLOSED when unset — the opposite of the old `&& KEEPER_SECRET` pattern
 * that opened the door when the env var was missing.
 */

export const INTERNAL_SECRET_HEADER = "x-internal-secret";

function configuredSecret(): string | null {
  const raw =
    process.env.KEEPER_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    process.env.CRON_SECRET ||
    "";
  return raw.length > 0 ? raw : null;
}

function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Extract a presented secret from header or (legacy) JSON body field `secret`.
 * Body is optional — pass it when the route has already parsed JSON.
 */
export function presentedInternalSecret(
  req: NextRequest,
  bodySecret?: unknown,
): string | null {
  const header = req.headers.get(INTERNAL_SECRET_HEADER);
  if (header && header.length > 0) return header;

  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  if (typeof bodySecret === "string" && bodySecret.length > 0) {
    return bodySecret;
  }
  return null;
}

/**
 * Returns null when the request carries a valid internal secret.
 * Otherwise returns a ready-to-return 401/503 NextResponse.
 */
export function requireInternalSecret(
  req: NextRequest,
  bodySecret?: unknown,
): NextResponse | null {
  const expected = configuredSecret();
  if (!expected) {
    console.error(
      "[InternalSecret] KEEPER_SECRET / INTERNAL_API_SECRET unset — denying",
    );
    return NextResponse.json(
      {
        success: false,
        error: "Server is not configured for this privileged action.",
      },
      { status: 503 },
    );
  }

  const presented = presentedInternalSecret(req, bodySecret);
  if (!presented || !secretsEqual(presented, expected)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  return null;
}
