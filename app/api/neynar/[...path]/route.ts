import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, RateLimiters } from "@/lib/rate-limit";

/**
 * 🔐 Neynar read proxy.
 *
 * Client components used to call api.neynar.com directly with
 * NEXT_PUBLIC_NEYNAR_API_KEY, which baked the key into the browser bundle.
 * They now call /api/neynar/... instead; the key stays server-side here.
 *
 * Scope-limited to read-only Farcaster user lookups (the only thing the client
 * needs) so this can't be turned into an open Neynar relay.
 */

const NEYNAR_API_KEY =
  process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || "";

// Only allow the read endpoints the client legitimately uses.
const ALLOWED_PREFIXES = ["v2/farcaster/user/"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const joined = (path || []).join("/");

  if (!ALLOWED_PREFIXES.some((p) => joined.startsWith(p))) {
    return NextResponse.json(
      { error: "Endpoint not permitted" },
      { status: 400 },
    );
  }

  const rl = await checkRateLimit(RateLimiters.farcaster, getClientIP(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.resetIn}s.` },
      { status: 429 },
    );
  }

  const search = new URL(req.url).search;
  const upstream = `https://api.neynar.com/${joined}${search}`;

  try {
    const res = await fetch(upstream, {
      headers: { api_key: NEYNAR_API_KEY, accept: "application/json" },
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream request failed", details: err?.message },
      { status: 502 },
    );
  }
}
