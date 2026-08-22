/**
 * Replay proposed manifest entries through the guard's own parser.
 *
 * Run: `node --experimental-strip-types tools/verify-manifest-entries.ts <manifest.json>`
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

const path = process.argv[2];
if (!path) {
  console.error("usage: verify-manifest-entries.ts <manifest.json>");
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

let ok = 0;
const problems: string[] = [];

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
  ok++;
}

console.log(`${ok}/${entries.length} entries the guard would allow`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}
console.log("all entries match the commands they authorise");
