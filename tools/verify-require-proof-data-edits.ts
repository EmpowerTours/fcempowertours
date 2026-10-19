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

// epk POST/PATCH — each handler checked on its own
const epk = strip(read("app/api/epk/route.ts"));
const handler = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return "";
  const next = src.indexOf("export async function", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};
const epkPost = handler(epk, "POST");
const epkPatch = handler(epk, "PATCH");
ok(/requireUserProof\s*\(/.test(epkPost), "epk POST must call requireUserProof");
ok(/requireUserProof\s*\(/.test(epkPatch), "epk PATCH must call requireUserProof");
ok(
  /redis\.set\(\s*slugKey[^;]*nx:\s*true/.test(epkPost) && /status:\s*409/.test(epkPost),
  "epk POST must claim the slug atomically (SET NX) and 409 another wallet",
);
ok(
  !/redis\.set\(\s*slugKey,\s*[^;{]*\);/.test(epkPost),
  "epk POST must not overwrite the slug owner unconditionally",
);
ok(
  epkPost.indexOf("nx: true") >= 0 &&
    epkPost.indexOf("nx: true") < epkPost.indexOf("uploadEPKToIPFS("),
  "epk POST must claim the slug before pinning",
);
ok(
  /provenFidFor\(proof,\s*userFid\)/.test(epkPost) &&
    !/farcasterFid:\s*userFid/.test(epkPost) &&
    !/BigInt\(userFid/.test(epkPost),
  "epk POST must publish only a FID bound to the proven wallet",
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
// Runtime: the GET response must not carry ip / userAgent even when the stored
// record has them. Redis is reached over HTTP, so fetch is stubbed.
{
  const stored = {
    address: "0x" + "2".repeat(40),
    timestamp: 1,
    version: "1.0",
    ip: "203.0.113.7",
    userAgent: "TestAgent/1.0",
    acceptedAt: "2026-01-01T00:00:00.000Z",
  };
  const realFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL ??= "https://redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-token";
  globalThis.fetch = (async (input: unknown) => {
    const one = { result: JSON.stringify(stored) };
    const body = /pipeline/.test(String((input as any)?.url ?? input)) ? [one] : one;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const { NextRequest } = await import("next/server");
    // Loaded by path so the tools-only typecheck (no "@/" alias) skips the route's imports.
    const routePath = "../app/api/terms/accept/route";
    const route: { GET: (req: InstanceType<typeof NextRequest>) => Promise<Response> } =
      await import(routePath);
    const res = await route.GET(
      new NextRequest(`https://x.invalid/api/terms/accept?address=${stored.address}`),
    );
    const text = await res.text();
    ok(res.status === 200, `terms GET returned ${res.status}`);
    ok(!text.includes(stored.ip), "terms GET response must not contain the IP");
    ok(!text.includes(stored.userAgent), "terms GET response must not contain the user agent");
    ok(text.includes(stored.acceptedAt), "terms GET response must still report acceptance");
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Clients
const epkModal = read("app/components/oracle/EPKModal.tsx");
ok(/authFor\(["']epk-publish["']/.test(epkModal), "EPKModal must auth epk-publish");
{
  const call = epkModal.slice(epkModal.indexOf("publishEPKOnChain("), epkModal.indexOf("publishEPKOnChain(") + 500);
  ok(
    /\(\)\s*=>\s*authFor\(["']epk-publish["']/.test(call) && !/publishAuth/.test(call),
    "EPKModal must give the PATCH a fresh proof, not the POST's one-time headers",
  );
}

const playlistClient = read("app/components/oracle/MusicPlaylist.tsx");
ok(/useActionAuth/.test(playlistClient), "MusicPlaylist must use useActionAuth");
ok(/authFor\(["']music-playlist["']/.test(playlistClient), "MusicPlaylist must send music-playlist proof");

const publish = read("lib/epk-publish.ts");
{
  const p = strip(publish);
  const receiptAt = p.indexOf("waitForTransactionReceipt");
  const authAt = p.indexOf("await getPatchAuth()");
  ok(authAt > receiptAt && receiptAt >= 0, "epk-publish must fetch PATCH proof after the receipt");
  ok(/\.\.\.patchAuth/.test(p), "epk-publish must send the fresh proof on PATCH");
}

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
