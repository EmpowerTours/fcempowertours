/**
 * A Farcaster frame image must be raster, and 1.91:1.
 *
 * The passport frame pointed at /api/passport/image/<id>, which serves
 * image/svg+xml at 400x600. Frame clients render raster only, so every passport
 * cast embedded a black rectangle — while the music frame, already pointing at
 * an ImageResponse PNG, looked correct. The image was never broken; the format
 * was, and nothing failed loudly enough to notice.
 *
 * /api/og/* are the ImageResponse routes: they return PNG at 1200x630. Any frame
 * sourcing its image elsewhere has to justify itself here rather than silently
 * shipping a black embed.
 *
 * Run: npx tsx tools/verify-frame-images-are-raster.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/^route\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const frameRoutes = walk(join(root, "app/api/frames"));
checks++;
if (frameRoutes.length === 0) {
  failures.push("found no frame routes to check — did the path move?");
}

for (const file of frameRoutes) {
  const src = readFileSync(file, "utf8");
  // Comments describe the rule; only code assigning an image URL is evidence.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const assigns = [
    ...code.matchAll(/\b(?:og)?[iI]mageUrl\s*=\s*`([^`]*)`/g),
  ].map((m) => m[1]);
  if (assigns.length === 0) continue;

  for (const url of assigns) {
    if (!url.includes("/api/")) continue; // a passthrough of someone else's URL
    checks++;
    if (!url.includes("/api/og/")) {
      failures.push(
        `${relative(root, file)} sources its frame image from "${url}" rather ` +
          "than an /api/og/* ImageResponse route — if that endpoint serves SVG " +
          "the embed renders black in every cast",
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
  `✓ frame images come from raster og routes — ${checks} checks passed`,
);
