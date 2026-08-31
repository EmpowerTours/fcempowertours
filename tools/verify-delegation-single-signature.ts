/**
 * A delegation must mean ONE signature, not one per action.
 *
 * The point of a delegation is that the user authorises once and the platform
 * acts for them afterwards. An earlier fix made execute-delegated demand proven
 * ownership on EVERY fund-moving action, which is correct security and the
 * wrong design: it handed back exactly the wallet-prompt friction the
 * delegation exists to remove.
 *
 * The resolution is that a delegation created WITH proof is itself the proof.
 * That only holds while three things stay true together, so they are pinned
 * here — if any one drifts, users get a 401 with no prompt and no way forward.
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

// 1. Creation must record whether ownership was PROVEN, not merely claimed.
const create = strip(read("app/api/create-delegation/route.ts"));
checks++;
if (!/ownershipProven\s*=\s*authz\.ownsAddress/.test(create)) {
  failures.push(
    "create-delegation no longer derives ownershipProven from authz.ownsAddress; " +
      "an unproven delegation could then authorise fund-moving actions",
  );
}
checks++;
if (!/\bownershipProven,/.test(create)) {
  failures.push(
    "create-delegation builds a delegation without persisting ownershipProven; " +
      "execute-delegated will never accept it and every action re-prompts",
  );
}

// 2. The gate must accept a proven delegation, and must still check it is
//    unexpired and actually lists the action.
const exec = strip(read("app/api/execute-delegated/route.ts"));
checks++;
if (!/ownershipProven\s*===\s*true/.test(exec)) {
  failures.push(
    "execute-delegated does not accept a proven delegation as proof of " +
      "ownership; every fund-moving action costs the user a wallet signature",
  );
}
for (const [needle, what] of [
  [/expiresAt\s*>\s*Date\.now\(\)/, "expiry"],
  [/permissions\.includes\(action\)/, "the action's presence in the permission list"],
] as const) {
  checks++;
  if (!needle.test(exec)) {
    failures.push(
      `execute-delegated accepts a delegation without checking ${what}; that ` +
        "widens a delegation beyond what the user agreed to",
    );
  }
}

// 3. The permissions a delegation is CREATED with must cover exactly what the
//    client then declines to sign for. Drift either re-prompts needlessly or,
//    worse, sends nothing for an action the delegation does not cover.
const covered = read("lib/delegation-covered.ts");
const listed = [...covered.matchAll(/^\s*"([a-z_]+)",$/gm)].map((m) => m[1]);
checks++;
if (listed.length === 0) {
  failures.push("lib/delegation-covered.ts exposes no DELEGATION_PERMISSIONS");
}
for (const surface of [
  "app/passport/page.tsx",
  "app/components/oracle/PassportMintModal.tsx",
]) {
  const src = read(surface);
  const req = /permissions:\s*\[([^\]]*)\]/.exec(src);
  checks++;
  if (!req) {
    failures.push(`${surface} no longer requests delegation permissions`);
    continue;
  }
  const asked = [...req[1].matchAll(/'([a-z_]+)'|"([a-z_]+)"/g)].map(
    (m) => m[1] ?? m[2],
  );
  const missing = asked.filter((a) => !listed.includes(a));
  const extra = listed.filter((l) => !asked.includes(l));
  if (missing.length || extra.length) {
    failures.push(
      `${surface} requests [${asked.join(", ")}] but DELEGATION_PERMISSIONS is ` +
        `[${listed.join(", ")}]; the client would skip signing for an action ` +
        "the delegation does not cover, or sign for one it does",
    );
  }

  // An unproven delegation passes the client's "looks valid" test but is
  // rejected server-side, leaving the user stuck with no prompt to recover.
  checks++;
  if (!/ownershipProven\s*===\s*true/.test(src)) {
    failures.push(
      `${surface} treats a delegation as usable without checking ` +
        "ownershipProven; a stale unproven delegation strands the user on a 401",
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ delegation means one signature — ${checks} checks passed`);
