/**
 * Location detection must always end, and must never invent a country.
 *
 * Run: `npx tsx tools/verify-geolocation-cannot-hang.ts`
 *
 * ## What this is defending
 *
 * A passport mint got stuck on "Detecting your location…" forever, Mint disabled behind it,
 * reported from iOS Safari 2026-09-22. The hook passed `timeout: 10000` to
 * `getCurrentPosition` and reasonably assumed that bounded it. It does not. The W3C Geolocation
 * spec says, in terms:
 *
 *   "The time spent waiting for the document to become visible and for obtaining permission to
 *    use the API is not included in the period covered by the timeout member."
 *
 * So while a permission prompt sits unanswered — dismissed, swiped away, or never shown because
 * Location Services is off for the browser — neither callback fires, the timeout never starts,
 * and nothing anywhere ends the spinner. Both callbacks were correct and both were verified
 * working against production; the unhandled case was the user answering neither way.
 *
 * The fix is a wall-clock deadline that starts on mount and does not care what the prompt is
 * doing. This check requires it to still be there, because `PositionOptions.timeout` will keep
 * looking like it is enough to anyone reading the call.
 *
 * ## The second half matters more than the hang
 *
 * Every failure path used to end at `country: 'US', countryName: 'United States'`. The passport
 * modal renders that as a confident "Detected: 🇺🇸 United States" — there is no picker, by
 * design (`verify-passport-country-from-gps.ts`), so whatever the hook says is what gets minted.
 * Passports are one per wallet per country and minting is irreversible, so a guess permanently
 * spends a slot on a country the holder has never visited.
 *
 * Reporting nothing is recoverable. Reporting the wrong country is not. A literal country
 * fallback in this file is therefore a defect however harmless the diff looks.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/** Comments explain the rule; only code can break it. */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

const HOOK = "lib/useGeolocation.ts";
const src = strip(readFileSync(join(root, HOOK), "utf8"));

// ------------------------------------------------- detection always ends

// The constant existing proves nothing — deleting the timer that uses it leaves the declaration
// behind, and an earlier version of this check passed in exactly that state. Require the USE.
check(
  `${HOOK} has a wall-clock deadline, because PositionOptions.timeout excludes the permission prompt`,
  /setTimeout\([\s\S]{0,600}?DETECT_DEADLINE_MS\s*\)/.test(src),
  true,
);

check(
  "...and clears it on unmount, so it cannot fire into a dead component",
  /clearTimeout\(\s*deadline\s*\)/.test(src),
  true,
);

check(
  "...and ends loading exactly once, so a late callback cannot revive the spinner",
  /settled\s*=\s*true/.test(src) && /const settle\b/.test(src),
  true,
);

// Every network call in this file must be bounded. The original had three unbounded fetches:
// two to Nominatim and one to /api/geo. Any one of them stalling hung the modal just as hard as
// the prompt did, and no deadline existed to catch it either.
const bareFetches = [...src.matchAll(/(?<!WithTimeout|\w)\bfetch\s*\(/g)]
  .length;
check(
  "every fetch goes through fetchWithTimeout (the only bare fetch is inside the helper itself)",
  bareFetches,
  1,
);

check(
  "...and the helper actually aborts rather than just racing a promise",
  /AbortController/.test(src) && /controller\.abort\(\)/.test(src),
  true,
);

// ----------------------------------------- and never invents a country

for (const literal of ["'US'", '"US"', "United States"]) {
  check(
    `${HOOK} contains no ${literal} fallback — a guessed country mints an irreversible wrong passport`,
    src.includes(literal),
    false,
  );
}

check(
  "a failure clears the location rather than leaving a stale or invented one",
  /setLocation\(null\)/.test(src),
  true,
);

// ------------------------------- and the UI cannot mint without one

const MODAL = "app/components/oracle/PassportMintModal.tsx";
const modal = strip(readFileSync(join(root, MODAL), "utf8"));
check(
  `${MODAL} keeps Mint disabled until a country is known, which is what makes a null location safe`,
  /disabled=\{[^}]*!selectedCountryCode/.test(modal),
  true,
);

// ------------------------------------------- the checks can say no

{
  // Ran against the pre-fix file, where each of these was the actual state.
  const before = `
    const response = await fetch('/api/geo');
    setLocation({ country: 'US', countryName: 'United States', latitude, longitude });
  `;
  check(
    "an unbounded fetch is detected",
    [...before.matchAll(/(?<!WithTimeout|\w)\bfetch\s*\(/g)].length,
    1,
  );
  check(
    "a hardcoded country fallback is detected",
    before.includes("'US'"),
    true,
  );
  check(
    "and fetchWithTimeout is NOT counted as a bare fetch",
    [
      ...`await fetchWithTimeout('/api/geo', {})`.matchAll(
        /(?<!WithTimeout|\w)\bfetch\s*\(/g,
      ),
    ].length,
    0,
  );
}

// --------------------------------------------------------------- report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
