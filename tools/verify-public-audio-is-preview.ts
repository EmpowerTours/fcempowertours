/**
 * A public surface must play the PREVIEW, never the full track.
 *
 * Track metadata carries `animation_url` (a ~3s preview) and `external_url`
 * (the whole song). The catalogue collapsed both into one `audioUrl` field that
 * preferred external_url, so every public surface — the discover page, an artist
 * page opened from a cast — streamed the complete record to anyone with the
 * link, licence or not. The licence model was intact on chain and given away in
 * the player.
 *
 * previewUrl and audioUrl are now separate. Public browse surfaces bind
 * previewUrl; the radio keeps audioUrl because subscriber playback is the whole
 * point of it.
 *
 * Run: npx tsx tools/verify-public-audio-is-preview.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Surfaces anyone can reach without a licence.
for (const surface of [
  "app/discover/page.tsx",
  "app/artist/[address]/page.tsx",
]) {
  const src = strip(readFileSync(join(root, surface), "utf8"));
  checks++;
  if (/animation_url:\s*t\.audioUrl/.test(src)) {
    failures.push(
      `${surface} binds the FULL track (audioUrl) as playable audio; a public ` +
        "surface must play previewUrl or it gives the whole song away",
    );
  }
  checks++;
  if (!/animation_url:\s*t\.previewUrl/.test(src)) {
    failures.push(`${surface} does not bind previewUrl as its playable audio`);
  }
}

// The split itself has to survive: one field means everyone gets the full song.
const cat = strip(
  readFileSync(join(root, "lib/catalogue-resolved.ts"), "utf8"),
);
checks++;
if (!/previewUrl:\s*rawPreview/.test(cat)) {
  failures.push(
    "catalogue-resolved no longer exposes previewUrl separately from audioUrl",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ public surfaces play previews — ${checks} checks passed`);
