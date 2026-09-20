/**
 * Every static image a frame or the manifest points at must exist in public/.
 *
 * Run: `npx tsx tools/verify-frame-assets-exist.ts`
 *
 * ## The bug this encodes
 *
 * `app/api/frames/music/[tokenId]` and `.../art/[tokenId]` built their launch_frame splash as
 * `${APP_URL}/splash.png`. `public/` has `images/splash.png` and no bare `splash.png`, so that
 * URL 404d. The frame still opened — a missing splash is not fatal — with a broken image on the
 * first screen a new listener sees after tapping a mint cast.
 *
 * The manifest and six other references already used `/images/splash.png`. Two did not, and
 * nothing compared them.
 *
 * ## Why this is not caught by anything else
 *
 * It is a string that is correct TypeScript, correct JSON, and wrong only against the contents
 * of a directory. `tsc` cannot see it, lint cannot see it, and the frame returns HTTP 200 while
 * serving a payload that references a 404. It surfaces in somebody else's Warpcast feed, which
 * is the worst place to find out. AGENTS.md names this exact gap: "nothing here renders a page
 * and asserts on it, so display bugs are the class that still escapes."
 *
 * This does not render anything either — it just checks that a referenced file is on disk, which
 * is the cheap half and catches the case that actually shipped.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

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

/**
 * Paths referenced as `${SOMETHING}/foo.png` — an app-relative static asset.
 *
 * Only extensions that must be a real file in public/. Deliberately NOT matching `/api/...`,
 * which is a route and renders its image rather than serving one from disk.
 */
const ASSET_RE =
  /\$\{[A-Za-z_][A-Za-z0-9_]*\}(\/[A-Za-z0-9._\-/]+\.(?:png|jpg|jpeg|gif|svg|webp|mp3|mp4))/g;

const sources: string[] = [];
for (const dir of ["app", "lib", "components"]) {
  const full = join(root, dir);
  if (existsSync(full)) walk(full, sources);
}

for (const file of sources) {
  const code = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const m of code.matchAll(ASSET_RE)) {
    const path = m[1];
    if (path.startsWith("/api/")) continue;
    checks++;
    if (!existsSync(join(publicDir, path))) {
      failures.push(
        `${relative(root, file)} references ${path}, which is not in public/.\n` +
          `     The frame will serve a 200 containing a 404 image — invisible until it is in\n` +
          `     somebody's feed.`,
      );
    }
  }
}

/** The manifest is served from public/ and its URLs must resolve too. */
const manifest = join(publicDir, ".well-known", "farcaster.json");
if (existsSync(manifest)) {
  const raw = readFileSync(manifest, "utf8");
  for (const m of raw.matchAll(
    /"https?:\/\/[^"]*?(\/[A-Za-z0-9._\-/]+\.(?:png|jpg|jpeg|webp))"/g,
  )) {
    checks++;
    if (!existsSync(join(publicDir, m[1]))) {
      failures.push(
        `public/.well-known/farcaster.json references ${m[1]}, which is not in public/`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("✗ a frame points at an asset that does not exist\n");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(`✓ every referenced static asset exists — ${checks} checks passed`);
