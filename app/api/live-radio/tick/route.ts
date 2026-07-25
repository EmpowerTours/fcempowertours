import { NextResponse } from "next/server";

/**
 * Public radio tick
 *
 * /api/live-radio/scheduler requires the keeper secret in its POST body, which a
 * browser obviously cannot hold. But the radio has to advance while someone is
 * listening — nothing else drives it, so without a client-reachable trigger a
 * track ends and the stream goes silent until something happens to poke the
 * endpoint.
 *
 * This is that trigger: unauthenticated, does nothing but forward to the
 * scheduler with the secret attached server-side. It grants no capability a
 * listener does not already have — the scheduler only advances playback, holds a
 * Redis lock against concurrent runs, and short-circuits on cached state when a
 * track still has time left, so extra calls are cheap and idempotent.
 */

const KEEPER_SECRET = process.env.KEEPER_SECRET || process.env.CRON_SECRET;

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;

    const res = await fetch(`${origin}/api/live-radio/scheduler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: KEEPER_SECRET }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("[RadioTick] Failed:", error?.message ?? error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Tick failed" },
      { status: 500 },
    );
  }
}
