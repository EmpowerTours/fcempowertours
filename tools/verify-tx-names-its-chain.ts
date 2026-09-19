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

// Scans app/, components/ AND lib/. Components live in BOTH of the first two in this repo, and
// a check that only walked app/ missed "Pending TOURS" in
// components/radio/ListenerRewardsClaim.tsx for a whole evening while I
// repeatedly reported the surface clean.
//
// lib/ was added 2026-09-19, for the second instance of the same mistake. `lib/epk-publish.ts`
// shipped an `eth_sendTransaction` with no chain named, and the user's wallet offered to sign the
// press-kit update on Base. This file existed the whole time and reported the repo clean, because
// the transaction was one directory outside what it looked at. `lib/artist-claim.ts` sends
// transactions too and was equally unscanned — it was correct by luck, not by check.
//
// The lesson is the scope, not the bug: a guard that names the directories it trusts will keep
// passing as code moves into ones it does not.
function walkRoots(root: string): string[] {
  const out: string[] = [];
  for (const dir of ["app", "components", "lib"]) {
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

/**
 * Server-side senders, excluded BY PATH and nothing else.
 *
 * Widening to lib/ immediately flagged these two. Both are wrong to flag: they send through a
 * bundler with the chain fixed by the viem client's config, and no wallet is ever prompted —
 * there is no Base to land on.
 *
 * A first attempt excluded them with a content heuristic ("does this file mention a provider?").
 * That silenced the ENTIRE check: 19 checks became 0, and it still printed a tick. A named list
 * of two files cannot do that — if it stops matching, the files get scanned, which fails loudly
 * rather than quietly.
 */
const SERVER_SIDE = ["lib/user-safe.ts", "lib/pimlico/smartAccount.ts"];

for (const file of walkRoots(root)) {
  const rel = relative(root, file).split("\\").join("/");
  if (SERVER_SIDE.includes(rel)) continue;

  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // ---- Form 2: the raw EIP-1193 call, `provider.request({ method: "eth_sendTransaction" })`.
  //
  // The original check only matched `sendTransaction({`, the useFarcasterContext helper. That is
  // not the only way to send: lib/epk-publish.ts and lib/artist-claim.ts both call the provider
  // directly, and neither was ever examined. epk-publish shipped without a chainId and prompted
  // the user on Base — with this file present and green, because it was not looking for this
  // shape at all.
  // Two ways to be correct, and the repo uses both:
  //
  //   chainId in the params                       — tells the host outright
  //   wallet_switchEthereumChain before the send  — moves the wallet first
  //
  // `lib/artist-claim.ts` and `components/radio/ListenerRewardsClaim.tsx` use the second and are
  // right to. A first version of this demanded chainId in params and flagged both — a false
  // positive against the established convention, which this file already warns twice is worse
  // than no check.
  //
  // What is NEVER correct is neither, and that is precisely what `lib/epk-publish.ts` shipped:
  // no switch, no chainId, and the user's wallet offered to sign on Base.
  // Scoped to the FILE, not to a window around the call. `lib/artist-claim.ts` switches in
  // `claimArtistPayoutsFromEOA` and sends in `sendAndConfirm`, ~77 lines apart — a window wide
  // enough to see that is wide enough to be meaningless. Following the call graph is more
  // machinery than this earns; a file that sends transactions and never mentions its chain is
  // the signal, and it is the one that caught both real bugs.
  if (/eth_sendTransaction/.test(code)) {
    checks++;
    const named =
      /chainId/.test(code) || /wallet_switchEthereumChain/.test(code);
    if (!named) {
      failures.push(
        `${rel} sends eth_sendTransaction and never names its chain — no chainId anywhere ` +
          "in the file and no wallet_switchEthereumChain. The Farcaster wallet will prompt " +
          "on whatever chain it is on (Base by default) and confirming will do nothing",
      );
    }
  }

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
