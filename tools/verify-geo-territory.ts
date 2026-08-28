/**
 * Verifies territory correction for geolocation country codes.
 *
 * Run: `node --experimental-strip-types tools/verify-geo-territory.ts`
 *
 * ## What this is defending
 *
 * IPInfo reports Hong Kong and Macau as `CN`. Both have their own ISO 3166-1 code and their own
 * passport entry, so without correction a holder there mints a China passport.
 *
 * This is not cosmetic. It happened: passport #3 was minted 2026-02-10 with `countryCode: "CN"`,
 * and the first correction landed 2026-02-11. `PassportNFTV4` has no burn and no country setter,
 * so that token is wrong permanently. A miss here is not a wrong label, it is an immutable one.
 *
 * The original fix tested `city.includes("hong kong")`. IPInfo usually returns a district —
 * Kowloon, Central, Sha Tin — so it could still miss and produce the same bad passport. The cases
 * below are written around the districts specifically, because that is the shape of the failure
 * rather than a hypothetical.
 *
 * The last group matters most: correcting too eagerly is worse than not correcting. A mainland
 * address must never come back HK.
 */

import { resolveTerritory } from "../lib/geo-territory.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

// ---------------------------------------------------------------- timezone, the reliable signal

check(
  "an Asia/Hong_Kong timezone corrects CN to HK",
  resolveTerritory({ country: "CN", timezone: "Asia/Hong_Kong" }).countryCode,
  "HK",
);
check(
  "...and reports the timezone decided it",
  resolveTerritory({ country: "CN", timezone: "Asia/Hong_Kong" }).source,
  "timezone",
);
check(
  "Asia/Macau corrects CN to MO",
  resolveTerritory({ country: "CN", timezone: "Asia/Macau" }).countryCode,
  "MO",
);
check(
  "the Asia/Macao spelling works too",
  resolveTerritory({ country: "CN", timezone: "Asia/Macao" }).countryCode,
  "MO",
);
check(
  "timezone matching ignores case",
  resolveTerritory({ country: "CN", timezone: "asia/HONG_KONG" }).countryCode,
  "HK",
);

// ---------------------------------------------------------------- the districts that broke it

for (const city of [
  "Kowloon",
  "Central",
  "Sha Tin",
  "Tsuen Wan",
  "Yuen Long",
  "Kwun Tong",
  "Mong Kok",
  "Causeway Bay",
]) {
  check(
    `a "${city}" city corrects CN to HK — the substring check missed these`,
    resolveTerritory({ country: "CN", city }).countryCode,
    "HK",
  );
}

check(
  "a compound district name still matches",
  resolveTerritory({ country: "CN", city: "Kowloon City" }).countryCode,
  "HK",
);
check(
  "the original literal still works",
  resolveTerritory({ country: "CN", city: "Hong Kong" }).countryCode,
  "HK",
);
check(
  "region alone is enough",
  resolveTerritory({ country: "CN", region: "Hong Kong" }).countryCode,
  "HK",
);

// ---------------------------------------------------------------- precedence

check(
  "timezone wins over a conflicting city",
  resolveTerritory({
    country: "CN",
    timezone: "Asia/Hong_Kong",
    city: "Shenzhen",
  }).countryCode,
  "HK",
);

// ---------------------------------------------------------------- do not over-correct

check(
  "a mainland city is left alone",
  resolveTerritory({
    country: "CN",
    city: "Shanghai",
    timezone: "Asia/Shanghai",
  }).countryCode,
  "CN",
);
check(
  "...and is reported as uncorrected",
  resolveTerritory({ country: "CN", city: "Beijing" }).corrected,
  false,
);
check(
  "a bare CN with no other signal stays CN",
  resolveTerritory({ country: "CN" }).countryCode,
  "CN",
);
check(
  "a country that is not CN is never rewritten, even matching a district name",
  resolveTerritory({ country: "US", city: "Central" }).countryCode,
  "US",
);
check(
  "Taiwan already has its own code and is untouched",
  resolveTerritory({ country: "TW", city: "Taipei" }).countryCode,
  "TW",
);

// ---------------------------------------------------------------- shape

check(
  "codes are uppercased",
  resolveTerritory({ country: "cn" }).countryCode,
  "CN",
);
check(
  "a missing country yields empty, not a guess",
  resolveTerritory({}).countryCode,
  "",
);
check(
  "an empty city does not match a district by accident",
  resolveTerritory({ country: "CN", city: "" }).countryCode,
  "CN",
);

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
