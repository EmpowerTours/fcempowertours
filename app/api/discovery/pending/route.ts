import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { pendingKey } from "@/lib/discovery-stamp";

/**
 * GET /api/discovery/pending?address=0x...
 *
 * Artists this listener discovered while holding no passport.
 *
 * A discovery is a moment, and the moment happens whether or not there is a
 * document to record it on. Dropping it because someone had not minted yet would
 * mean the stamp they eventually earn is dated when they got around to admin,
 * rather than when they actually first heard the artist. So the discovery is
 * queued and the app can say something true: "you have discovered 3 artists —
 * mint a passport to keep them."
 *
 * Read-only and unauthenticated. It reveals which artists an address has listened
 * to, which the play records already say on chain.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // No store means no queue, not an error. The caller shows nothing.
    return NextResponse.json({ pending: [], count: 0 });
  }

  try {
    const redis = new Redis({ url, token });
    const entries = (await redis.hgetall(pendingKey(address))) ?? {};
    const pending = Object.entries(entries).map(([artist, masterTokenId]) => ({
      artist,
      masterTokenId: String(masterTokenId),
    }));
    return NextResponse.json({ pending, count: pending.length });
  } catch {
    return NextResponse.json({ pending: [], count: 0 });
  }
}
