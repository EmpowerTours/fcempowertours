/**
 * A payout share shown to an artist must come from the contract, not a literal.
 *
 * SalesController pays the treasury `price * treasuryFeeBps / 10_000` and the
 * artist the rest. Two routes each hardcoded 70% for the artist, while the
 * deployed `treasuryFeeBps` is 1000 — 90%. Every artist saw their earnings
 * understated by a fifth, and nothing failed: a wrong constant computes just as
 * happily as a right one, and the number silently goes stale the moment anyone
 * calls `setTreasuryFeeBps`.
 *
 * So: no percentage-of-money arithmetic from a literal denominator. Split money
 * with a bps value read from the chain (`lib/artist-cut.ts`).
 *
 * Run: npx tsx tools/verify-payout-splits-come-from-chain.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [...walk(join(root, "app/api")), ...walk(join(root, "lib"))];
checks++;
if (files.length === 0) {
  failures.push("found no source files to check — did app/api or lib move?");
}

// `x * BigInt(70) / BigInt(100)` and `x * 70n / 100n`: a share of money taken
// from a literal percentage.
const LITERAL_SHARE =
  /\*\s*(?:BigInt\(\s*(\d{1,2})\s*\)|(\d{1,2})n)\s*\)?\s*\/\s*(?:BigInt\(\s*100\s*\)|100n)/g;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const m of code.matchAll(LITERAL_SHARE)) {
    checks++;
    const pct = m[1] ?? m[2];
    failures.push(
      `${relative(root, file)} splits a value with a hardcoded ${pct}% — ` +
        "read the share from the contract (see lib/artist-cut.ts) so it cannot " +
        "disagree with what the chain actually paid",
    );
  }
}

// The rule is only meaningful while the chain-reading helper it points at
// exists and actually reads the fee.
checks++;
const helper = join(root, "lib/artist-cut.ts");
let helperSrc = "";
try {
  helperSrc = readFileSync(helper, "utf8");
} catch {
  failures.push(
    "lib/artist-cut.ts is missing — the fix this check points at is gone",
  );
}
if (helperSrc && !/treasuryFeeBps/.test(helperSrc)) {
  failures.push(
    "lib/artist-cut.ts no longer reads treasuryFeeBps — it is not deriving the " +
      "split from the chain any more",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ no hardcoded payout splits — ${checks} checks passed`);
