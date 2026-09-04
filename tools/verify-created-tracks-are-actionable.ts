/**
 * A surface that tells an artist how many tracks they made must let them act on
 * one.
 *
 * ProfileModal showed a "Music Created" stat box and nothing else — no track
 * list, no price, no way off sale. The per-track controls existed, but only on
 * /profile, a separate page. So the honest answer to "where do I change the
 * price of Ganado?" was "a page you do not use", and the track stayed listed at
 * a price set by a default nobody looked at.
 *
 * This repo grows duplicate surfaces for the same data — there were two music
 * mint UIs for the same reason — and the failure mode is always the same: one
 * of them silently lacks the controls. A count is not a control.
 *
 * Run: npx tsx tools/verify-created-tracks-are-actionable.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
let surfaces = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
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

const files = walkRoots(root);
checks++;
if (files.length === 0) {
  failures.push("found no components to check — did app/ move?");
}

for (const file of files) {
  // The controls' own definition is not a surface that renders them.
  if (/TrackSalesControls\.tsx$/.test(file)) continue;

  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // Shows the signed-in artist a count of the masters they created.
  if (!/\b(musicCreated|createdMusic)\b/.test(code)) continue;

  surfaces++;
  checks++;
  if (!/<TrackSalesControls\b/.test(code)) {
    failures.push(
      `${relative(root, file)} shows an artist their created-track count but ` +
        "never renders <TrackSalesControls> — they can see the number and " +
        "cannot reprice or unlist the track it counts",
    );
  }
}

checks++;
if (surfaces < 2) {
  failures.push(
    `only ${surfaces} created-track surface(s) detected — this repo has two ` +
      "(/profile and ProfileModal), so the detection above has gone stale and " +
      "this check is not testing what it claims",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${surfaces} created-track surface(s) expose the sales controls — ${checks} checks passed`,
);
