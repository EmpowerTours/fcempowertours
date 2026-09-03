/**
 * An internal link must point at a route that exists.
 *
 * /nft was deleted as a duplicate mint UI and its callers were meant to
 * deep-link at /oracle?modal=create-nft instead. Three did not get changed —
 * on the home page, the profile page and tweaks — so the most prominent button
 * on the landing page, "Mint Music", was a 404 for everyone. Nothing failed at
 * build time: Next resolves routes at request time, and a dead <a href> is
 * indistinguishable from a live one until someone clicks it.
 *
 * Checks static internal hrefs against the App Router tree.
 *
 * Run: npx tsx tools/verify-internal-links-resolve.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "app");
const failures: string[] = [];
let checks = 0;
let links = 0;

function walk(dir: string, out: string[] = [], ext = /\.tsx$/): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out, ext);
    else if (ext.test(entry)) out.push(full);
  }
  return out;
}

/** Does `app/<segments>` resolve to a page, allowing one dynamic segment each? */
function routeExists(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  let dirs = [appDir];
  for (const seg of segments) {
    const next: string[] = [];
    for (const d of dirs) {
      const literal = join(d, seg);
      if (existsSync(literal) && statSync(literal).isDirectory()) {
        next.push(literal);
        continue;
      }
      // A dynamic or catch-all segment matches anything.
      let entries: string[] = [];
      try {
        entries = readdirSync(d);
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!/^\[.+\]$/.test(e)) continue;
        const cand = join(d, e);
        if (statSync(cand).isDirectory()) next.push(cand);
      }
    }
    if (next.length === 0) return false;
    dirs = next;
  }
  return dirs.some(
    (d) => existsSync(join(d, "page.tsx")) || existsSync(join(d, "page.ts")),
  );
}

const files = walk(appDir);
checks++;
if (files.length === 0) {
  failures.push("found no components to check — did app/ move?");
}

// href="/something" — static internal links only. Template literals and
// variables are out of scope: this catches the hardcoded ones, which is the
// class that broke.
const HREF = /href=["'](\/[^"'{}\s?#]*)(?:[?#][^"']*)?["']/g;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const m of code.matchAll(HREF)) {
    const pathname = m[1];
    // Not App Router pages: API handlers, and files served from public/.
    if (pathname.startsWith("/api/")) continue;
    if (/\.[a-z0-9]{2,4}$/i.test(pathname)) continue;
    if (pathname === "/") continue;

    links++;
    checks++;
    if (!routeExists(pathname)) {
      failures.push(
        `${relative(root, file)} links to "${pathname}", which has no page in ` +
          "the App Router tree — this is a 404 and nothing catches it at build time",
      );
    }
  }
}

checks++;
if (links === 0) {
  failures.push(
    "found no internal links at all — the detection above has gone stale, so " +
      "this check is passing without testing anything",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${links} internal link(s) resolve — ${checks} checks passed`,
);
