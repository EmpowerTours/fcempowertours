/**
 * Replay proposed manifest entries through the guard's own parser.
 *
 * Run: `node --experimental-strip-types tools/check-manifest-entries.ts <manifest.json>`
 *
 * Named `check-`, not `verify-`: .claude/verify.sh runs every `tools/verify-*.ts`
 * with no arguments as a repo invariant, and this one needs a manifest path. It
 * is a tool you point at a file, not a gate.
 *
 * ## Why this exists
 *
 * A manifest entry that does not match the command it was written for fails closed — the
 * transaction is simply denied. That is the safe direction, but it is indistinguishable from
 * "nobody approved it yet", so the mistake surfaces as confusion in the middle of a migration
 * rather than as an error.
 *
 * The parser below is a transcription of the one in `~/.claude/hooks/scripts/tx-guard.sh`:
 * whitespace-split the argument tail, stop at the first `--flag`, strip one layer of quotes per
 * token. It found a real problem — any argument containing a space parses into more tokens than
 * the entry has, so it can never match.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const path = process.argv[2];
if (!path) {
  console.error("usage: check-manifest-entries.ts <manifest.json>");
  process.exit(1);
}

interface Entry {
  approved?: boolean;
  to: string;
  sig: string;
  args: (string | number)[];
  note?: string;
  expires?: string;
}

const entries: Entry[] = JSON.parse(readFileSync(path, "utf8")).approved ?? [];

/** Quote an argument the way a shell user would. */
function shellQuote(a: string): string {
  return /^[A-Za-z0-9_:/.@%^+=-]+$/.test(a)
    ? a
    : `'${a.replace(/'/g, `'\\''`)}'`;
}

/** The guard's argument parser, transcribed. */
function guardArgs(cmd: string): string[] | null {
  const m = cmd.match(/cast\s+send\s+(0x[a-fA-F0-9]{40})\s+"([^"]+)"([\s\S]*)/);
  if (!m) return null;
  const out: string[] = [];
  for (const tok of m[3].split(/\s+/).filter(Boolean)) {
    if (tok.startsWith("--")) break;
    out.push(tok.replace(/^"|"$/g, "").replace(/^'|'$/g, ""));
  }
  return out;
}

/**
 * Which contract lives at each address, so a signature can be checked against the real ABI.
 *
 * This exists because a hand-typed signature was wrong: `migrateLegacyPassport`'s last parameter
 * is `uint256`, not `uint64`. Every byte of the entry looked right and the guard would have
 * approved it — `cast` would then have computed a selector that no function answers, and the
 * transaction would have reverted after the approval was already given.
 *
 * A signature nobody verified against the compiled artifact is a guess.
 */
const CONTRACT_AT: Record<string, string> = {
  "0xf824d444aaf251eb2197836ffb218d48927f8cb1": "SalesController",
  "0x42ebcd44c2295702130f0a641633c691ba5f9480": "LicenseRegistry",
  "0xe210b31bbdf8b28b28c07d45e9b4fc886aafdcef": "PlayOracleV3",
  "0x042edf80713e6822a891e4e8a0800c332b8200fd": "LiveRadioV3",
};
if (process.env.PASSPORT_V4) {
  CONTRACT_AT[process.env.PASSPORT_V4.toLowerCase()] = "PassportNFTV4";
}

const abiCache = new Map<string, Set<string> | null>();
function knownSignatures(contract: string): Set<string> | null {
  if (abiCache.has(contract)) return abiCache.get(contract)!;
  let set: Set<string> | null = null;
  try {
    const out = execFileSync(
      "forge",
      ["inspect", contract, "methodIdentifiers"],
      {
        cwd: "contracts",
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    set = new Set(
      out
        .split("\n")
        .map((l) => l.split("|")[1]?.trim())
        .filter((s): s is string => Boolean(s) && s.includes("(")),
    );
  } catch {
    set = null; // not buildable here — reported, not silently skipped
  }
  abiCache.set(contract, set);
  return set;
}

let ok = 0;
const problems: string[] = [];
const unchecked: string[] = [];

for (const e of entries) {
  const args = e.args.map(String);
  const cmd = `cast send ${e.to} "${e.sig}" ${args.map(shellQuote).join(" ")} --rpc-url $RPC`;
  const parsed = guardArgs(cmd);

  if (parsed === null) {
    problems.push(
      `${e.note ?? e.sig}: the guard cannot parse this command at all`,
    );
    continue;
  }
  if (JSON.stringify(parsed) !== JSON.stringify(args)) {
    problems.push(
      `${e.note ?? e.sig}: would be DENIED\n` +
        `      entry  : ${JSON.stringify(args)}\n` +
        `      parsed : ${JSON.stringify(parsed)}`,
    );
    continue;
  }
  if (e.approved !== true) {
    problems.push(`${e.note ?? e.sig}: entry is not marked approved`);
    continue;
  }
  if (e.expires && new Date(e.expires).getTime() < Date.now()) {
    problems.push(`${e.note ?? e.sig}: already expired at ${e.expires}`);
    continue;
  }

  // The signature must be a function the target contract actually has.
  const contract = CONTRACT_AT[e.to.toLowerCase()];
  if (!contract) {
    unchecked.push(`${e.to} — unknown contract, signature not verified`);
  } else {
    const sigs = knownSignatures(contract);
    if (sigs === null) {
      unchecked.push(
        `${contract} — could not read ABI, signature not verified`,
      );
    } else if (!sigs.has(e.sig)) {
      const near = [...sigs].filter(
        (s) => s.split("(")[0] === e.sig.split("(")[0],
      );
      problems.push(
        `${e.note ?? e.sig}: no such function on ${contract}\n` +
          `      entry : ${e.sig}` +
          (near.length ? `\n      actual: ${near.join(", ")}` : ""),
      );
      continue;
    }
  }
  ok++;
}

console.log(
  `${ok}/${entries.length} entries the guard would allow, with signatures checked against the compiled ABIs`,
);
if (unchecked.length) {
  console.error(`\n${unchecked.length} signature(s) NOT verified:`);
  for (const u of unchecked) console.error(`  - ${u}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}
console.log("all entries match the commands they authorise");
