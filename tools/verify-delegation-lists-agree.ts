/**
 * Every delegation-covered context must actually be granted at creation.
 *
 * Two lists have to agree, and lib/delegation-covered.ts says why in its own
 * header: DELEGATION_PERMISSIONS decides when the client SKIPS a wallet prompt,
 * and create-delegation's DEFAULT_PERMISSIONS decides what the delegation
 * actually holds. When they drift, the client stays silent for a permission the
 * server does not have, and the user gets a 401 with nothing to click and no
 * way forward.
 *
 * They had drifted. `send_tours` was covered but is classified HIGH_RISK and
 * never granted by default -- so the prompt was skipped for a permission that
 * could never be there. `wrap_mon` was covered and simply absent. Both were
 * found by writing this check, not by reading the code.
 *
 * The reverse direction is fine: a delegation may hold more than the client
 * skips prompts for. Extra caution costs a signature, not a dead end.
 *
 * Run: npx tsx tools/verify-delegation-lists-agree.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const coveredSrc = readFileSync(
  join(root, "lib/delegation-covered.ts"),
  "utf8",
);
const createSrc = readFileSync(
  join(root, "app/api/create-delegation/route.ts"),
  "utf8",
);

function listAfter(src: string, marker: string, end: string): string[] {
  const i = src.indexOf(marker);
  if (i === -1) return [];
  const j = src.indexOf(end, i);
  const body = src.slice(i, j === -1 ? undefined : j);
  // Strip comments so a permission named in prose is not read as granted.
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

const covered = listAfter(
  coveredSrc,
  "export const DELEGATION_PERMISSIONS = [",
  "] as const;",
);
const granted = listAfter(createSrc, "const DEFAULT_PERMISSIONS = [", "];");

checks++;
if (covered.length === 0) {
  failures.push("could not parse DELEGATION_PERMISSIONS — this check is inert");
}
checks++;
if (granted.length === 0) {
  failures.push("could not parse DEFAULT_PERMISSIONS — this check is inert");
}

const grantedSet = new Set(granted);
for (const perm of covered) {
  checks++;
  if (!grantedSet.has(perm)) {
    failures.push(
      `"${perm}" is in DELEGATION_PERMISSIONS but is not granted by ` +
        "create-delegation. The client will skip the wallet prompt for it and " +
        "the server will reject it: a 401 with nothing to click.",
    );
  }
}

// A permission the client skips prompts for must also be a real action.
const executeSrc = readFileSync(
  join(root, "app/api/execute-delegated/route.ts"),
  "utf8",
);
for (const perm of covered) {
  checks++;
  if (!new RegExp(`case\\s+"${perm}"\\s*:`).test(executeSrc)) {
    failures.push(
      `"${perm}" is delegation-covered but execute-delegated has no case for ` +
        "it, so the prompt is skipped for something that cannot run at all",
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${covered.length} delegation-covered permissions are granted and real — ${checks} checks passed`,
);
