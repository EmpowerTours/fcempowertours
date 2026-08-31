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
 * SCOPE: this is a client-side check only. The mint path validates the FORMAT
 * of countryCode and nothing else, so a crafted POST can still mint any
 * country. Enforcing that server-side is a separate, deliberate decision — see
 * the note in app/passport/page.tsx.
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

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ passport country comes from GPS — ${checks} checks passed`);
