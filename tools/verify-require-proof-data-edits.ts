/**
 * Data-edit routes must require a real identity proof.
 *
 * Run: `npx tsx tools/verify-require-proof-data-edits.ts`
 *
 * Covers IDENTITY_AUDIT data-edit findings: epk slug save, epk/seed,
 * music/playlist, terms/accept. Depends on requireUserProof /
 * requireFidProof / requireInternalSecret from fix/require-identity-proof.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) failures.push(msg);
}

ok(existsSync(join(root, "lib/require-user-proof.ts")), "require-user-proof missing");
ok(existsSync(join(root, "lib/require-fid-proof.ts")), "require-fid-proof missing");
ok(existsSync(join(root, "lib/internal-secret.ts")), "internal-secret missing");

const fidHelper = strip(read("lib/require-fid-proof.ts"));
ok(/verifyQuickAuth/.test(fidHelper), "requireFidProof must try Quick Auth");
ok(/verifyFarcasterFID/.test(fidHelper), "requireFidProof must link wallet→FID");
ok(/requireUserProof/.test(fidHelper), "requireFidProof must use requireUserProof");
ok(/status:\s*401/.test(fidHelper), "requireFidProof must 401 when unproven");
ok(!/\.allowed\b/.test(fidHelper), "requireFidProof must not read .allowed");

// epk POST/PATCH
const epk = strip(read("app/api/epk/route.ts"));
ok(/requireUserProof\s*\(/.test(epk), "epk route must call requireUserProof");
ok(
  /existingOwner/.test(epk) && /status:\s*409/.test(epk),
  "epk POST must refuse overwriting another wallet's slug (409)",
);
ok(
  (epk.match(/requireUserProof\s*\(/g) || []).length >= 2,
  "epk POST and PATCH must both require proof",
);

// epk/seed — keeper only, fail closed
const seed = strip(read("app/api/epk/seed/route.ts"));
ok(/requireInternalSecret\s*\(/.test(seed), "epk/seed must require internal secret");

// playlist
const playlist = strip(read("app/api/music/playlist/route.ts"));
ok(/requireFidProof\s*\(/.test(playlist), "playlist POST must call requireFidProof");
ok(/proof\.fid/.test(playlist), "playlist must write the proven FID");

// terms
const terms = strip(read("app/api/terms/accept/route.ts"));
ok(/requireUserProof\s*\(/.test(terms), "terms POST must call requireUserProof");
ok(
  !/record:\s*acceptanceRecord/.test(terms),
  "terms POST must not return the full acceptanceRecord (leaks IP)",
);
ok(
  /Strip IP|ip \/ userAgent|compliance-only/i.test(read("app/api/terms/accept/route.ts")) ||
    (/publicRecord/.test(terms) && !/userAgent/.test(terms.split("export async function GET")[1] || "")),
  "terms GET must not expose IP/userAgent",
);
// More precise GET check
const termsGet = terms.split("export async function GET")[1] || "";
ok(!/userAgent/.test(termsGet), "terms GET body must not mention userAgent");
ok(!/\bip\b/.test(termsGet.replace(/acceptedAt/g, "")), "terms GET must not return ip");

// Clients
const epkModal = read("app/components/oracle/EPKModal.tsx");
ok(/authFor\(["']epk-publish["']/.test(epkModal), "EPKModal must auth epk-publish");
ok(/publishAuth/.test(epkModal), "EPKModal must pass auth into publishEPKOnChain");

const playlistClient = read("app/components/oracle/MusicPlaylist.tsx");
ok(/useActionAuth/.test(playlistClient), "MusicPlaylist must use useActionAuth");
ok(/authFor\(["']music-playlist["']/.test(playlistClient), "MusicPlaylist must send music-playlist proof");

const publish = read("lib/epk-publish.ts");
ok(/authHeaders/.test(publish), "epk-publish must forward auth headers on PATCH");

const covered = read("lib/delegation-covered.ts");
for (const ctx of ["epk-publish", "music-playlist", "terms-accept"]) {
  ok(covered.includes(`"${ctx}"`), `delegation-covered missing "${ctx}"`);
}

// ENFORCE_QUICK_AUTH still default off
ok(
  /return process\.env\.ENFORCE_QUICK_AUTH === "true"/.test(
    strip(read("lib/quick-auth.ts")),
  ),
  "ENFORCE_QUICK_AUTH must still default off",
);

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ data-edit identity proofs in place — ${checks} checks passed`,
);
