/**
 * Verifies that no path can credit a play to a master that has been taken down.
 *
 * Run: `npx tsx tools/verify-suspended-masters-earn-nothing.ts`
 *
 * ## What this is defending
 *
 * `MusicSubscriptionV6.recordPlay` never checks `masterSuspended`, and cannot be made to — it is
 * deployed and immutable. Suspension stops `LiveRadioV3` queueing a track and stops the catalogue
 * listing it, and that is all it ever did. Crediting was untouched: a suspended master reaching
 * the oracle by any other route still increments `artistMonthlyPlays` and `artistLifetimePlays`,
 * which are the two numbers the monthly WMON pool is divided by.
 *
 * Read off mainnet 2026-09-21: masters 1–5 are suspended, hold 8 lifetime plays and 3 of the 4
 * plays in month 690, and are attributed to the deployer key rather than to the artist. That
 * month's 15 WMON pool was on course to pay three quarters of itself to the wrong address for
 * tracks that had been taken down.
 *
 * `docs/PRIORITIES.md` item A said the problem "has stopped growing". It had — but because the
 * catalogue stopped listing those masters, not because anything refused to credit them. That is
 * an observation, not a control, and this file is the difference.
 *
 * ## Why the source scan is the important half
 *
 * The defect was not one wrong line. It was **four independent call sites** that each opened
 * their own ethers contract and each forgot the same check, because nothing required it. Fixing
 * four files fixes today; requiring the check is what survives the fifth being written.
 *
 * So this walks the tree for contract-level `recordPlay` calls and demands each one sit below a
 * gate in its own file. It deliberately does not hard-code the four known files: a new route that
 * drives the oracle is exactly the case this exists for, and a list would not contain it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import type { PublicClient } from "viem";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// ------------------------------------------------------------------ the scan

/**
 * Blank out comments and string contents, keeping every character position and newline.
 *
 * This is a small scanner rather than three chained regexes, and it has to be. The regex version
 * got both halves of this file wrong at once:
 *
 *   - Collapsing a block comment to a single space shifts every line after it. The gate check is
 *     "a gate appears above the call", which is a comparison of line numbers, so that reported
 *     `live-radio/route.ts:205` for a call on line 212.
 *   - Stripping `//` comments before strings eats the closing quote of
 *     `"https://rpc.monad.xyz"` — a literal that appears in all four of the files this scans.
 *     The unterminated string then pairs with the next quote somewhere further down, blanking
 *     real code in between. That is why the first run found 1 call site out of 5 and read the
 *     ABI entries as live code: the pairing was off by one quote for the rest of the file.
 *
 * Reordering does not fix it either — a quote inside a comment breaks it the other way. The two
 * constructs can only be told apart by reading left to right, once.
 *
 * Regex literals are not tracked. A regex containing a quote would desynchronise this the same
 * way; none of the scanned files has one, and the call-site count assertion below is what would
 * notice if that changed.
 */
function strip(src: string): string {
  const out: string[] = [];
  let i = 0;
  const keep = (c: string) => out.push(c === "\n" ? "\n" : c);
  const hide = (c: string) => out.push(c === "\n" ? "\n" : " ");

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next === "*") {
      hide(" "); hide(" "); i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) hide(src[i++]);
      if (i < src.length) { hide(" "); hide(" "); i += 2; }
      continue;
    }

    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") hide(src[i++]);
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      keep(c); i++;
      while (i < src.length) {
        if (src[i] === "\\") { hide(src[i]); if (i + 1 < src.length) hide(src[i + 1]); i += 2; continue; }
        if (src[i] === quote) break;
        hide(src[i++]);
      }
      if (i < src.length) { keep(src[i]); i++; }
      continue;
    }

    keep(c); i++;
  }
  return out.join("");
}

/**
 * A contract-level call: `something.recordPlay(`. The dot is what distinguishes it from the
 * local helper `recordPlay(...)` in lib/play-recording.ts and from the client-side call in
 * MusicPlaylist.tsx, neither of which touches a contract.
 */
const CALL = /\.\s*recordPlay\s*\(/;
/** Either export of lib/master-playable.ts counts as the gate. */
const GATE = /\b(mayRecordPlay|isMasterPlayable)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git")
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const sources = [join(root, "app"), join(root, "lib")].flatMap((d) => walk(d));

const callSites: { file: string; line: number; gatedAbove: boolean }[] = [];
for (const file of sources) {
  const lines = strip(readFileSync(file, "utf8")).split("\n");
  const gateLines = lines
    .map((l, i) => (GATE.test(l) ? i : -1))
    .filter((i) => i >= 0);
  lines.forEach((line, i) => {
    if (!CALL.test(line)) return;
    callSites.push({
      file: relative(root, file),
      line: i + 1,
      gatedAbove: gateLines.some((g) => g < i),
    });
  });
}

checks++;
if (callSites.length === 0) {
  failures.push(
    "no contract-level recordPlay call found anywhere — did the call move or get renamed? " +
      "This check is now blind, which is worse than red.",
  );
}

for (const site of callSites) {
  check(
    `${site.file}:${site.line} — the play is gated on the master not being taken down`,
    site.gatedAbove,
    true,
  );
}

// The five that existed when this was written. If the count drops, a path was deleted and the
// scan above is watching less than it was; if it rises, the new one had to pass the gate check.
checks++;
if (callSites.length < 5) {
  failures.push(
    `only ${callSites.length} recordPlay call sites found, expected at least the 5 that existed ` +
      `2026-09-21 (lib/play-recording.ts x2, record-play, live-radio, venue) — ` +
      `the scan may no longer match how the call is written`,
  );
}

// -------------------------------------------------- the detector can say no

{
  // Ran against the pre-fix tree, where every one of the four call sites reported false.
  // Kept inline so the predicate itself stays honest: a scan that cannot fail is not a scan.
  const ungated = strip(`
    const oracle = new Contract(addr, ["function recordPlay(address,uint256,uint256)"], w);
    const tx = await oracle.recordPlay(user, tokenId, duration);
  `).split("\n");
  const gates = ungated.filter((l) => GATE.test(l)).length;
  const calls = ungated.filter((l) => CALL.test(l)).length;
  check("an ungated call site is seen as a call", calls, 1);
  check("...and as having no gate", gates, 0);

  // And the ABI string that names the same function is NOT counted as a call — otherwise every
  // file would look like a call site and the check would be noise nobody reads.
  const abiOnly = strip(`
    const abi = ["function recordPlay(address user, uint256 masterTokenId, uint256 duration)"];
  `).split("\n");
  check(
    "an ABI entry naming recordPlay is not a call site",
    abiOnly.filter((l) => CALL.test(l)).length,
    0,
  );
}

// ------------------------------------------------------------- the verdicts

process.env.NEXT_PUBLIC_CONTRACTS_V3 = "true";
process.env.NEXT_PUBLIC_NFT_CONTRACT =
  "0x42EbcD44C2295702130f0A641633c691bA5f9480";

const { isMasterPlayable } = await import("../lib/master-playable.ts");

const ARTIST = "0x33fFCcb1802e13a7eead232BCd4706a2269582b0";
const ZERO = "0x0000000000000000000000000000000000000000";

/** Answers the three reads; `throws` makes one fail, which is the fail-closed case. */
function stub(opts: {
  suspended?: boolean;
  purged?: boolean;
  artist?: string;
  throws?: boolean;
}): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (opts.throws) throw new Error("RPC timeout");
      if (functionName === "masterSuspended") return opts.suspended ?? false;
      if (functionName === "masterPurged") return opts.purged ?? false;
      if (functionName === "getMaster")
        return [opts.artist ?? ARTIST, 0n, 0n, 0, 0, 0, ZERO, 0n, ZERO];
      throw new Error(
        `verify-suspended-masters-earn-nothing: unexpected read ${functionName} — this stub is now blind`,
      );
    },
  } as unknown as PublicClient;
}

check(
  "a live master may earn",
  (await isMasterPlayable(8, stub({}))).playable,
  true,
);
check(
  "a suspended master may not",
  (await isMasterPlayable(1, stub({ suspended: true }))).playable,
  false,
);
check(
  "a purged master may not",
  (await isMasterPlayable(1, stub({ purged: true }))).playable,
  false,
);
check(
  "a master that does not exist may not — recordPlay would revert, and Monad charges the whole limit",
  (await isMasterPlayable(999, stub({ artist: ZERO }))).playable,
  false,
);
check(
  "a read that did not come back may not — fail CLOSED, never optimistic",
  (await isMasterPlayable(8, stub({ throws: true }))).playable,
  false,
);
check(
  "...and says why, so a refusal is not silent",
  (await isMasterPlayable(8, stub({ throws: true }))).reason.includes(
    "could not check",
  ),
  true,
);

{
  // Suspension outranks nothing here, but the reason must name the real cause: a master that is
  // both purged and suspended is reported purged, because purging is the irreversible one.
  const v = await isMasterPlayable(1, stub({ suspended: true, purged: true }));
  check(
    "a purged-and-suspended master reports the permanent reason",
    v.reason.includes("purged"),
    true,
  );
}

// ------------------------------------------------------------------- report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
