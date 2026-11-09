/**
 * No user-facing text may mention TOURS.
 *
 * Run: `node --experimental-strip-types tools/verify-no-tours-in-ui.ts`
 *
 * ## What this is defending
 *
 * TOURS is not used by this app's protocol. Checked on chain 2026-11-08: the last TOURS transfer
 * of any kind was 64 days earlier, and ToursRewardManagerV2 holds 1,000,000 TOURS with
 * `totalDistributed() == 0`. Every payment an artist or listener receives is WMON.
 *
 * The UI said otherwise in several places at once: the licensing agreement promised "TOURS
 * rewards", the profile labelled WMON master prices as "TOURS", payout claims sent a second
 * transaction for TOURS that could only fail and then reported "TOURS not claimed", and a
 * `/tweaks` store sold items for TOURS. Earlier removals (2026-09-02..04) took out balance tiles
 * and left these, which is why this is now a check rather than a sweep.
 *
 * Comments are ignored: the removal notes that explain WHY a TOURS tile is gone are wanted.
 * `EmpowerTours` is the brand, not the token, and never matches the word-boundary pattern.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;

/**
 * Files still allowed to show TOURS, each with the reason. Empty since 2026-11-08, when Monad
 * Mirror (charged 10 TOURS) and the investor deck were removed. Never add to it without a reason
 * that names what is actually paid in TOURS.
 */
const ALLOWED: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Blank out comments, keeping line numbers, so only code and visible text are searched. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(
      /(^|[^:"'`])\/\/.*$/gm,
      (m, pre) => pre + " ".repeat(m.length - pre.length),
    );
}

const failures: string[] = [];
let scanned = 0;
for (const dir of ["app", "components"]) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file);
    if (rel.startsWith("app/api/")) continue; // server code, not shown to a user
    scanned++;
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      // "EMPOWER TOURS" is the brand set in two words (the passport artwork), not the token.
      const visible = line.replace(/EMPOWER\s+TOURS/g, "");
      if (/\bTOURS\b/.test(visible) && !ALLOWED[rel]) {
        failures.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
}

for (const rel of Object.keys(ALLOWED)) {
  try {
    const text = stripComments(readFileSync(join(root, rel), "utf8"));
    if (!/\bTOURS\b/.test(text)) {
      failures.push(
        `${rel} no longer shows TOURS — remove it from ALLOWED so it stays that way`,
      );
    }
  } catch {
    failures.push(`${rel} is in ALLOWED but does not exist — remove the entry`);
  }
}

console.log(`\n${scanned} UI files scanned`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} TOURS mention(s) in user-facing code:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ no user-facing TOURS outside the documented exceptions\n");
