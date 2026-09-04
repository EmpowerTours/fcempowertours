/**
 * Avatar uploads must go through the authenticated, rate-limited endpoint.
 *
 * Every upload pins a new file to our Pinata account and nothing unpins the old
 * one, so an unlimited avatar is an unbounded bill. The limit is one change per
 * 30 days per address.
 *
 * Two ways that limit becomes decoration, both easy to reintroduce:
 *
 *  1. Uploading via an open endpoint. /api/upload-pinata was exactly that --
 *     no auth, no limit, pinning to the platform's paid account -- and has
 *     been deleted. This still guards against a replacement appearing.
 *  2. Trusting an address the caller merely asserted. A per-address counter on
 *     an unauthenticated route resets by sending a different address.
 *
 * Note what this limit does NOT do: `ProfileRegistry.setProfile` has no
 * cooldown and is ungated, so anyone can set avatarURI straight from their
 * wallet as often as they like. The limit binds the pinning, which is where the
 * cost is -- not the profile, which is not ours to restrict.
 *
 * Run: npx tsx tools/verify-avatar-upload-is-limited.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const ROUTE = "app/api/profile/avatar/route.ts";

// --- the endpoint enforces what it claims ------------------------------------
checks++;
let route = "";
if (!existsSync(join(root, ROUTE))) {
  failures.push(`${ROUTE} is missing — the rate limit lives there`);
} else {
  route = readFileSync(join(root, ROUTE), "utf8");
}

if (route) {
  const code = route
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  checks++;
  if (!/verifyWalletAuth\s*\(/.test(code)) {
    failures.push(
      `${ROUTE} does not call verifyWalletAuth — a per-address limit on an ` +
        "unauthenticated route resets by sending a different address",
    );
  }

  checks++;
  if (!/nx:\s*true/.test(code)) {
    failures.push(
      `${ROUTE} must reserve the slot with an NX set before pinning. Pinning ` +
        "first and recording after lets two concurrent requests both pin, and " +
        "a pin cannot be undone.",
    );
  }

  checks++;
  if (!/\bex:\s*COOLDOWN_SECONDS\b/.test(code)) {
    failures.push(
      `${ROUTE} must give the cooldown key a TTL of COOLDOWN_SECONDS, so the ` +
        "key's own expiry IS the limit and cannot disagree with a stored time",
    );
  }

  checks++;
  if (!/30\s*\*\s*24\s*\*\s*60\s*\*\s*60/.test(code)) {
    failures.push(
      `${ROUTE} no longer expresses a 30-day cooldown — the agreed limit is ` +
        "one profile picture change per month",
    );
  }
}

// --- nothing uploads an avatar through the open endpoint ----------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
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

for (const file of walkRoots(root)) {
  const rel = relative(root, file);
  if (rel.startsWith("app/api/")) continue; // server routes, not upload callers

  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // Does this file deal with avatars at all?
  if (!/avatarURI|avatarUri|uploadAvatar|ProfileAvatar/.test(code)) continue;
  checks++;
  if (/["'`]\/api\/upload-pinata["'`]/.test(code)) {
    failures.push(
      `${rel} handles avatars and posts to /api/upload-pinata, which is open ` +
        `and unmetered. Avatar uploads go through /api/profile/avatar.`,
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ avatar uploads are authenticated and limited — ${checks} checks passed`,
);
