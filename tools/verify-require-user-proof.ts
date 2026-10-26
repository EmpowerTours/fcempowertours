/**
 * Patched identity routes must fail closed without a real proof.
 *
 * Run: `npx tsx tools/verify-require-user-proof.ts`
 *
 * Defends the Identity Audit P0/P1 findings: routes that act for a user must
 * call requireUserProof (or an equivalent ownsAddress / internal-secret gate)
 * and must NOT gate on authorizeUserAddress().allowed, which is always true
 * while ENFORCE_QUICK_AUTH is off.
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

// --- helper exists and is fail-closed ---
ok(existsSync(join(root, "lib/require-user-proof.ts")), "missing lib/require-user-proof.ts");
ok(existsSync(join(root, "lib/internal-secret.ts")), "missing lib/internal-secret.ts");

const helper = strip(read("lib/require-user-proof.ts"));
ok(/authorizeUserAddress/.test(helper), "requireUserProof must use authorizeUserAddress");
ok(/delegationProvesOwnership/.test(helper), "requireUserProof must accept a delegation+session");
ok(/ownsAddress/.test(helper), "requireUserProof must gate on ownsAddress, not allowed");
ok(!/\.allowed\b/.test(helper), "requireUserProof must NEVER read authz.allowed");
ok(/status:\s*401/.test(helper), "requireUserProof must 401 when unproven");
ok(/DELEGATION_SESSION_HEADER/.test(helper), "requireUserProof must read x-delegation-session");

const internal = strip(read("lib/internal-secret.ts"));
ok(/timingSafeEqual/.test(internal), "internal-secret must use timingSafeEqual");
ok(/KEEPER_SECRET/.test(internal), "internal-secret must read KEEPER_SECRET");
ok(/status:\s*503/.test(internal), "internal-secret must fail closed (503) when unset");
ok(/status:\s*401/.test(internal), "internal-secret must 401 on mismatch");

// ENFORCE_QUICK_AUTH default must stay off — do not flip the helper's meaning
const quick = strip(read("lib/quick-auth.ts"));
ok(
  /return process\.env\.ENFORCE_QUICK_AUTH === "true"/.test(quick),
  "isQuickAuthEnforced must still default off (=== \"true\")",
);

// --- routes that must call requireUserProof ---
const USER_PROOF_ROUTES: [string, string][] = [
  ["app/api/epk/booking/route.ts", "epk/booking"],
  ["app/api/epk/booking/[bookingId]/route.ts", "epk/booking/[id]"],
  ["app/api/epk/generate/route.ts", "epk/generate"],
  ["app/api/mint-passport/route.ts", "mint-passport"],
  ["app/api/monad-sync/mint-mirror/route.ts", "mint-mirror"],
  ["app/api/oracle/chat/route.ts", "oracle/chat"],
  ["app/api/sponsorship/checkin/route.ts", "sponsorship/checkin"],
  ["app/api/cast-nft/route.ts", "cast-nft"],
  ["app/api/music/list-for-sale/route.ts", "list-for-sale"],
  ["app/api/rights/backfill-isrc/route.ts", "rights/backfill-isrc"],
];

for (const [rel, label] of USER_PROOF_ROUTES) {
  const src = strip(read(rel));
  ok(
    /requireUserProof\s*\(/.test(src),
    `${label} does not call requireUserProof`,
  );
  ok(
    !/\b(authz|auth)\.allowed\b/.test(src),
    `${label} still gates on .allowed (always true while ENFORCE_QUICK_AUTH is off)`,
  );
}

// --- routes that must use internal secret ---
const INTERNAL_ROUTES: [string, string][] = [
  ["app/api/frames/cast/route.ts", "frames/cast"],
  ["app/api/sponsorship/set-details/route.ts", "sponsorship/set-details"],
  ["app/api/live-radio/route.ts", "live-radio start/stop"],
  ["app/api/execute-delegated/route.ts", "execute-delegated radio admin"],
];

for (const [rel, label] of INTERNAL_ROUTES) {
  const src = strip(read(rel));
  ok(
    /requireInternalSecret\s*\(/.test(src),
    `${label} does not call requireInternalSecret`,
  );
}

// --- internal secret: one secret, no cron fallback, one sender helper ---
ok(!/CRON_SECRET/.test(internal), "internal-secret must not accept CRON_SECRET");
ok(
  /export function internalSecretHeaders/.test(internal),
  "internal-secret must export internalSecretHeaders for senders",
);
for (const rel of [
  "app/api/execute-delegated/route.ts",
  "app/api/live-radio/route.ts",
  "app/api/record-play/route.ts",
]) {
  const src = strip(read(rel));
  ok(
    !/["']x-internal-secret["']\s*:\s*process\.env/.test(src),
    `${rel} must send the internal secret via internalSecretHeaders()`,
  );
  ok(/internalSecretHeaders\(\)/.test(src), `${rel} must use internalSecretHeaders()`);
}
{
  const execSrc = strip(read("app/api/execute-delegated/route.ts"));
  const casts = execSrc.split("/api/cast-nft").slice(1);
  ok(casts.length >= 2, "execute-delegated should cast for queue and skip");
  for (const [i, tail] of casts.entries()) {
    ok(
      /internalSecretHeaders\(\)/.test(tail.slice(0, 300)),
      `execute-delegated cast-nft call #${i + 1} lacks the internal secret header`,
    );
  }
}

// --- cast-nft: internal branch by its own header only; FID from the proof ---
{
  const cast = strip(read("app/api/cast-nft/route.ts"));
  ok(
    !/presentedInternalSecret/.test(cast),
    "cast-nft must not pick the internal branch from a bearer token",
  );
  ok(
    /req\.headers\.get\(INTERNAL_SECRET_HEADER\)/.test(cast),
    "cast-nft must choose the internal branch from x-internal-secret only",
  );
  ok(
    /fid\s*=\s*await provenFidFor\(proof,/.test(cast),
    "cast-nft must attribute user-proof casts to a proven FID",
  );
}

// --- FID claims must be bound to the proven wallet ---
ok(/export async function provenFidFor/.test(helper), "missing provenFidFor helper");
ok(/fidOwnsAddress/.test(helper), "provenFidFor must check the FID owns the address");
ok(
  /provenFidFor\(proof,\s*claimedFid\)/.test(strip(read("app/api/mint-passport/route.ts"))),
  "mint-passport must mint only a FID bound to the proven wallet",
);

// --- live-radio voice notes/ads: proven + paid before an internal cast ---
{
  const radio = strip(read("app/api/live-radio/route.ts"));
  for (const action of ["voice_note", "voice_ad"]) {
    const start = radio.indexOf(`action === "${action}"`);
    const branch = start >= 0 ? radio.slice(start, start + 6000) : "";
    const castAt = branch.indexOf("/api/cast-nft");
    const before = castAt >= 0 ? branch.slice(0, castAt) : "";
    ok(/requireUserProof\(/.test(before), `${action} must prove the user before casting`);
    ok(
      /consumeVoiceNoteReceipt\(/.test(before),
      `${action} must consume a payment receipt before casting`,
    );
  }
  ok(
    /recordVoiceNoteReceipt\(/.test(strip(read("app/api/execute-delegated/route.ts"))),
    "execute-delegated must record a voice note payment receipt",
  );
  const receiptRel = existsSync(join(root, "lib/radio-payment-receipt.ts"))
    ? "lib/radio-payment-receipt.ts"
    : "lib/voice-note-receipt.ts";
  const receipt = strip(read(receiptRel));
  ok(/\.getdel\b/.test(receipt), "voice note receipts must be consumed atomically (GETDEL)");
}

// --- Oracle hops forward a proof the downstream route accepts ---
{
  const oracle = strip(read("app/api/oracle/chat/route.ts"));
  ok(
    /async function downstreamProofHeaders[\s\S]{0,600}DELEGATION_SESSION_HEADER[\s\S]{0,200}issueOwnershipAttestation/.test(
      oracle,
    ),
    "oracle must build downstream proof (session + attestation)",
  );
  ok(
    /mintProofHeaders\s*=\s*await downstreamProofHeaders/.test(oracle),
    "oracle passport mint must forward downstream proof",
  );
  ok(
    /sponsorship\/checkin`,\s*\{[\s\S]{0,120}\.\.\.proofHeaders/.test(oracle),
    "oracle check-in must forward downstream proof",
  );
}

// --- sponsorship/finalize: public after deadline, guarded against gas abuse ---
{
  const fin = strip(read("app/api/sponsorship/finalize/route.ts"));
  ok(!/requireInternalSecret/.test(fin), "finalize must stay callable by anyone after the deadline");
  ok(/now <= sponsorship\.votingDeadline/.test(fin), "finalize must refuse before the deadline");
  ok(/nx:\s*true/.test(fin), "finalize must hold a per-sponsorship lock before sending");
}

// --- client: expired sessions must fall back to a signature ---
{
  const sessClient = strip(read("lib/delegation-session-client.ts"));
  ok(/exp\b/.test(sessClient), "delegation session client must store the expiry");
  ok(
    /forceSignature/.test(read("app/hooks/useActionAuth.ts")),
    "useActionAuth must offer forceSignature for a retry after 401",
  );
}

// execute-delegated: radio_start / radio_mark_played in adminAuthActions + secret check
const exec = strip(read("app/api/execute-delegated/route.ts"));
ok(
  /adminAuthActions\s*=\s*\[[^\]]*radio_start/.test(exec) ||
    /"radio_start"/.test(exec.split("adminAuthActions")[1]?.slice(0, 400) || ""),
  "radio_start must be in adminAuthActions (skip user-address authz)",
);
ok(
  /action === "radio_start"[\s\S]{0,120}requireInternalSecret/.test(exec),
  "radio_start must require internal secret",
);
ok(
  /action === "radio_mark_played"[\s\S]{0,80}requireInternalSecret|radio_start" \|\| action === "radio_mark_played"/.test(
    exec,
  ),
  "radio_mark_played must require internal secret",
);

// Fund-moving gate must still ignore ENFORCE_QUICK_AUTH (no regression of PR #4)
ok(
  /needsOwnership\s*&&\s*!authz\.ownsAddress/.test(exec) ||
    /fundMovingActions\.has\(action\)\s*&&\s*!authz\.ownsAddress/.test(exec),
  "execute-delegated ownership gate must still check !authz.ownsAddress",
);
ok(
  /safeMutatingActions/.test(exec) &&
    /fundMovingActions\.has\(action\)\s*\|\|\s*safeMutatingActions\.has\(action\)/.test(exec),
  "execute-delegated must ownership-gate Safe-mutating publicActions via safeMutatingActions",
);
ok(
  /delegationProvesOwnership\([^)]*sessionSecret/.test(exec),
  "execute-delegated must still pass session secret to delegationProvesOwnership",
);

// bot-command must not gate on allowed alone
const bot = strip(read("app/api/bot-command/route.ts"));
ok(
  /!authz\.ownsAddress\s*&&\s*!provenByDelegation/.test(bot),
  "bot-command must reject when neither ownsAddress nor delegation proves identity",
);
ok(
  !/if\s*\(\s*!authz\.allowed\s*\)/.test(bot),
  "bot-command must not 401 solely on !authz.allowed",
);

// Client must not import server modules that pull node:crypto
const clientHook = read("app/hooks/useActionAuth.ts");
ok(
  !/from\s+["']@\/lib\/(require-user-proof|internal-secret|wallet-auth|delegation-session|ownership-attestation|auth)["']/.test(
    clientHook,
  ),
  "useActionAuth must not import server auth modules (node:crypto risk)",
);
ok(
  /delegationCovers|readDelegationSession/.test(clientHook),
  "useActionAuth must prefer an existing delegation session to avoid per-action prompts",
);
ok(
  /from\s+["']@\/lib\/delegation-session-client["']/.test(clientHook) ||
    /from\s+["']@\/lib\/delegation-session-header["']/.test(clientHook),
  "useActionAuth must use the client-safe session module",
);

// Contexts covered for session reuse
const covered = read("lib/delegation-covered.ts");
for (const ctx of [
  "epk-booking",
  "epk-generate",
  "mint-passport",
  "mint-mirror",
  "oracle-chat",
  "sponsorship-checkin",
  "list-for-sale",
  "cast-nft",
]) {
  ok(
    covered.includes(`"${ctx}"`),
    `delegation-covered missing identity context "${ctx}"`,
  );
}

// --- runtime: session expiry and secret selection actually behave ---
{
  const store = new Map<string, string>();
  (globalThis as any).window = {};
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const c = await import("../lib/delegation-session-client");
  const a = "0x" + "1".repeat(40);
  const sec = "a".repeat(64);
  c.storeDelegationSession(a, sec, new Date(Date.now() + 3600_000).toISOString());
  ok(c.readDelegationSession(a) === sec, "live session must be reused");
  c.storeDelegationSession(a, sec, Date.now() - 1000);
  ok(c.readDelegationSession(a) === null, "expired session must not be reused");
  store.set(`et-delegation-session:${a}`, sec);
  ok(c.readDelegationSession(a) === null, "legacy session without expiry must not be reused");
  delete (globalThis as any).window;

  const saved = {
    k: process.env.KEEPER_SECRET,
    i: process.env.INTERNAL_API_SECRET,
    c: process.env.CRON_SECRET,
  };
  const s = await import("../lib/internal-secret");
  delete process.env.KEEPER_SECRET;
  delete process.env.INTERNAL_API_SECRET;
  process.env.CRON_SECRET = "test-cron-value";
  ok(
    Object.keys(s.internalSecretHeaders()).length === 0,
    "CRON_SECRET alone must not configure the internal secret",
  );
  process.env.INTERNAL_API_SECRET = "test-internal-value";
  ok(
    s.internalSecretHeaders()[s.INTERNAL_SECRET_HEADER] === "test-internal-value",
    "senders must use the same secret the validator accepts",
  );
  for (const [k, v] of [
    ["KEEPER_SECRET", saved.k],
    ["INTERNAL_API_SECRET", saved.i],
    ["CRON_SECRET", saved.c],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ requireUserProof / internal-secret gates in place — ${checks} checks passed`,
);
