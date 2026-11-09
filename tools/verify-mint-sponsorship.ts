/**
 * Verifies who pays the gas for an artist's mint (`lib/mint-sponsorship.ts`).
 *
 * Run: `node --experimental-strip-types tools/verify-mint-sponsorship.ts`
 *
 * ## What this is defending
 *
 * The mint page says "FREE Mint! We pay all gas fees". On 2026-11-08 that was false: a new
 * artist's mint ran from their own, never-funded Safe and failed with "Insufficient balance in
 * your Safe wallet" — the first thing a new artist ever saw. The fix sends v3 mints through the
 * platform Safe, and every rule below is one that fails silently if broken:
 *
 * - relaying a LEGACY mint would let the platform assert who the artist is;
 * - sponsoring a mint that carries a fee would have the platform pay its own treasury;
 * - a missing cap drains the platform Safe that passports and the radio also run on;
 * - a mint path that bypasses `executeMint` quietly goes back to "FREE" being a lie;
 * - a sponsor failure that does not fall back turns a free-mint outage into a mint outage.
 */

import { readFileSync } from "node:fs";
import {
  decideSponsorship,
  fallbackNotice,
  DEFAULT_SPONSOR_LIMITS,
} from "../lib/mint-sponsorship.ts";

const failures: string[] = [];
let checks = 0;
function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const MON = 1_000_000_000_000_000_000n;
const ok = {
  isV3: true,
  requiredValue: 0n,
  platformBalanceWei: 20n * MON,
  walletCountToday: 1,
  globalCountToday: 1,
  limits: DEFAULT_SPONSOR_LIMITS,
};
const reason = (d: ReturnType<typeof decideSponsorship>) =>
  d.sponsored ? "sponsored" : d.reason;

// ------------------------------------------------------------------------ the decision

check(
  "an ordinary v3 mint is sponsored",
  reason(decideSponsorship(ok)),
  "sponsored",
);
check(
  "a legacy mint is never relayed (the caller would assert the artist)",
  reason(decideSponsorship({ ...ok, isV3: false })),
  "legacy-contracts",
);
check(
  "a mint carrying a fee is never sponsored",
  reason(decideSponsorship({ ...ok, requiredValue: 5n * MON })),
  "carries-payment",
);
check(
  "below the platform floor nothing is sponsored",
  reason(decideSponsorship({ ...ok, platformBalanceWei: 4n * MON })),
  "platform-low",
);
check(
  "exactly at the floor is still sponsored",
  reason(decideSponsorship({ ...ok, platformBalanceWei: 5n * MON })),
  "sponsored",
);
check(
  "the floor is never below the 3 MON Pimlico reserve sendSafeTransaction needs",
  DEFAULT_SPONSOR_LIMITS.minPlatformWei >= 3n * MON,
  true,
);
check(
  "the 50th mint of the day is sponsored",
  reason(decideSponsorship({ ...ok, globalCountToday: 50 })),
  "sponsored",
);
check(
  "the 51st mint of the day is not",
  reason(decideSponsorship({ ...ok, globalCountToday: 51 })),
  "global-cap",
);
check(
  "a wallet's 6th mint of the day is not sponsored",
  reason(decideSponsorship({ ...ok, walletCountToday: 6 })),
  "wallet-cap",
);
for (const missing of [
  "platformBalanceWei",
  "walletCountToday",
  "globalCountToday",
] as const) {
  check(
    `an unreadable ${missing} refuses (refusing costs the platform nothing)`,
    reason(decideSponsorship({ ...ok, [missing]: null })),
    "unavailable",
  );
}
check(
  "the global cap bounds daily spend to under 5 MON at the measured ~0.081 MON/mint",
  DEFAULT_SPONSOR_LIMITS.globalPerDay * 0.081 < 5,
  true,
);

// ------------------------------------------------------------------- what the artist sees

check(
  "a capped artist is told why, not just 'insufficient balance'",
  fallbackNotice("wallet-cap").length > 0,
  true,
);
check(
  "a paused sponsor says so",
  fallbackNotice("platform-low").length > 0,
  true,
);

// ------------------------------------------------------- the route actually uses all this

const route = readFileSync(
  new URL("../app/api/execute-delegated/route.ts", import.meta.url),
  "utf8",
);
const caseBody = (name: string) => {
  const start = route.indexOf(`case "${name}": {`);
  const next = route.indexOf('\n      case "', start + 10);
  return start < 0 ? "" : route.slice(start, next < 0 ? undefined : next);
};
for (const c of ["mint_music", "mint_collector"]) {
  const body = caseBody(c);
  check(`${c} exists`, body.length > 0, true);
  check(
    `${c} sends through executeMint`,
    /await executeMint\(/.test(body),
    true,
  );
  check(
    `${c} does not bypass the sponsor with executeTransaction`,
    /executeTransaction\(/.test(body),
    false,
  );
}
const mintFn = route.slice(
  route.indexOf("async function executeMint("),
  route.indexOf("// ✅ Helper: Convert price from wei"),
);
check(
  "a failed sponsored send releases its slot and falls through to the artist's Safe",
  /catch \(err\) \{\s*await release\(\);/.test(mintFn) &&
    mintFn.indexOf("await release();") <
      mintFn.lastIndexOf("executeTransaction("),
  true,
);
check(
  "the fallback asks for the measured mint cost, not the old 0.05",
  /MINT_GAS_BUFFER = parseEther\("0\.1"\)/.test(route) &&
    /executeTransaction\([\s\S]*?MINT_GAS_BUFFER/.test(mintFn),
  true,
);

// ------------------------------------------------------------------------------- report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
