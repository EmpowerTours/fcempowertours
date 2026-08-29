/**
 * Verifies that `lib/catalogue-source.ts` reads each tuple field at the index its own ABI
 * declares.
 *
 * Run: `node --experimental-strip-types tools/verify-catalogue-indices.ts`
 *
 * ## Why this is a source check rather than a unit test
 *
 * `catalogue-source.ts` imports `@/app/chains`, and the `@/` alias does not resolve under
 * `node --experimental-strip-types`, so the row builders cannot be called here. The hazard is
 * still worth pinning, because it is the kind that produces plausible output instead of an error.
 *
 * ## The hazard
 *
 * `getMaster` returns MULTIPLE NAMED VALUES, which viem decodes as a positional tuple — unlike a
 * named struct, which decodes as an object. So every field is read by number, and the two
 * contracts do not agree on the numbers:
 *
 *     v3     getMaster    → (artist, artistFid, createdAt, …)     artistFid is 1
 *     legacy masterTokens → (artistFid, originalArtist, …)        artistFid is 0
 *
 * They are exactly swapped in the first two positions. Reading the legacy fid at index 1 yields
 * the artist address coerced through `Number()` — a large finite number, not NaN, not a throw —
 * and the artist would then be looked up under a Farcaster id that belongs to somebody else, or
 * to nobody. Reading the address at index 0 yields a bigint where a string is expected, and the
 * row is dropped by the zero-address guard rather than reported.
 *
 * So this parses the signature strings out of the file and checks the code against them. Rename
 * or reorder a field in the ABI and the check moves with it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(
  join(here, "..", "lib", "catalogue-source.ts"),
  "utf8",
);

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/**
 * The named return positions of one function signature in the file.
 *
 * Returns `null` when the signature is absent, which is itself checked — a silently missing
 * signature would make every index check below vacuously pass.
 */
function returnPositions(fnName: string): Record<string, number> | null {
  const sig = SOURCE.match(
    new RegExp(`"function ${fnName}\\(.*?\\) view returns \\((.*?)\\)"`),
  );
  if (!sig) return null;

  const positions: Record<string, number> = {};
  sig[1].split(",").forEach((part, i) => {
    const words = part.trim().split(/\s+/);
    if (words.length >= 2) positions[words[words.length - 1]] = i;
  });
  return positions;
}

/** Every `field: … master[N] …` / `… m[N] …` read, by the index it uses. */
function indexUsedFor(field: string, variable: string): number | null {
  const m = SOURCE.match(
    new RegExp(`${field}:[^,\n]*\\b${variable}\\[(\\d+)\\]`),
  );
  return m ? Number(m[1]) : null;
}

// ------------------------------------------------------------------- the signatures are present

const v3 = returnPositions("getMaster");
const legacy = returnPositions("masterTokens");

check("the v3 getMaster signature is in the file", v3 !== null, true);
check(
  "the legacy masterTokens signature is in the file",
  legacy !== null,
  true,
);

if (v3 && legacy) {
  // The premise of the whole check: the two layouts really are swapped. If a redeploy ever made
  // them agree, this fails and the comments above stop being a warning about nothing.
  check(
    "v3 puts the artist first and the fid second",
    [v3.artist, v3.artistFid],
    [0, 1],
  );
  check(
    "legacy puts the fid first and the artist second — the opposite",
    [legacy.artistFid, legacy.originalArtist],
    [0, 1],
  );

  // ------------------------------------------------------------------ the code matches the ABI

  check(
    "v3 reads artistFid at the position its ABI declares",
    indexUsedFor("artistFid", "master"),
    v3.artistFid,
  );
  check(
    "v3 reads createdAt at the position its ABI declares",
    indexUsedFor("createdAt", "master"),
    v3.createdAt,
  );
  check(
    "legacy reads artistFid at ITS position, not v3's",
    indexUsedFor("artistFid", "m"),
    legacy.artistFid,
  );

  // The two reads must not be the same number, which is the single mistake this file exists to
  // stop. Stated separately so the failure names the confusion rather than an index.
  check(
    "the two artistFid reads differ, because the layouts differ",
    indexUsedFor("artistFid", "master") !== indexUsedFor("artistFid", "m"),
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
