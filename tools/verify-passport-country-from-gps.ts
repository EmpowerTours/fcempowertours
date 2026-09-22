/**
 * The passport country must come from where the user IS, never from a list.
 *
 * A passport you can pick off a dropdown of 195 countries records nothing about
 * travel, which is the whole point of the artefact. app/passport/page.tsx used
 * to render exactly that — a <select> over ALL_COUNTRIES wired to
 * setSelectedCountryCode — while PassportMintModal did the right thing and took
 * the country from geolocation only. Same product, two different rules.
 *
 * This pins the rule on both surfaces so the picker cannot come back.
 *
 * SCOPE: the picker half is a client-side check only. The mint path validates
 * the FORMAT of countryCode and nothing else, so a crafted POST can still mint
 * any country. Enforcing that server-side is a separate, deliberate decision —
 * see the note in app/passport/page.tsx.
 *
 * ## A country nobody picked can still be a country nobody observed
 *
 * Added 2026-09-22. Removing the dropdown was only half the rule. Three layers
 * underneath it quietly supplied `US` / `United States` whenever detection
 * failed, and a supplied country is exactly as unearned as a chosen one — worse,
 * because the user is never shown that a guess was made. The passport modal
 * renders whatever comes back as a confident "Detected: 🇺🇸 United States".
 *
 *   lib/useGeolocation.ts       every failure path set country: 'US'
 *   app/api/geo/route.ts        three returns of {country:'US'} at HTTP 200, so
 *                               the caller could not tell a guess from a fact
 *   app/api/bot-command/route.ts  let countryCode = "US", overwritten only on
 *                               success, minted on every failure
 *
 * PassportNFTV4 has no burn and no country setter, and a wallet gets one
 * passport per country, so a wrong guess permanently spends the holder's slot on
 * a country they may never have visited. That is not hypothetical: the note in
 * app/api/geo/route.ts records passport #3 minted as China on 2026-02-10 for the
 * same class of mistake.
 *
 * So: no hardcoded country may appear in any of the three. Not knowing must be
 * representable, and must reach the user as "we could not tell" rather than as a
 * country.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const SURFACES = [
  "app/passport/page.tsx",
  "app/components/oracle/PassportMintModal.tsx",
];

/** Drop comments so prose about a <select> cannot satisfy or trip a check. */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

for (const surface of SURFACES) {
  const src = strip(readFileSync(join(root, surface), "utf8"));

  // A <select> whose handler sets the country is a picker, whatever it is called.
  checks++;
  if (/<select[\s\S]{0,400}setSelectedCountryCode/.test(src)) {
    failures.push(
      `${surface} renders a <select> bound to setSelectedCountryCode; the ` +
        "country must come from geolocation, not from the user choosing it",
    );
  }

  // Rendering every country as an <option> is the same bug wearing a different hat.
  checks++;
  if (/ALL_COUNTRIES[\s\S]{0,200}<option/.test(src)) {
    failures.push(
      `${surface} maps ALL_COUNTRIES into <option> elements; that is a country ` +
        "picker regardless of how the value is later applied",
    );
  }

  // The positive half: the country has to actually be derived from location.
  checks++;
  if (!/setSelectedCountryCode\(\s*location\.country\s*\)/.test(src)) {
    failures.push(
      `${surface} never sets the country from location.country; nothing ties ` +
        "the passport to where the user is",
    );
  }
}

// ---------------------------------------------------------------- no invented country

/** The three layers that feed a mint. A literal country in any of them is a guess. */
const NO_GUESS_SURFACES = [
  "lib/useGeolocation.ts",
  "app/api/geo/route.ts",
  "app/api/bot-command/route.ts",
];

for (const surface of NO_GUESS_SURFACES) {
  const src = strip(readFileSync(join(root, surface), "utf8"));

  // bot-command is a large file that legitimately mentions many things; scope the scan to the
  // passport branch so this stays about the mint and does not fire on unrelated prose.
  const scope =
    surface === "app/api/bot-command/route.ts"
      ? (src.match(/Detect country FIRST[\s\S]{0,2000}/) || [""])[0]
      : src;

  checks++;
  if (/countryCode\s*[:=]\s*["']US["']|country\s*:\s*["']US["']/.test(scope)) {
    failures.push(
      `${surface} assigns a hardcoded US country code; not knowing must stay ` +
        "representable, because the mint is permanent",
    );
  }

  checks++;
  if (/["']United States["']/.test(scope)) {
    failures.push(
      `${surface} carries a hardcoded "United States" fallback; see the header ` +
        "— a supplied country is as unearned as a chosen one",
    );
  }
}

// The positive half for the server: it must be able to say "I do not know".
checks++;
{
  const geo = strip(readFileSync(join(root, "app/api/geo/route.ts"), "utf8"));
  if (!/status:\s*503/.test(geo) || !/country:\s*null/.test(geo)) {
    failures.push(
      "app/api/geo/route.ts must answer an unknown location with country: null and a " +
        "non-200 status; a 200 with a country is indistinguishable from a real answer",
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ passport country comes from GPS — ${checks} checks passed`);
