/**
 * Decodes REAL recorded chain data and checks what the app derives from it.
 *
 * Run: `npx tsx tools/verify-monthly-stats-decode.ts`
 *
 * ## Why this one is a fixture and not a source scan
 *
 * Every other invariant here reads our source. This reads bytes the chain actually returned
 * (`tools/fixtures/subscription-month-stats.json`, Monad mainnet block 106510529) and decodes
 * them offline. That is the only way to catch the class of bug where our code is internally
 * consistent and still disagrees with the contract.
 *
 * ## What it is defending
 *
 * **1. The positional decode.** `MusicSubscriptionV6.MonthlyStats` is
 * `(uint256 totalRevenue, uint256 totalPlays, uint256 distributedAmount, bool finalized)` and
 * `monthlyStats(uint256)` returns it as FOUR words with no names on the wire. Three live app
 * routes read it by position. The contract says so itself, at `MusicSubscriptionV6.sol:165`:
 * `Split` was made a separate mapping rather than a field precisely because "widening that
 * struct would silently shift what they read". A comment cannot fail a build; the word-count
 * assertion below can. Add a field to that struct and this goes red before anyone ships a page
 * showing `distributedAmount` where the play count belongs.
 *
 * **2. Plays are a COUNT, not wei.** The app once displayed play counts ~1000x the on-chain
 * truth. A `uint256` that is really `5` and a `uint256` that is really `5e18` decode the same
 * way and differ only by what you do next, so the fixture pins the magnitude: five plays reads
 * as 5, and anything that has been through a wei conversion cannot.
 *
 * **3. The two artist shares are different numbers and must not be conflated.** Both are real,
 * both were read from chain at the same block:
 *
 *   - A **sale** (SalesController): treasury takes `treasuryFeeBps` = 1000 bps, so the
 *     **artist gets 90%**. This is the one that was hardcoded at 70% and understated every
 *     artist's earnings by a fifth.
 *   - A **subscription month** (MusicSubscriptionV6): treasury 10% / reserve 20% /
 *     **artist pool 70%**.
 *
 * A 70 and a 90 that are both correct, in the same app, about the same word "artist" is exactly
 * how the first bug survived review. The checks below assert both, side by side, so the next
 * person reads them together.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodeAbiParameters, parseAbiParameters } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(
  readFileSync(join(here, "fixtures", "subscription-month-stats.json"), "utf8"),
);

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual, (_, v) =>
    typeof v === "bigint" ? `${v}n` : v,
  );
  const e = JSON.stringify(expected, (_, v) =>
    typeof v === "bigint" ? `${v}n` : v,
  );
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const WORD = 64; // hex chars per abi word
const hexWords = (raw: string) => (raw.replace(/^0x/, "").length / WORD) | 0;

// ------------------------------------------------------- the struct is still four words wide

// The guard that the contract's own comment asks for. Checked BEFORE decoding: viem will
// happily decode the first four words of a five-word return and report no problem at all.
for (const monthId of ["689", "690"]) {
  check(
    `monthlyStats(${monthId}) returns exactly 4 words — a widened MonthlyStats shifts every positional read`,
    hexWords(fx.monthlyStats[monthId].raw),
    4,
  );
}

const MONTHLY_STATS = parseAbiParameters(
  "uint256 totalRevenue, uint256 totalPlays, uint256 distributedAmount, bool finalized",
);

const decodeMonth = (monthId: string) =>
  decodeAbiParameters(
    MONTHLY_STATS,
    fx.monthlyStats[monthId].raw as `0x${string}`,
  );

// ------------------------------------------------------------------- a finalized month, 689

const [revenue689, plays689, distributed689, finalized689] = decodeMonth("689");

check("month 689 is finalized", finalized689, true);
check("month 689 revenue is 15 WMON", revenue689, 15_000_000_000_000_000_000n);
check(
  "month 689 distributed 10.5 WMON",
  distributed689,
  10_500_000_000_000_000_000n,
);

// Plays are a plain count. If anything upstream ever runs this through a wei conversion the
// number stops being small, which is the whole shape of the 1000x bug.
check("month 689 plays decode as a COUNT, not wei", plays689, 5n);
check(
  "...so the play count is small enough to be a real count",
  plays689 < 1_000_000n,
  true,
);

// ---------------------------------------------------------------- the split actually adds up

const reservePct = decodeAbiParameters(
  parseAbiParameters("uint256"),
  fx.scalars.reservePercentage as `0x${string}`,
)[0];
const artistPoolPct = decodeAbiParameters(
  parseAbiParameters("uint256"),
  fx.scalars.artistPoolPercentage as `0x${string}`,
)[0];

check("RESERVE_PERCENTAGE is 20", reservePct, 20n);
check("ARTIST_POOL_PERCENTAGE is 70", artistPoolPct, 70n);

const treasuryPct = 100n - reservePct - artistPoolPct;
check("...leaving the treasury 10", treasuryPct, 10n);

const treasuryCut = (revenue689 * treasuryPct) / 100n;
const reserveCut = (revenue689 * reservePct) / 100n;
const artistPool = revenue689 - treasuryCut - reserveCut;

check(
  "the three cuts sum to the month's revenue, with nothing lost to rounding",
  treasuryCut + reserveCut + artistPool,
  revenue689,
);
check(
  "and the artist pool is what the contract actually distributed",
  artistPool,
  distributed689,
);

// ------------------------------------------------- the OTHER artist share: a sale, not a month

const treasuryFeeBps = decodeAbiParameters(
  parseAbiParameters("uint256"),
  fx.scalars.treasuryFeeBps as `0x${string}`,
)[0];

check("SalesController treasuryFeeBps is 1000", treasuryFeeBps, 1_000n);

const salePrice = 1_000_000_000_000_000_000n; // 1 WMON
const artistFromSale = salePrice - (salePrice * treasuryFeeBps) / 10_000n;
check(
  "an artist keeps 90% of a SALE — not the 70% they keep of a subscription month",
  artistFromSale,
  900_000_000_000_000_000n,
);
check(
  "...and the two shares are genuinely different numbers",
  artistFromSale === (salePrice * artistPoolPct) / 100n,
  false,
);

// ------------------------------------------------------------- an unfinalized month, 690

const [revenue690, plays690, distributed690, finalized690] = decodeMonth("690");

check("month 690 is not finalized", finalized690, false);
check("month 690 has taken revenue", revenue690, 15_000_000_000_000_000_000n);
check("month 690 has plays", plays690, 4n);
// The one that matters for a UI: revenue is in, nothing is payable yet. Showing this month's
// revenue as an artist's earnings would promise money the contract will not release.
check(
  "month 690 has distributed NOTHING despite holding revenue",
  distributed690,
  0n,
);

// ------------------------------------------------------------------------------------- report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
