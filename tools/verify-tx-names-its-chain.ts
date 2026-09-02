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
import { readFileSync, readdirSync, statSync } from "node:fs";
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

for (const file of walk(join(root, "app"))) {
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (!/\bsendTransaction\(\{/.test(code)) continue;

  // Each call's own object literal, not the whole file: one call setting
  // chainId must not vouch for another that does not.
  for (const m of code.matchAll(/\bsendTransaction\(\{/g)) {
    const start = m.index ?? 0;
    const slice = code.slice(start, start + 400);
    const end = slice.indexOf("})");
    const literal = end > 0 ? slice.slice(0, end) : slice;
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
console.log(`✓ every sendTransaction names its chain — ${checks} checks passed`);
