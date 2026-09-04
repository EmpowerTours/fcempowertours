/**
 * Every wallet transaction must name its chain.
 *
 * useFarcasterContext builds eth_sendTransaction with
 * `chainId: params.chainId ? hex : undefined`. Omit it and the Farcaster wallet
 * stays on whatever chain it is already on — Base by default — and cheerfully
 * offers to sign a Monad transaction there. Confirming does nothing at all,
 * because the contract does not exist on that chain, and nothing errors: the
 * user taps confirm and watches an empty result.
 *
 * That is what the catalogue re-publish did. It is invisible in code review
 * because the call looks complete.
 *
 * Run: npx tsx tools/verify-tx-names-its-chain.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

// Scans app/ AND components/. Components live in BOTH places in this repo, and
// a check that only walked app/ missed "Pending TOURS" in
// components/radio/ListenerRewardsClaim.tsx for a whole evening while I
// repeatedly reported the surface clean.
function walkRoots(root: string): string[] {
  const out: string[] = [];
  for (const dir of ["app", "components"]) {
    const full = join(root, dir);
    if (existsSync(full)) walk(full, out);
  }
  return out;
}

/**
 * The source of the object literal starting at `open` (the index of its "{"),
 * counting nested braces and skipping strings and template literals.
 */
function objectLiteralAt(code: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return code.slice(open);
}

for (const file of walkRoots(root)) {
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (!/\bsendTransaction\(\{/.test(code)) continue;

  // Each call's own object literal, not the whole file: one call setting
  // chainId must not vouch for another that does not.
  for (const m of code.matchAll(/\bsendTransaction\(\{/g)) {
    const start = m.index ?? 0;
    // Brace-match to the end of THIS object literal. Scanning to the first "})"
    // stopped at a nested encodeFunctionData({...}) and reported three correct
    // calls as missing a chainId -- a false positive, which is worse than no
    // check: it trains you to ignore the one time it is right.
    const literal = objectLiteralAt(code, start + m[0].length - 1);
    checks++;
    if (!/chainId/.test(literal)) {
      failures.push(
        `${relative(root, file)} calls sendTransaction without a chainId — the ` +
          "Farcaster wallet will prompt on whatever chain it is on (Base by " +
          "default) and confirming will do nothing",
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ every sendTransaction names its chain — ${checks} checks passed`,
);
