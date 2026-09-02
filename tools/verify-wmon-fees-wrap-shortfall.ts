/**
 * A WMON fee charged from a user's Safe must wrap the shortfall first.
 *
 * Safes here are funded in native MON. Every paid action therefore batches
 * `WMON.deposit()` ahead of its transfer — except two, which just transferred
 * WMON the Safe did not have. The press-kit route failed for a Safe holding
 * 44 MON and 0 WMON, and surfaced as "Failed to generate press kit"; the
 * booking route would have let `approve()` succeed against a zero balance and
 * let `createBooking` revert afterwards.
 *
 * The failure is invisible from the code: a transfer of a token you do not hold
 * is written exactly like one you do. So the check is structural — if a route
 * moves WMON out of a user Safe, a deposit() has to appear in the same file.
 *
 * Run: npx tsx tools/verify-wmon-fees-wrap-shortfall.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
let charging = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/^route\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const routes = walk(join(root, "app/api"));
checks++;
if (routes.length === 0) {
  failures.push("found no API routes to check — did app/api move?");
}

for (const file of routes) {
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const spendsFromSafe = /sendUserSafeTransaction\s*\(/.test(code);
  const touchesWmon = /WMON_ADDRESS|NEXT_PUBLIC_WMON/.test(code);
  if (!spendsFromSafe || !touchesWmon) continue;

  charging++;
  checks++;
  if (!/functionName:\s*['"`]deposit['"`]/.test(code)) {
    failures.push(
      `${relative(root, file)} moves WMON out of a user Safe with no ` +
        "WMON.deposit() wrap — the Safe is funded in MON, so this fails for " +
        "anyone who has not manually wrapped first",
    );
  }
}

checks++;
if (charging === 0) {
  failures.push(
    "found no routes charging WMON from a user Safe — the detection above has " +
      "gone stale, so this check is passing without testing anything",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${charging} WMON-charging route(s) wrap the shortfall — ${checks} checks passed`,
);
