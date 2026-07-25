import { NextRequest } from "next/server";
import { POST as runScheduler } from "../scheduler/route";

/**
 * Public radio tick
 *
 * /api/live-radio/scheduler requires the keeper secret in its POST body, which a
 * browser obviously cannot hold. But the radio has to advance while someone is
 * listening — nothing else drives it, so without a client-reachable trigger a
 * track ends and the stream goes silent until something happens to poke the
 * endpoint.
 *
 * This is that trigger: unauthenticated, and it does nothing but invoke the
 * scheduler with the secret attached server-side. It grants a listener no
 * capability they lack — the scheduler only advances playback, holds a Redis
 * lock against concurrent runs, and short-circuits on cached state while a track
 * still has time left, so repeat calls are cheap and idempotent.
 *
 * The handler is called directly rather than over HTTP: a self-fetch to the
 * container's own origin fails on Railway.
 */

const KEEPER_SECRET = process.env.KEEPER_SECRET || process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  const schedulerReq = new NextRequest(
    new URL("/api/live-radio/scheduler", req.nextUrl.origin),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: KEEPER_SECRET }),
    },
  );

  return runScheduler(schedulerReq);
}
