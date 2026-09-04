/**
 * A cast must not be silently skipped for someone without a Farcaster account.
 *
 * Most people using this app have no fid -- registering a name on
 * ProfileRegistry is how they become nameable at all. /api/cast-nft opened with
 * `if (!fid) return { message: 'No FID provided' }`, so every skip, voice note
 * and recorded play by a wallet-only user vanished: no error, a 200, and
 * nothing posted. The mint casts already handled this correctly by resolving a
 * name from the address; this route was simply never updated.
 *
 * `castArtistLabel` is the shared resolution -- Farcaster handle, else
 * registered artist name, else a short address -- and it needs an address, not
 * an fid.
 *
 * Run: npx tsx tools/verify-casts-name-wallet-only-users.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const ROUTE = "app/api/cast-nft/route.ts";
const src = readFileSync(join(root, ROUTE), "utf8");
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

// 1. No blanket "no fid, no cast".
checks++;
if (/if\s*\(\s*!\s*fid\s*\)\s*\{[^}]*return/.test(code)) {
  failures.push(
    `${ROUTE} still returns early when there is no fid, so nothing is posted ` +
      "for a wallet-only user — a silent 200 that looks like success",
  );
}

// 2. It must be able to name someone from an address.
checks++;
if (!/castArtistLabel/.test(code)) {
  failures.push(
    `${ROUTE} never calls castArtistLabel, so it cannot name a user who has ` +
      "no Farcaster handle",
  );
}

// 3. Every display name goes through the shared resolver, not fid alone.
const fidOnly = [
  ...code.matchAll(/let\s+(\w*[Dd]isplay\w*)\s*=\s*["'][^"']*["'];/g),
];
for (const m of fidOnly) {
  checks++;
  failures.push(
    `${ROUTE} builds "${m[1]}" with a mutable fid-only lookup. Use the shared ` +
      "displayFor() so a wallet-only user gets their registered name rather " +
      'than "Someone".',
  );
}

// 4. NO caller may re-impose the gate, and every caller must send an address.
//
// Checking two known files was not enough: /api/live-radio held a THIRD gate
// (`if (userFid)`) on the voice-note cast, which is why shoutouts never posted
// while skips and queues did. This walks every route instead of naming files.
function walkApiRoutes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkApiRoutes(full, out);
    else if (/^route\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

for (const file of walkApiRoutes(join(root, "app/api"))) {
  const rel = relative(root, file);
  if (rel === ROUTE) continue; // the cast route itself, checked above
  const caller = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (!/\/api\/cast-nft/.test(caller)) continue;

  checks++;
  if (
    /if\s*\(\s*(fid|userFid)\s*\)\s*\{[\s\S]{0,140}?\/api\/cast-nft/.test(
      caller,
    )
  ) {
    failures.push(
      `${rel} gates a cast-nft call on an fid, re-creating the exclusion at ` +
        "the call site",
    );
  }

  checks++;
  if (!/_?userAddress/.test(caller)) {
    failures.push(
      `${rel} posts to cast-nft without sending an address, so a user with no ` +
        'fid is cast as "Someone"',
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ casts name wallet-only users — ${checks} checks passed`);
