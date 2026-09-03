/**
 * A user-supplied profile picture must be capped without relying on CSS.
 *
 * Ganado's 1024px cover filled a phone screen even though the markup said
 * `w-12 h-12`. The markup was right; Tailwind was emitting no utilities at all,
 * so every sizing class was inert and the image fell back to its natural size.
 * Two fixes aimed at the markup and both were verified in a harness that loaded
 * Tailwind from a CDN — which is exactly why they looked correct and the app
 * did not.
 *
 * Avatars are worse than cover art, because the URI is set on chain by whoever
 * owns the address: an arbitrary image, at arbitrary dimensions, chosen by
 * someone else. So the cap must hold with zero stylesheet, which means HTML
 * `width`/`height` attributes and an inline style, not classes.
 *
 * Enforced as a single chokepoint: ProfileAvatar caps it, and nothing else
 * resolves an avatar URI for rendering.
 *
 * Run: npx tsx tools/verify-avatar-size-is-css-independent.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const AVATAR_COMPONENT = "app/components/oracle/ProfileAvatar.tsx";

// --- the component itself caps size outside CSS -------------------------------
checks++;
let comp = "";
try {
  comp = readFileSync(join(root, AVATAR_COMPONENT), "utf8");
} catch {
  failures.push(`${AVATAR_COMPONENT} is missing — the size cap lives there`);
}

if (comp) {
  const code = comp
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  checks++;
  if (!/\bwidth=\{/.test(code) || !/\bheight=\{/.test(code)) {
    failures.push(
      `${AVATAR_COMPONENT} must set the HTML width and height ATTRIBUTES on ` +
        "the img. Classes alone are not a cap: when Tailwind emitted nothing, " +
        "w-12 h-12 was inert and a 1024px image rendered full width.",
    );
  }

  checks++;
  if (!/maxWidth|maxHeight/.test(code)) {
    failures.push(
      `${AVATAR_COMPONENT} must also carry an inline maxWidth/maxHeight, so a ` +
        "cap survives even if the attributes are overridden by a stylesheet",
    );
  }
}

// --- nothing else renders an avatar URI ---------------------------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

for (const file of walk(join(root, "app"))) {
  const rel = relative(root, file);
  if (rel === AVATAR_COMPONENT) continue;

  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  if (!/resolveAvatarUri/.test(code)) continue;
  checks++;
  failures.push(
    `${rel} calls resolveAvatarUri directly. Avatars render through ` +
      "<ProfileAvatar> only, so the size cap cannot be bypassed by a second " +
      "call site that forgets it.",
  );
}

checks++;
if (comp && !/AVATAR_PX/.test(comp)) {
  failures.push(
    `${AVATAR_COMPONENT} no longer uses the shared AVATAR_PX default — the ` +
      "size would then be per-call-site and drift",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ avatar size holds without CSS — ${checks} checks passed`);
