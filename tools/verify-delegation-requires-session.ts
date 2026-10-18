/**
 * A proven delegation must NOT authorise fund-moving spends by address alone.
 *
 * Run: `npx tsx tools/verify-delegation-requires-session.ts`
 *
 * ## What this is defending
 *
 * Delegations are keyed in Redis by `userAddress`. If execute-delegated /
 * bot-command / register-user-safe treat `ownershipProven` as enough, anyone
 * who knows the address can spend that user's Safe for the full 24h window.
 * That is griefing (force-buy a track) rather than theft, and it is still the
 * victim's money leaving on somebody else's instruction.
 *
 * The fix is a session secret issued at create-delegation time, stored as a
 * hash on the delegation, returned once to the creating browser, and required
 * as `x-delegation-session` when leaning on the delegation for identity.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const session = strip(read("lib/delegation-session.ts"));
checks++;
if (!/mintDelegationSessionSecret/.test(session)) {
  failures.push("lib/delegation-session.ts is missing mintDelegationSessionSecret");
}
checks++;
if (!/hashDelegationSessionSecret/.test(session)) {
  failures.push("lib/delegation-session.ts is missing hashDelegationSessionSecret");
}
checks++;
if (!/timingSafeEqual/.test(session)) {
  failures.push("session compare must use timingSafeEqual");
}

const proof = strip(read("lib/delegation-proof.ts"));
checks++;
if (!/delegationSessionMatches\s*\(/.test(proof)) {
  failures.push(
    "delegation-proof no longer requires a matching session secret; " +
      "knowing only the address would authorise fund-moving actions",
  );
}
checks++;
if (!/sessionSecretHash/.test(proof)) {
  failures.push("delegation-proof does not read sessionSecretHash from the store");
}

const create = strip(read("app/api/create-delegation/route.ts"));
checks++;
if (!/mintDelegationSessionSecret\s*\(/.test(create)) {
  failures.push("create-delegation does not mint a session secret");
}
checks++;
if (!/sessionSecretHash:\s*hashDelegationSessionSecret/.test(create)) {
  failures.push("create-delegation does not store the session secret hash");
}
checks++;
if (!/sessionSecret/.test(create)) {
  failures.push("create-delegation does not return sessionSecret to the creator");
}

for (const [rel, label] of [
  ["app/api/execute-delegated/route.ts", "execute-delegated"],
  ["app/api/bot-command/route.ts", "bot-command"],
  ["app/api/register-user-safe/route.ts", "register-user-safe"],
] as const) {
  const src = strip(read(rel));
  checks++;
  if (!/DELEGATION_SESSION_HEADER/.test(src)) {
    failures.push(`${label} does not read x-delegation-session`);
  }
  checks++;
  if (!/delegationProvesOwnership\([^)]*sessionSecret/.test(src)) {
    failures.push(
      `${label} calls delegationProvesOwnership without the session secret`,
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ delegation spends require a session secret — ${checks} checks passed`,
);
