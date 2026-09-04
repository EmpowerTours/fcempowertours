/**
 * A delegation-covered action must repair a stale delegation before using it.
 *
 * Being in DELEGATION_PERMISSIONS means the client will NOT ask for a wallet
 * signature. But the server checks the delegation the user actually holds
 * (`hasPermission` -> `delegation.config.permissions.includes(action)`), and a
 * delegation issued before the permission was added does not hold it. So the
 * client stays silent, the server answers 403, and the button does nothing.
 *
 * This is not hypothetical. Adding the radio actions to the covered list broke
 * Skip Random, Queue Song and voice notes for anyone holding an older
 * delegation -- the fix for one drift created another, in the opposite
 * direction, within the hour.
 *
 * The repair is cheap: read the stored delegation, and if it predates the
 * permission, create a fresh one. One signature instead of a dead end.
 *
 * Run: npx tsx tools/verify-covered-actions-repair-delegation.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
let guarded = 0;

const coveredSrc = readFileSync(
  join(root, "lib/delegation-covered.ts"),
  "utf8",
);
const listBody = coveredSrc.slice(
  coveredSrc.indexOf("export const DELEGATION_PERMISSIONS = ["),
  coveredSrc.indexOf("] as const;"),
);
const covered = new Set(
  [
    ...listBody
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .matchAll(/"([a-z_]+)"/g),
  ].map((m) => m[1]),
);

checks++;
if (covered.size === 0) {
  failures.push("could not parse DELEGATION_PERMISSIONS — this check is inert");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

for (const file of walk(join(root, "app"))) {
  const src = readFileSync(file, "utf8");
  if (!/["'`]\/api\/execute-delegated["'`]/.test(src)) continue;
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const m of code.matchAll(/action:\s*["']([a-z_]+)["']/g)) {
    const action = m[1];
    if (!covered.has(action)) continue; // still prompts; a stale delegation is caught by the prompt
    guarded++;
    checks++;
    // Either spelling of the repair counts. The passport flow rolled its own
    // before the helper existed -- it reads the stored permissions, checks
    // ownershipProven, and re-creates -- and that satisfies the invariant just
    // as well. Flagging working code trains people to ignore the check.
    const viaHelper = new RegExp(
      `ensureDelegationCovers\\([^)]*["']${action}["']`,
      "s",
    ).test(code);
    const viaInlineCheck =
      new RegExp(
        `permissions[\\s\\S]{0,40}includes\\(\\s*["']${action}["']`,
      ).test(code) && /["'`]\/api\/create-delegation["'`]/.test(code);
    const repaired = viaHelper || viaInlineCheck;
    if (!repaired) {
      const line = code.slice(0, m.index ?? 0).split("\n").length;
      failures.push(
        `${relative(root, file)}:${line} calls execute-delegated with "${action}", ` +
          "which is delegation-covered so no wallet prompt is shown — but it " +
          "never calls ensureDelegationCovers for it. A delegation issued " +
          "before that permission existed gets a silent 403.",
      );
    }
  }
}

checks++;
if (guarded === 0) {
  failures.push(
    "found no covered-action call sites — the detection has gone stale and " +
      "this check is not testing anything",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${guarded} covered-action call site(s) repair a stale delegation — ${checks} checks passed`,
);
