import { NextRequest, NextResponse } from "next/server";
import { IPinfoWrapper } from "node-ipinfo";

const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

/**
 * Cross-origin access for the web player.
 *
 * The player at api.empowertours.xyz is served from a different origin to this
 * app, so a signed-in subscriber listening there cannot reach the radio
 * endpoints without CORS. Handled here rather than in each route because
 * /api/live-radio alone has dozens of NextResponse.json exits and every one of
 * them would need the headers.
 *
 * Only the endpoints the player genuinely needs are opened, and only to an
 * allow-list of origins — never `*`, because these requests carry a listen
 * session token and a Quick Auth bearer.
 */
const CORS_PATHS = [
  "/api/live-radio",
  "/api/auth/wallet-nonce",
  "/api/music/check-subscription",
];

const ALLOWED_ORIGINS = (
  process.env.RADIO_CORS_ORIGINS ||
  "https://api.empowertours.xyz,https://empowertours.xyz"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeadersFor(origin: string | null): Record<string, string> | null {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    // The allow-list is origin-specific, so caches must key on the origin.
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type,authorization,x-radio-session,x-wallet-address,x-wallet-signature,x-wallet-timestamp,x-wallet-nonce",
    "Access-Control-Max-Age": "86400",
  };
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (CORS_PATHS.some((p) => path.startsWith(p))) {
    const headers = corsHeadersFor(req.headers.get("origin"));

    // A disallowed origin falls through with no CORS headers, which the browser
    // blocks — the same outcome as before, and never a silent allow.
    if (!headers) {
      return req.method === "OPTIONS"
        ? new NextResponse(null, { status: 204 })
        : NextResponse.next();
    }

    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers });
    }

    const res = NextResponse.next();
    for (const [key, value] of Object.entries(headers)) {
      res.headers.set(key, value);
    }
    return res;
  }

  const res = NextResponse.next();

  // Get IP from headers (x-forwarded-for or other sources)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1"; // Fallback to localhost

  if (!IPINFO_TOKEN) {
    console.warn("IPINFO_TOKEN is not set in environment variables");
    res.cookies.set("country", "US"); // Fallback
    return res;
  }

  try {
    const ipinfoWrapper = new IPinfoWrapper(IPINFO_TOKEN);
    const data = await ipinfoWrapper.lookupIp(ip);
    const country = data.country || "US";
    res.cookies.set("country", country);
  } catch (err) {
    console.error("IPInfo error:", err);
    res.cookies.set("country", "US"); // Fallback
  }

  return res;
}

export const config = {
  matcher: [
    "/passport",
    "/profile",
    "/api/live-radio",
    "/api/live-radio/:path*",
    "/api/auth/wallet-nonce",
    "/api/music/check-subscription",
  ],
  runtime: "nodejs",
};
