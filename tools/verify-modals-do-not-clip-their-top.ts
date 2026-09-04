/**
 * A scrolling overlay must not also centre its content.
 *
 * `fixed inset-0 flex items-center justify-center overflow-y-auto` looks
 * reasonable and is a trap: when the content is taller than the viewport,
 * centring pushes the overflow EQUALLY above and below, and the part above the
 * top edge can never be reached, because scrollTop cannot go negative.
 *
 * Measured on the create-NFT modal at 430x700: scrolled fully to the top, its
 * step row sat at y = -378px. The "Type / Files / Details / Mint" row was
 * permanently invisible on a phone, and no amount of scrolling brought it back.
 *
 * The working modals in this repo do it the other way: the overlay centres but
 * does not scroll, and the PANEL inside carries `max-h-[..vh] overflow-y-auto`.
 * Then the panel is never taller than the screen and its top is always at the
 * top.
 *
 * Run: npx tsx tools/verify-modals-do-not-clip-their-top.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
let overlays = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

function walkRoots(root: string): string[] {
  const out: string[] = [];
  for (const dir of ["app", "components"]) {
    const full = join(root, dir);
    if (existsSync(full)) walk(full, out);
  }
  return out;
}

for (const file of walkRoots(root)) {
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // Every className string on a full-screen overlay.
  for (const m of code.matchAll(
    /className=\{?[`"']([^`"']*fixed inset-0[^`"']*)[`"']/g,
  )) {
    const cls = m[1];
    overlays++;
    checks++;
    const centres = /\bitems-center\b/.test(cls);
    const scrolls = /\boverflow-y-auto\b|\boverflow-auto\b/.test(cls);
    if (centres && scrolls) {
      const line = code.slice(0, m.index ?? 0).split("\n").length;
      failures.push(
        `${relative(root, file)}:${line} has a fixed overlay that BOTH centres ` +
          "and scrolls. Content taller than the viewport overflows above the " +
          "top edge where scrollTop cannot reach it. Put " +
          "`max-h-[92vh] overflow-y-auto` on the panel instead and let the " +
          "overlay centre without scrolling.",
      );
    }
  }
}

checks++;
if (overlays === 0) {
  failures.push(
    "found no fixed overlays — the detection has gone stale and this check is " +
      "not testing anything",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ no overlay centres and scrolls at once — ${overlays} overlays, ${checks} checks passed`,
);
