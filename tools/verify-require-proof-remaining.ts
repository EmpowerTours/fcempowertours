/**
 * Remaining identity-audit gates (PR stacked after #6 and #8).
 *
 * Run: `npx tsx tools/verify-require-proof-remaining.ts`
 *
 * Covers: Safe-mutating execute-delegated ownership gate, deposit-tours proof,
 * live-radio payment receipts + scheduler secret, telegram webhook secret_token,
 * fail-closed schedulers / telegram notify+subscribers. list-for-sale DELETE
 * is already covered by verify-require-user-proof (requireUserProof).
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

function members(src: string, afterMarker: string): Set<string> {
  const code = strip(src);
  const at = code.indexOf(afterMarker);
  if (at < 0) return new Set();
  const open = code.indexOf("[", at);
  const close = code.indexOf("]", open);
  const body = code.slice(open, close);
  return new Set([...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

// --- radio payment receipts ---
ok(
  existsSync(join(root, "lib/radio-payment-receipt.ts")),
  "missing lib/radio-payment-receipt.ts",
);
{
  const receipt = strip(read("lib/radio-payment-receipt.ts"));
  ok(/\.getdel\b/.test(receipt), "radio receipts must be consumed atomically (GETDEL)");
  for (const kind of ["queue", "skip", "shoutout", "ad"]) {
    ok(
      receipt.includes(`"${kind}"`) || receipt.includes(`'${kind}'`),
      `radio receipt kinds must include ${kind}`,
    );
  }
}

// --- execute-delegated: safeMutating + receipts ---
{
  const exec = read("app/api/execute-delegated/route.ts");
  const safe = members(exec, "const safeMutatingActions = new Set(");
  ok(safe.size >= 10, "safeMutatingActions must list Safe-mutating publicActions");
  for (const a of [
    "dao_wrap",
    "dao_unwrap",
    "dao_delegate",
    "dao_vote_proposal",
    "dao_queue_proposal",
    "dao_execute_proposal",
    "dao_create_burn_proposal",
    "wrap_mon",
    "approve_wmon_for_passport",
    "faucet_claim",
    "claim_listener_wmon",
    "beat_match_submit_guess",
    "country_collector_complete",
    "venue_register",
  ]) {
    ok(safe.has(a), `safeMutatingActions missing "${a}"`);
  }
  const code = strip(exec);
  ok(
    /needsOwnership\s*&&\s*!authz\.ownsAddress/.test(code),
    "ownership gate must use needsOwnership && !authz.ownsAddress",
  );
  ok(
    /fundMovingActions\.has\(action\)\s*\?\s*action\s*:\s*undefined/.test(code) ||
      /permission = fundMovingActions\.has\(action\) \? action : undefined/.test(
        code,
      ),
    "safe-mutating path must omit action when proving via delegation session",
  );
  ok(
    /recordRadioPaymentReceipt\([\s\S]{0,80}"queue"/.test(code),
    "execute-delegated must record a queue payment receipt",
  );
  ok(
    /recordRadioPaymentReceipt\([\s\S]{0,80}"skip"/.test(code),
    "execute-delegated must record a skip payment receipt",
  );
  // Skip hop to live-radio must carry the internal secret
  const skipAt = code.indexOf('action: "skip_to_random"');
  ok(skipAt > 0, "execute-delegated must call live-radio skip_to_random");
  if (skipAt > 0) {
    const window = code.slice(Math.max(0, skipAt - 500), skipAt);
    ok(
      /internalSecretHeaders\(\)/.test(window),
      "skip_to_random hop must send internalSecretHeaders()",
    );
  }
}

// --- live-radio gates ---
{
  const radio = strip(read("app/api/live-radio/route.ts"));
  const branch = (action: string) => {
    const start = radio.indexOf(`action === "${action}"`);
    return start >= 0 ? radio.slice(start, start + 4500) : "";
  };

  const queue = branch("queue_song");
  ok(/requireUserProof\(/.test(queue), "queue_song must requireUserProof");
  ok(
    /consumeRadioPaymentReceipt\([\s\S]{0,80}"queue"/.test(queue),
    "queue_song must consume a queue payment receipt",
  );

  const skip = branch("skip_to_random");
  ok(
    /presentedInternalSecret|requireInternalSecret/.test(skip),
    "skip_to_random must accept internal secret",
  );
  ok(
    /consumeRadioPaymentReceipt\([\s\S]{0,80}"skip"/.test(skip),
    "skip_to_random must consume a skip payment receipt on the public path",
  );

  const next = branch("next_song");
  ok(
    /requireInternalSecret\(/.test(next.slice(0, 400)),
    "next_song must requireInternalSecret",
  );

  const ended = branch("song_ended");
  ok(
    /resolveRadioSession\(/.test(ended),
    "song_ended must require a radio session (or internal secret)",
  );
}

// --- deposit-tours ---
{
  const dep = strip(read("app/api/deposit-tours-to-safe/route.ts"));
  ok(/requireUserProof\(/.test(dep), "deposit-tours-to-safe must requireUserProof");
  ok(/proof\.address/.test(dep), "deposit must use the proven address");
}

// --- list-for-sale DELETE already gated (regression) ---
{
  const listing = strip(read("app/api/music/list-for-sale/route.ts"));
  const del = (() => {
    const start = listing.indexOf("export async function DELETE");
    return start >= 0 ? listing.slice(start) : "";
  })();
  ok(/requireUserProof\(/.test(del), "list-for-sale DELETE must requireUserProof");
}

// --- telegram webhook secret_token ---
{
  const wh = strip(read("app/api/telegram-radio/webhook/route.ts"));
  ok(
    /TELEGRAM_WEBHOOK_SECRET/.test(wh),
    "telegram webhook must read TELEGRAM_WEBHOOK_SECRET",
  );
  ok(
    /x-telegram-bot-api-secret-token/.test(wh),
    "telegram webhook must check x-telegram-bot-api-secret-token",
  );
  ok(/timingSafeEqual/.test(wh), "telegram webhook must use timingSafeEqual");
  ok(/status:\s*503/.test(wh), "telegram webhook must fail closed (503) when unset");
  ok(/status:\s*401/.test(wh), "telegram webhook must 401 on mismatch");
}

// --- telegram notify / subscribers fail closed ---
{
  const tg = strip(read("app/api/telegram-radio/route.ts"));
  ok(
    !/KEEPER_SECRET\s*&&\s*secret\s*!==\s*KEEPER_SECRET/.test(tg),
    "telegram-radio must not use fail-open `KEEPER_SECRET && secret !==`",
  );
  ok(
    /!KEEPER_SECRET/.test(tg) && /status:\s*503/.test(tg),
    "telegram-radio must 503 when KEEPER_SECRET is unset",
  );
}

// --- schedulers fail closed ---
for (const rel of [
  "app/api/live-radio/scheduler/route.ts",
  "app/api/venue/scheduler/route.ts",
  "app/api/venue/sync-clearance/route.ts",
]) {
  const src = strip(read(rel));
  ok(
    !/secret\s*!==\s*KEEPER_SECRET\s*&&\s*KEEPER_SECRET/.test(src),
    `${rel} must not use fail-open \`secret !== KEEPER_SECRET && KEEPER_SECRET\``,
  );
  ok(
    /!KEEPER_SECRET/.test(src) && /status:\s*503/.test(src),
    `${rel} must 503 when KEEPER_SECRET is unset`,
  );
}

// --- client: no node:crypto, session reuse for new contexts ---
{
  const covered = read("lib/delegation-covered.ts");
  for (const ctx of [
    "live-radio:queue_song",
    "execute-delegated:dao_wrap",
    "execute-delegated:faucet_claim",
    "execute-delegated:venue_register",
    "deposit-tours-to-safe",
  ]) {
    ok(covered.includes(`"${ctx}"`), `delegation-covered missing "${ctx}"`);
  }
  const modal = read("app/components/oracle/LiveRadioModal.tsx");
  ok(
    /authFor\("live-radio:queue_song"\)/.test(modal),
    "LiveRadioModal queue submit must use authFor(live-radio:queue_song)",
  );
  ok(
    /x-radio-session/.test(modal) && /song_ended/.test(modal),
    "LiveRadioModal song_ended must send x-radio-session",
  );
}

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
