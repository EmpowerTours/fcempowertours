/**
 * Verifies the indexer-vs-chain fallback in `lib/catalogue-source.ts`.
 *
 * Run: `node --experimental-strip-types tools/verify-catalogue-source.ts`
 *
 * ## What this is defending
 *
 * On 2026-08-13 the hosted indexer stopped at block 95,657,100 and kept answering HTTP 200 with
 * well-formed rows for eight days. Nothing failed. The app served a pre-migration snapshot and
 * the v3 cutover looked correct in the UI precisely because the UI was showing old data.
 *
 * So the case that matters most here is not "indexer down" — it is "indexer up, answering
 * confidently, and wrong". Every check below is written against that.
 */

import {
  checkEnvioHealth,
  resetEnvioHealthCache,
} from "../lib/envio-health.ts";

const failures: string[] = [];
let checks = 0;

/** Lag values are BigInts and `JSON.stringify` throws on those, taking the run down with it. */
function show(v: unknown): string {
  if (typeof v === "bigint") return `${v}n`;
  return JSON.stringify(v) ?? String(v);
}

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = show(actual);
  const e = show(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const HEAD = 98_080_500n;
const getHead = async () => HEAD;

/** Stub the indexer's HTTP response for one call. */
function withEndpoint(handler: () => Response | Promise<Response>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => await handler()) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}
const gql = (processed: number | string | null) =>
  new Response(
    JSON.stringify({
      data: {
        chain_metadata:
          processed === null ? [] : [{ latest_processed_block: processed }],
      },
    }),
  );

const EP = "https://indexer.example/v1/graphql";
let now = 1_000_000;

async function health(handler: () => Response | Promise<Response>) {
  resetEnvioHealthCache();
  const restore = withEndpoint(handler);
  try {
    return await checkEnvioHealth({ endpoint: EP, getHead, now: now++ });
  } finally {
    restore();
  }
}

// --- the failure that actually happened ----------------------------------
// 200 OK, valid rows, cursor eight days old. This must be judged unhealthy.
const stalled = await health(() => gql(95_657_100));
check("a stalled-but-responding indexer is unhealthy", stalled.healthy, false);
check("and the lag is reported", stalled.lagBlocks, HEAD - 95_657_100n);

// --- normal operation ----------------------------------------------------
const fresh = await health(() => gql(Number(HEAD - 12n)));
check("an indexer 12 blocks behind is healthy", fresh.healthy, true);

// Exactly at the limit is still healthy; one past it is not. Boundaries are where
// threshold bugs live.
check(
  "exactly at the lag limit is healthy",
  (await health(() => gql(Number(HEAD - 5000n)))).healthy,
  true,
);
check(
  "one block past the limit is not",
  (await health(() => gql(Number(HEAD - 5001n)))).healthy,
  false,
);

// --- recovery ------------------------------------------------------------
// The whole point: nothing to reset by hand. Once the cursor catches up, it is healthy again.
check(
  "it recovers on its own once the indexer catches up",
  (await health(() => gql(Number(HEAD - 3n)))).healthy,
  true,
);

// --- every other way it can go wrong -------------------------------------
check(
  "an HTTP error is unhealthy",
  (await health(() => new Response("nope", { status: 402 }))).healthy,
  false,
);
// A non-200 carrying a perfectly valid, perfectly fresh body. Some proxies do exactly this on
// a billing block. Without an explicit status check the body would parse and the indexer would
// be judged healthy on the strength of a response that says "payment required".
check(
  "a 402 with a valid fresh body is still unhealthy",
  (
    await health(
      () =>
        new Response(
          JSON.stringify({
            data: {
              chain_metadata: [{ latest_processed_block: Number(HEAD - 1n) }],
            },
          }),
          { status: 402 },
        ),
    )
  ).healthy,
  false,
);
check(
  "a 404 (deployment deleted) is unhealthy",
  (await health(() => new Response("", { status: 404 }))).healthy,
  false,
);
// The verdict alone does not pin this: without the explicit check, BigInt(undefined) throws and
// lands on unhealthy anyway. The difference is the reason, which is surfaced in the API response
// and the logs — "indexer reported no cursor" tells an operator what happened; a BigInt
// conversion error tells them nothing.
const noCursor = await health(() => gql(null));
check("a missing cursor is unhealthy", noCursor.healthy, false);
check(
  "and says so, rather than leaking a BigInt conversion error",
  noCursor.reason,
  "indexer reported no cursor",
);
check(
  "malformed JSON is unhealthy, not a crash",
  (await health(() => new Response("<html>gateway</html>"))).healthy,
  false,
);
check(
  "a thrown fetch is unhealthy, not a crash",
  (
    await health(() => {
      throw new Error("ECONNREFUSED");
    })
  ).healthy,
  false,
);

// A cursor ahead of the head (reorg, or wrong chain) must not read as "very fresh".
const ahead = await health(() => gql(Number(HEAD + 500n)));
check("a cursor ahead of the head clamps to zero lag", ahead.lagBlocks, 0n);
check(
  "and is treated as healthy rather than negative-lag",
  ahead.healthy,
  true,
);

// --- caching -------------------------------------------------------------
// The verdict is cached so the chain head is not queried on every request; a second call
// inside the TTL must not re-fetch.
resetEnvioHealthCache();
let calls = 0;
const restore = withEndpoint(() => {
  calls++;
  return gql(Number(HEAD - 5n));
});
try {
  await checkEnvioHealth({ endpoint: EP, getHead, now: 5_000_000 });
  await checkEnvioHealth({ endpoint: EP, getHead, now: 5_000_001 });
  check("a second call inside the TTL is served from cache", calls, 1);
  await checkEnvioHealth({ endpoint: EP, getHead, now: 5_000_000 + 120_000 });
  check("and re-checks once the TTL expires", calls, 2);
} finally {
  restore();
}

// --- configuration -------------------------------------------------------
resetEnvioHealthCache();
const noEndpoint = await checkEnvioHealth({
  endpoint: undefined,
  getHead,
  now: now++,
});
check("no endpoint configured is unhealthy", noEndpoint.healthy, false);

// --- takedowns are honoured ----------------------------------------------
//
// `setMasterSuspended` and `purgeMaster` exist so a track can be pulled, and the registry records
// a stated reason for each. The catalogue reader filtered on `artist != address(0)` and nothing
// else, so a suspended master stayed in the catalogue and kept playing. A takedown that does not
// take anything down is worse than none, because someone believes it worked.
//
// The first fix put the check inside the chain reader, which looked right and was not:
// `getCatalogue` returns indexer rows untouched when the indexer is fresh, so on that path the
// filter would not have run at all. It was invisible to testing — the indexer has been dead since
// 2026-08-01, so every test exercised the chain path. This scan is aimed at that mistake: the
// filter must sit where BOTH sources pass through it.
//
// A source scan rather than a call, because `catalogue-source.ts` imports `@/app/chains` and `@/`
// does not resolve under `node --experimental-strip-types` — the constraint that shaped
// `envio-health.ts`.

{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  const here = dirname(fileURLToPath(import.meta.url));
  const code = readFileSync(join(here, "..", "lib", "catalogue-source.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  check("a moderation filter exists", /function filterModerated/.test(code), true);
  check("it reads masterSuspended", /masterSuspended/.test(code), true);
  check("it reads masterPurged", /masterPurged/.test(code), true);

  // The point of the whole check: getCatalogue has two returns, and BOTH must filter.
  const gcStart = code.indexOf("export async function getCatalogue");
  const gc = gcStart >= 0 ? code.slice(gcStart) : "";
  const returns = [
    ...gc.matchAll(/return\s*\{[\s\S]{0,220}?source:\s*"(envio|chain)"/g),
  ];

  check("getCatalogue still has both source paths", returns.length, 2);
  check(
    "the indexer path is filtered too, not just the chain",
    returns.every((m) => /filterModerated/.test(m[0])),
    true,
  );

  // Fail closed: a failed moderation read must hide the rows, not serve them.
  const fmStart = code.indexOf("async function filterModerated");
  const fm = fmStart >= 0 ? code.slice(fmStart, fmStart + 1800) : "";
  check(
    "a failed moderation read serves nothing rather than everything",
    /catch\s*\{[\s\S]{0,60}return\s*\[\s*\]/.test(fm),
    true,
  );
}

console.log(`\n${checks} checks run`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
