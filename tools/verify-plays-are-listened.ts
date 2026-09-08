/**
 * Verifies that the play count the app DISPLAYS is the play count it PAYS on.
 *
 * Run: `npx tsx tools/verify-plays-are-listened.ts`
 *
 * ## What this is defending
 *
 * `/api/streaming-stats` used to report `totalPlays` as
 * `Math.max(radioState.totalSongsPlayed, historyLength)`. Both of those advance when the radio
 * scheduler starts a track, whether or not one person is connected — they measure broadcast
 * uptime. On 2026-09-08 that field read **35,493** while PlayOracle's on-chain
 * `totalPlaysRecorded` stood at **28**: a 1,268x overstatement, shown to artists as their play
 * count and to anyone evaluating the platform as traction.
 *
 * The invariant: a "play" is an event credited to a listener address in `listener-stats` —
 * the same event `lib/listener-points.ts` pays for. If the displayed number and the paid
 * number come from different sources they will drift, and the drift flatters us.
 *
 * ## Why a source scan and not a fixture
 *
 * A fixture asserting `totalPlays === 3` passes forever while the source underneath it changes
 * (feedback_gates_must_measure_invariants). This reads the route and requires that the
 * assignment to `totalPlays` is derived from listener stats and NOT from the broadcast counter.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const failures: string[] = [];
let checks = 0;

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(here, "..", "app", "api", "streaming-stats", "route.ts");
const src = readFileSync(routePath, "utf8");

/** Comments describe intent; only code is evidence. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Every right-hand side assigned to stats.totalPlays. */
const assignments = [...code.matchAll(/stats\.totalPlays\s*=\s*([^;]+);/g)].map(
  (m) => m[1].trim(),
);

checks++;
if (assignments.length === 0) {
  failures.push(
    "no assignment to stats.totalPlays found — did the field move? This check is now blind.",
  );
}

/** Tokens that mean "the radio broadcast a song", not "somebody listened". */
const BROADCAST_SOURCES = [
  "totalSongsPlayed",
  "totalFromState",
  "historyLength",
  "llen",
];

for (const rhs of assignments) {
  checks++;
  const leaked = BROADCAST_SOURCES.filter((t) => rhs.includes(t));
  if (leaked.length > 0) {
    failures.push(
      `stats.totalPlays is assigned from a BROADCAST source (${leaked.join(", ")}):\n` +
        `     ${rhs}\n` +
        `     That counter advances on an empty room. Sum totalSongsListened across\n` +
        `     listener-stats instead, so the displayed number equals the paid number.`,
    );
  }
}

/** The honest source must actually be read somewhere in the route. */
checks++;
if (!code.includes("totalSongsListened")) {
  failures.push(
    "the route never reads `totalSongsListened` — totalPlays cannot be listener-derived",
  );
}

/** Broadcast uptime is a real number and worth reporting — under its own name. */
checks++;
if (!code.includes("totalSongsBroadcast")) {
  failures.push(
    "no `totalSongsBroadcast` field — airtime should still be reported, just not as plays",
  );
}

checks++;
if (!/totalSongsBroadcast\s*=\s*[^;]*totalSongsPlayed/.test(code)) {
  failures.push(
    "`totalSongsBroadcast` is not fed by the radio counter — it should be, that IS airtime",
  );
}

if (failures.length > 0) {
  console.error(`✗ play counts are not listener-derived\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(
  `✓ displayed plays are the plays we pay for — ${checks} checks passed`,
);
