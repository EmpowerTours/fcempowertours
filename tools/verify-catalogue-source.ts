/**
 * Verifies that the catalogue cannot serve a track that has been taken down.
 *
 * Run: `node --experimental-strip-types tools/verify-catalogue-source.ts`
 *
 * ## What this used to be
 *
 * Most of this file checked indexer health — staleness thresholds, missing cursors, a cursor
 * ahead of the chain head. The indexer is gone, and so are those checks. What remains is the part
 * that was never about the indexer.
 *
 * ## What it is defending
 *
 * `setMasterSuspended` and `purgeMaster` exist so a track can be pulled, and the registry records
 * a stated reason for each. The catalogue reader filtered on `artist != address(0)` and nothing
 * else, so a suspended master stayed in the catalogue and kept playing. A takedown that does not
 * take anything down is worse than none, because somebody believes it worked.
 *
 * The first fix put the check inside the chain reader, which looked right and was not:
 * `getCatalogue` returned indexer rows untouched when the indexer was fresh, so on that path the
 * filter did not run at all. It was invisible to testing, because the indexer had been dead since
 * 2026-08-01 and every test exercised the chain path.
 *
 * That second source is now gone, which removes the way it broke — but not the shape of the
 * mistake. So the check below is stronger than the one it replaces: rather than counting two
 * paths and asserting both filter, it asserts that NO return from `getCatalogue` skips the
 * filter, whatever paths exist. Adding an unfiltered early return fails it.
 *
 * A source scan rather than a call, because `catalogue-source.ts` imports `@/app/chains` and the
 * `@/` alias does not resolve under `node --experimental-strip-types`.
 */

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  const here = dirname(fileURLToPath(import.meta.url));
  const code = readFileSync(
    join(here, "..", "lib", "catalogue-source.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  check(
    "a moderation filter exists",
    /function filterModerated/.test(code),
    true,
  );
  check("it reads masterSuspended", /masterSuspended/.test(code), true);
  check("it reads masterPurged", /masterPurged/.test(code), true);

  // Every return, not a counted set of known paths.
  const gcStart = code.indexOf("export async function getCatalogue");
  const gcEnd = code.indexOf("\nexport ", gcStart + 1);
  const gc =
    gcStart >= 0 ? code.slice(gcStart, gcEnd > 0 ? gcEnd : undefined) : "";

  check("getCatalogue is still in the file", gc.length > 0, true);

  // EVERY object return, not the ones that look like row returns.
  //
  // The first version of this filtered on `rows:` and was blind to the mutation it exists to
  // catch: an added `return { rows, source: "chain" ... }` uses shorthand property syntax, has
  // no `rows:` anywhere, and sailed straight through. Matching every `return {` and requiring
  // all of them to filter has no such gap — getCatalogue returns one shape, so there is nothing
  // else here for it to catch by accident.
  //
  // The window starts AFTER `return {` rather than ending at `rows:`, because `filterModerated`
  // sits on the rows line itself; a match that stopped there could never contain it.
  // Bounded at the return's OWN closing `};`, not by a character count. A fixed 400-char window
  // from an unfiltered early return simply ran on into the NEXT return — which does filter — so
  // the mutation passed twice before this was right. The bug and the check had the same shape.
  const returns = [...gc.matchAll(/return\s*\{[\s\S]*?\};/g)];
  check("getCatalogue returns at least once", returns.length >= 1, true);
  check(
    "NO path returns rows without filtering them",
    returns.every((m) => /filterModerated/.test(m[0])),
    true,
  );

  // The indexer is gone; a reintroduced second source must not slip past the filter unnoticed.
  check(
    "the indexer branch really is gone, not merely unused",
    /fetchFromEnvio|source:\s*"envio"/.test(code),
    false,
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
