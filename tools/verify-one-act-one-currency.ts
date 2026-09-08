/**
 * Verifies that no single act is rewarded in two currencies.
 *
 * Run: `npx tsx tools/verify-one-act-one-currency.ts`
 *
 * ## What this is defending
 *
 * Listening used to pay twice. In one `if` block in `app/api/live-radio/route.ts`:
 *
 *     rewardEarned += LISTEN_REWARD_TOURS;   // -> pendingRewards, the TOURS ledger
 *     stats.totalSongsListened++;            // -> computeListenerPoints, the WMON split
 *
 * Two adjacent lines, two currencies, one listen. The 7-day streak was worse: it paid
 * STREAK_BONUS_TOURS here while `computeListenerPoints` already granted 5 WMON points for the
 * same streak. Paying twice does not reward the listener twice — it inflates TOURS against no
 * new value and gives a farmer two targets where the design intended one.
 *
 * The rule the codebase now follows: an act with revenue attached is paid in WMON out of that
 * revenue. TOURS is for contributions with nothing to be paid out of — a verified climb, a
 * first discovery, a published master.
 *
 * ## Why this checks BOTH directions
 *
 * A check that only asserted "no TOURS on the listening path" would pass if somebody deleted
 * the WMON bookkeeping instead — the same file, a much worse bug, and silent. So this also
 * requires the WMON input to still be there. Removal alone is never the success condition.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const failures: string[] = [];
let checks = 0;

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(here, "..", "app", "api", "live-radio", "route.ts");
const src = readFileSync(routePath, "utf8");

/** Comments describe intent; only code is evidence. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** The named TOURS rates that paid for listening. None may come back. */
const RETIRED_RATES = [
  "LISTEN_REWARD_TOURS",
  "FIRST_LISTENER_BONUS_TOURS",
  "STREAK_BONUS_TOURS",
];

for (const name of RETIRED_RATES) {
  checks++;
  if (code.includes(name)) {
    failures.push(
      `${name} is back in live-radio. Listening is paid in WMON via\n` +
        `     computeListenerPoints; a TOURS rate on the same act pays for it twice.`,
    );
  }
}

/**
 * The TOURS ledger must not be credited anywhere in this route.
 *
 * Reads are fine — claim_rewards reports the preserved balance. Only `+=` is an accrual.
 */
const LEDGERS = ["pendingRewards", "totalRewardsEarned"];
for (const ledger of LEDGERS) {
  checks++;
  const credit = new RegExp(`\\.${ledger}\\s*\\+=`);
  if (credit.test(code)) {
    failures.push(
      `live-radio credits \`${ledger}\` — that is a TOURS accrual on the listening path.\n` +
        `     Listening already pays WMON from the subscription reserve.`,
    );
  }
}

/**
 * ---- The other direction. The WMON path must still work.
 *
 * `totalSongsListened` is the input to computeListenerPoints and therefore to every listener's
 * pro-rata share. Deleting it would "fix" the double-pay by stopping all pay.
 */
checks++;
if (!/stats\.totalSongsListened\s*\+\+/.test(code)) {
  failures.push(
    "live-radio no longer increments `stats.totalSongsListened` — the WMON point input is\n" +
      "     gone, so listeners now earn nothing at all. This is not the fix.",
  );
}

/** The streak still has to be tracked: computeListenerPoints pays 5 WMON points per 7 days. */
checks++;
if (!/stats\.currentStreak\s*\+\+/.test(code)) {
  failures.push(
    "live-radio no longer tracks `currentStreak` — computeListenerPoints pays WMON for it",
  );
}

/** And the points module must still honour the streak it is tracked for. */
const pointsPath = join(here, "..", "lib", "listener-points.ts");
const points = readFileSync(pointsPath, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

checks++;
if (!points.includes("currentStreak")) {
  failures.push(
    "lib/listener-points.ts ignores currentStreak — the streak is now tracked and paid by\n" +
      "     nobody, which is the double-pay bug inverted",
  );
}

/** Listening rates advertised over the API must not quote TOURS. */
checks++;
const rewardsBlock = /rewards:\s*\{([^}]*)\}/.exec(code);
if (rewardsBlock && /TOURS/i.test(rewardsBlock[1])) {
  failures.push(
    "the GET `rewards` block quotes a TOURS rate for listening — it pays WMON",
  );
}

if (failures.length > 0) {
  console.error(`✗ an act is rewarded in two currencies\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(`✓ one act, one currency — ${checks} checks passed`);
