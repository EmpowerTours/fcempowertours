/**
 * Verifies `lib/redact.ts` against the shape that actually leaked.
 *
 * Run: `node --experimental-strip-types tools/verify-redaction.ts`
 *
 * ## What this is defending
 *
 * On 2026-08-23 a live Pimlico API key was written to the Railway logs. The deliberate guard in
 * `lib/pimlico-safe-aa.ts` — logging `new URL(PIMLICO_BUNDLER_URL).host` rather than the URL —
 * worked exactly as written. The key escaped through viem instead: `RpcRequestError` carries
 * `metaMessages: ['URL: <full url>', 'Request body: …']` and folds them into `.message`, and the
 * handler logged `cause` verbatim.
 *
 * So the fixtures below are modelled on the real error tree, nesting and all, not on a tidy
 * example. A redactor that only handles a flat string would pass a prettier test and still leak.
 *
 * No real key appears here. The fixture uses a syntactically identical placeholder.
 */

import { redact, redactString } from "../lib/redact.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

function mustNotContain(name: string, haystack: string, needle: string) {
  checks++;
  if (haystack.includes(needle)) {
    failures.push(
      `${name}\n     still contains the secret: ${needle.slice(0, 12)}…`,
    );
  }
}

function mustContain(name: string, haystack: string, needle: string) {
  checks++;
  if (!haystack.includes(needle)) {
    failures.push(`${name}\n     expected to keep: ${needle}`);
  }
}

// A placeholder with the same shape as a real Pimlico key. Not a live credential.
const FAKE_KEY = "pim_AbCdEfGhIjKlMnOpQrSt";
const BUNDLER = `https://api.pimlico.io/v2/143/rpc?apikey=${FAKE_KEY}`;

process.env.PIMLICO_BUNDLER_URL = BUNDLER;

// ---------------------------------------------------------------- query parameters

{
  const out = redactString(`URL: ${BUNDLER}`);
  mustNotContain("query param scrubbed", out, FAKE_KEY);
  mustContain("host survives", out, "api.pimlico.io");
  mustContain("path survives", out, "/v2/143/rpc");
}

for (const param of [
  "apikey",
  "api_key",
  "api-key",
  "key",
  "token",
  "secret",
  "password",
]) {
  const out = redactString(
    `https://x.example/rpc?${param}=SUPERSECRETVALUE123&chain=143`,
  );
  mustNotContain(`param ${param} scrubbed`, out, "SUPERSECRETVALUE123");
  mustContain(`param ${param} keeps other params`, out, "chain=143");
}

// ---------------------------------------------------------------- vendor prefix, outside a URL

mustNotContain(
  "bare pim_ key scrubbed even with no URL around it",
  redactString(`the key is ${FAKE_KEY} ok`),
  FAKE_KEY,
);

// ---------------------------------------------------------------- the real error tree

/**
 * Modelled on the logged object: an ExecutionRevertedError whose `cause` is an RpcRequestError
 * that carries the URL in BOTH `message` and `metaMessages`, plus a further nested cause.
 */
const rpcError = Object.assign(
  new Error(`RPC Request failed.\n\nURL: ${BUNDLER}\n`),
  {
    name: "RpcRequestError",
    shortMessage: "RPC Request failed.",
    details: "UserOperation reverted during simulation with reason: 0x",
    metaMessages: [
      `URL: ${BUNDLER}`,
      'Request body: {"method":"eth_estimateUserOperationGas"}',
    ],
    cause: {
      message: "UserOperation reverted during simulation with reason: 0x",
      code: -32521,
    },
  },
);

const topError = Object.assign(new Error("Execution reverted with reason: …"), {
  name: "ExecutionRevertedError",
  shortMessage: "Execution reverted.",
  cause: rpcError,
});

{
  const serialized = JSON.stringify(redact(topError));
  mustNotContain("nested cause message scrubbed", serialized, FAKE_KEY);
  mustNotContain("metaMessages scrubbed", serialized, FAKE_KEY);
  mustContain("host still legible for debugging", serialized, "api.pimlico.io");
  mustContain(
    "revert reason preserved",
    serialized,
    "reverted during simulation",
  );
  mustContain("error name preserved", serialized, "RpcRequestError");
}

// The exact call the old code made — `{ cause: err.cause }` — must now be safe.
{
  const serialized = JSON.stringify(
    redact({
      message: topError.message,
      shortMessage: topError.shortMessage,
      cause: topError.cause,
    }),
  );
  mustNotContain(
    "the original leaking log shape is now safe",
    serialized,
    FAKE_KEY,
  );
}

// ---------------------------------------------------------------- env-var value matching

{
  // A secret we never taught it the shape of, reachable only because it is in the environment.
  process.env.NEYNAR_API_KEY = "ZZZ-not-a-recognisable-shape-9999";
  const out = redactString(
    "neynar said ZZZ-not-a-recognisable-shape-9999 today",
  );
  mustNotContain(
    "live env secret scrubbed by value",
    out,
    "ZZZ-not-a-recognisable-shape-9999",
  );
  delete process.env.NEYNAR_API_KEY;
}

// ---------------------------------------------------------------- structural safety

{
  const circular: Record<string, unknown> = { name: "loop" };
  circular.self = circular;
  check("circular reference does not hang", redact(circular), {
    name: "loop",
    self: "[circular]",
  });
}

check("bigint survives as a string", redact({ n: 5n }), { n: "5n" });
check("null passes through", redact(null), null);
check("plain values pass through", redact({ a: 1, b: true, c: "x" }), {
  a: 1,
  b: true,
  c: "x",
});

{
  const deep = redact({
    a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } },
  });
  checks++;
  if (JSON.stringify(deep).includes('"[depth limit]"') === false) {
    failures.push("deep nesting\n     expected a depth limit marker");
  }
}

// ---------------------------------------------------------------- source scan
//
// The fixtures above prove the redactor works. They cannot prove it is *used*. This scan is the
// part that would have caught the original leak: a console.* call that hands a viem error's
// `cause` straight to the logger, where the URL lives.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

for (const dir of ["lib", "app"]) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

    // A console.* call whose argument object includes a bare `cause:` — the exact shape that
    // leaked. `redact({... cause ...})` is fine; the marker is redact( appearing first.
    const re = /console\.(?:error|log|warn|info)\(([\s\S]{0,400}?)\n\s*\}\s*\)/g;
    for (const m of src.matchAll(re)) {
      const body = m[1];
      if (!/\bcause\s*:/.test(body)) continue;
      checks++;
      if (!/\bredact\s*\(/.test(body)) {
        failures.push(
          `${relative(ROOT, file)}\n     logs a raw \`cause\` — wrap the object in redact() ` +
            `(viem puts the bundler URL, apikey and all, inside it)`,
        );
      }
    }
  }
}

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
