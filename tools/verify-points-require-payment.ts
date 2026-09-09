/**
 * Verifies that nothing credits WMON listener points without an active subscription.
 *
 * Run: `npx tsx tools/verify-points-require-payment.ts`
 *
 * ## What this is defending
 *
 * `totalSongsListened` is the denominator the 20% WMON listener pool splits by, and that pool
 * is funded entirely by subscribers. Anything that increments it without checking payment
 * hands a stranger a claim on money other people put in.
 *
 * Two paths write it, and they did not agree:
 *
 *   - `record-play` gated on `hasActiveSubscription` from the start. Its own comment reads
 *     "this gate is what makes farming cost money."
 *   - the `heartbeat` action in `live-radio` did not, until 2026-09-09. It verified the
 *     session was REAL (so points could not be claimed for someone else's address) but never
 *     that it was PAID. Anyone holding a radio session open accrued a share.
 *
 * On the day it was found, production showed 1,363 listener-credited plays against 28 recorded
 * on chain by PlayOracle — the chain figure being the one that had passed a subscription gate.
 *
 * ## The shape of the check, and the version of it that did not work
 *
 * The first attempt asked whether the FILE containing the increment mentioned
 * `hasActiveSubscription` anywhere. It passed with the gate deleted — live-radio names that
 * function in an unrelated helper hundreds of lines above the heartbeat, so a file-level match
 * proved nothing about the path that actually credits. An unfalsifiable check is worse than no
 * check: it reports safety it never measured.
 *
 * So this reads the WINDOW between the increment and the nearest enclosing guard, and requires
 * the payment test to appear between the start of the handler and the credit itself.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const failures: string[] = [];
let checks = 0;

const here = dirname(fileURLToPath(import.meta.url));
const roots = [join(here, "..", "app"), join(here, "..", "lib")];

/** Every .ts/.tsx under app/ and lib/. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = roots.flatMap((r) => walk(r));

/** Writers of the points counter. A read is fine; only an increment grants a share. */
const CREDIT = /\btotalSongsListened\s*(\+\+|\+=)/;

/** Any evidence the file establishes the listener has paid. */
const PAID = /hasActiveSubscription|isSubscribed|subscribed\b/;

let writers = 0;
for (const file of files) {
  const code = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  const at = code.search(CREDIT);
  if (at < 0) continue;
  writers++;
  checks++;

  const rel = file.slice(file.lastIndexOf("/app/") + 1) || file;

  // Only the code that RUNS before the credit can gate it. Anything after is irrelevant, and
  // anything in an unrelated helper further up is what made the first version of this check
  // pass while the gate was gone. Scope to the enclosing handler where there is one.
  const handlerAt = Math.max(
    code.lastIndexOf('action === "heartbeat"', at),
    code.lastIndexOf("export async function POST", at),
    0,
  );
  const window = code.slice(handlerAt, at);

  if (!PAID.test(window)) {
    failures.push(
      `${rel} increments totalSongsListened with no subscription check on the path that\n` +
        `     reaches it. That counter is the WMON listener pool's denominator and the pool is\n` +
        `     funded by subscribers — crediting it unpaid hands out a share of other people's\n` +
        `     money. A check elsewhere in the file does not gate this.`,
    );
    continue;
  }

  // The guard must also be applied, not merely computed. A resolved `subscribed` that never
  // appears in a condition is a variable, not a gate.
  checks++;
  const guarded =
    /if\s*\([^)]*\bsubscribed\b/.test(window) ||
    /if\s*\([^)]*hasActiveSubscription/.test(window) ||
    /!\s*subscribed[\s\S]{0,80}(return|continue)/.test(window);
  if (!guarded) {
    failures.push(
      `${rel} resolves a subscription but never branches on it before crediting points`,
    );
  }
}

/** If nothing writes the counter, this check has gone blind rather than passed. */
checks++;
if (writers === 0) {
  failures.push(
    "no file increments totalSongsListened — either the counter was renamed and this\n" +
      "     check is now blind, or listeners have stopped earning entirely",
  );
}

if (failures.length > 0) {
  console.error(`✗ listener points can be earned without paying\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(
  `✓ all ${writers} writer(s) of listener points require a subscription — ${checks} checks passed`,
);
