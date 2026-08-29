/**
 * Verifies the play-ledger saturation reporting.
 *
 * Run: `node --experimental-strip-types tools/verify-play-ledger.ts`
 *
 * ## What this is defending
 *
 * `/api/artist-earnings` reported `totalPlays: 100` for an artist whose contract lifetime play
 * count is 5. The per-song breakdown summed to exactly 100 — 22+22+19+22+15 — which is the play
 * ledger's cap, not a measurement. The response gave a consumer no way to tell the difference
 * between "100 plays" and "at least 100 plays, older ones dropped".
 *
 * It is the same defect as the tips claim earlier in this migration: a bounded value presented as
 * a measured one. A floor rendered as a total is worse than no number, because it looks precise.
 *
 * ## Why the boundary checks matter most
 *
 * Saturation is an `>=` against the cap, and the trim keeps CAP entries via `ltrim(key, 0,
 * CAP - 1)`. Both are one-off-by-one away from being wrong in the direction that fails silently:
 * a `>` would call a genuinely full ledger unsaturated, and a trim stop of CAP would keep CAP + 1
 * entries so nothing would ever equal the cap. The cases at exactly CAP - 1, CAP and CAP + 1 are
 * therefore the point of this file.
 */

import {
  PLAY_HISTORY_CAP,
  PLAY_HISTORY_KEY,
  PLAY_HISTORY_TRIM_STOP,
  toPlayWindow,
  saturationNote,
} from "../lib/play-ledger.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const entries = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ tokenId: String((i % 5) + 1) }));
const keep = <T>(e: T) => e ?? null;

// ------------------------------------------------------------------ the trim keeps exactly CAP

// `ltrim(key, 0, stop)` is INCLUSIVE of stop, so keeping CAP entries needs CAP - 1. Off by one
// here and the ledger holds CAP + 1, so `raw.length >= CAP` still fires — but every count is
// silently one larger than the cap the response advertises.
check(
  "the trim stop keeps exactly the cap, not one more",
  PLAY_HISTORY_TRIM_STOP + 1,
  PLAY_HISTORY_CAP,
);
check(
  "the key is the one the writer appends to",
  PLAY_HISTORY_KEY,
  "live-radio:play-history",
);

// ------------------------------------------------------------------------------- the boundary

check(
  "one below the cap is a real count, not a floor",
  toPlayWindow(entries(PLAY_HISTORY_CAP - 1), keep).saturated,
  false,
);
check(
  "exactly at the cap IS a floor — this is the live case that was misreported",
  toPlayWindow(entries(PLAY_HISTORY_CAP), keep).saturated,
  true,
);
check(
  "above the cap is a floor too, in case a trim is ever missed",
  toPlayWindow(entries(PLAY_HISTORY_CAP + 1), keep).saturated,
  true,
);
check(
  "an empty ledger is not saturated",
  toPlayWindow([], keep).saturated,
  false,
);
check(
  "a single play is not saturated",
  toPlayWindow(entries(1), keep).saturated,
  false,
);

// ------------------------------------------------------------- parsing does not hide the cap

{
  // Half the window fails to parse. The ledger still HELD a full window, so the count is still a
  // floor — deciding saturation on the parsed length would quietly clear the flag.
  const raw = entries(PLAY_HISTORY_CAP);
  const w = toPlayWindow(raw, (e) => {
    const entry = e as { tokenId: string };
    return Number(entry.tokenId) % 2 === 0 ? entry : null;
  });
  check(
    "unparseable entries are skipped",
    w.plays.length < PLAY_HISTORY_CAP,
    true,
  );
  check(
    "...but they still count toward saturation, because the ledger held them",
    w.saturated,
    true,
  );
}

check(
  "the window reports the cap so a caller need not hard-code it",
  toPlayWindow(entries(3), keep).cap,
  PLAY_HISTORY_CAP,
);

// -------------------------------------------------------------------------------- the wording

check(
  "an unsaturated window produces no note",
  saturationNote(false, "totalPlays"),
  [],
);
{
  const note = saturationNote(true, "totalPlays");
  check("a saturated window produces exactly one note", note.length, 1);
  check(
    "...naming the figure it applies to",
    note[0].includes("totalPlays"),
    true,
  );
  check(
    "...calling it a floor rather than a total",
    note[0].includes("floor"),
    true,
  );
  check(
    "...and stating the cap, so the reader knows what the floor is",
    note[0].includes(String(PLAY_HISTORY_CAP)),
    true,
  );
}

// ------------------------------------------------------------------------------------- report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
