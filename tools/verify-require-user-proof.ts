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
    !/authz\.allowed|auth\.allowed/.test(src) ||
      /ownsAddress/.test(src) ||
      /requireUserProof/.test(src),
    `${label} still appears to gate on .allowed without a hard proof`,
  );
}

// --- routes that must use internal secret ---
const INTERNAL_ROUTES: [string, string][] = [
  ["app/api/frames/cast/route.ts", "frames/cast"],
  ["app/api/sponsorship/set-details/route.ts", "sponsorship/set-details"],
  ["app/api/sponsorship/finalize/route.ts", "sponsorship/finalize"],
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
  /fundMovingActions\.has\(action\)\s*&&\s*!authz\.ownsAddress/.test(exec),
  "execute-delegated fund-moving gate must still check !authz.ownsAddress",
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

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ requireUserProof / internal-secret gates in place — ${checks} checks passed`,
);
