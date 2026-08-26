/**
 * Verifies that every action which spends a user's money is fail-closed on proven ownership.
 *
 * Run: `node --experimental-strip-types tools/verify-value-actions-gated.ts`
 *
 * ## What this is defending
 *
 * `/api/execute-delegated` has two lists that must stay in agreement and are written 150 lines
 * apart:
 *
 *   `publicActions`      — skips the delegation check entirely
 *   `fundMovingActions`  — requires proven ownership REGARDLESS of ENFORCE_QUICK_AUTH
 *
 * An action in the first and missing from the second can be triggered by anyone, for anyone,
 * while the enforcement flag is off. That was the state of `buy_music`, `music-subscribe`,
 * `mint_collector` and six others until 2026-08-25: a stranger could POST a victim's address and
 * make them buy a track or take out a subscription, repeatedly. The money went to the artist
 * rather than the attacker, which makes it griefing rather than theft, and it is still the
 * victim's funds leaving on somebody else's instruction.
 *
 * ## Why a source scan and not a list
 *
 * Asserting a hardcoded list would pass forever while the code drifted underneath it — the
 * failure mode from `feedback_gates_must_measure_invariants`. This reads the switch itself,
 * decides which handlers move value by what they *do*, and requires each to be gated. A new
 * action that spends a Safe fails this the day it is written, without anyone remembering to
 * update a list.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const failures: string[] = [];
let checks = 0;

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(here, "..", "app", "api", "execute-delegated", "route.ts"),
  "utf8",
);

/** Comments describe intent; only code is evidence. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Pull a `new Set([...])` or `[...]` literal's string members. */
function members(afterMarker: string): Set<string> {
  const at = code.indexOf(afterMarker);
  if (at < 0) return new Set();
  const open = code.indexOf("[", at);
  const close = code.indexOf("]", open);
  const body = code.slice(open, close);
  return new Set([...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

const publicActions = members("const publicActions =");
const gated = members("const fundMovingActions = new Set(");

checks++;
if (publicActions.size === 0) failures.push("could not read publicActions");
checks++;
if (gated.size === 0) failures.push("could not read fundMovingActions");

/**
 * Split the switch into handlers, so each action is judged on its own body.
 *
 * A `case "x": {` at six spaces is the shape every handler in this route uses.
 */
const caseRe = /\n {6}case "([a-z0-9_-]+)":/gi;
const marks = [...code.matchAll(caseRe)].map((m) => ({
  action: m[1],
  at: m.index ?? 0,
}));

checks++;
if (marks.length < 20) {
  failures.push(
    `only found ${marks.length} handlers — the parser is probably wrong`,
  );
}

/**
 * Signals that a handler parts the user with value.
 *
 * Deliberately generous: a false positive costs someone a line in this file's allowlist, and a
 * false negative is an ungated spend.
 */
const VALUE_SIGNALS = [
  /\bparseEther\s*\(/,
  /functionName:\s*"(transfer|transferFrom|approve|deposit|withdraw)"/,
  /\bvalue:\s*(?!0n)[A-Za-z_]/,
];

/**
 * Handlers that touch value but move it only INSIDE the user's own control, so a stranger
 * triggering them wastes gas rather than the user's balance. Listed explicitly, with reasons,
 * rather than being silently skipped by a looser signal.
 */
const NOT_A_SPEND = new Map<string, string>([
  ["wrap_mon", "MON -> WMON, same owner, no counterparty"],
  [
    "approve_wmon_for_passport",
    "allowance only; the spend it enables is gated separately",
  ],
  ["burn_music", "destroys the caller's own token, pays nobody"],
  ["burn_nft", "destroys the caller's own token, pays nobody"],
  ["claim_artist_payouts", "moves value TOWARD the user"],
  ["claim_listener_wmon", "moves value TOWARD the user"],
  ["radio_claim_rewards", "moves value TOWARD the user"],
  ["faucet_claim", "moves value TOWARD the user"],
  ["dao_wrap", "TOURS -> vTOURS, same owner"],
  ["dao_unwrap", "vTOURS -> TOURS, same owner"],
  [
    "platform_send_mon",
    "spends the PLATFORM Safe; gated by authenticateAdminAction instead",
  ],
  ["radio_start", "platform Safe, owner-gated on-chain"],
  ["radio_mark_played", "bookkeeping; no value leg"],
]);

for (let i = 0; i < marks.length; i++) {
  const { action, at } = marks[i];
  const end = i + 1 < marks.length ? marks[i + 1].at : code.length;
  const body = code.slice(at, end);

  const spends = VALUE_SIGNALS.some((re) => re.test(body));
  if (!spends) continue;
  if (NOT_A_SPEND.has(action)) continue;

  // Only actions that skip the delegation check need this belt: everything else already
  // required a delegation the user created.
  if (!publicActions.has(action)) continue;

  checks++;
  if (!gated.has(action)) {
    failures.push(
      `"${action}" is in publicActions and spends value, but is NOT in fundMovingActions.\n` +
        `     While ENFORCE_QUICK_AUTH is off, anyone can trigger it for anyone.\n` +
        `     Add it to fundMovingActions, or to NOT_A_SPEND here with a reason.`,
    );
  }
}

// The categories that started this: proven ownership, never the rollout flag.
for (const critical of ["send_mon", "send_tours", "withdraw_to_user"]) {
  checks++;
  if (!gated.has(critical)) {
    failures.push(
      `"${critical}" must always be fail-closed and is not in fundMovingActions`,
    );
  }
}

// The gate must read ownsAddress, not allowed — `allowed` honours ENFORCE_QUICK_AUTH.
checks++;
if (!/fundMovingActions\.has\(action\)\s*&&\s*!authz\.ownsAddress/.test(code)) {
  failures.push(
    "the fund-moving gate no longer checks `!authz.ownsAddress` — if it reads `allowed`,\n" +
      "     its protection depends on ENFORCE_QUICK_AUTH again, which is the bug it exists to avoid",
  );
}

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
