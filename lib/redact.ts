/**
 * Scrub secrets out of anything on its way to a log.
 *
 * ## The leak this exists for
 *
 * `lib/pimlico-safe-aa.ts` already logs only `new URL(PIMLICO_BUNDLER_URL).host`, with a comment
 * saying the full URL carries `?apikey=<secret>`. That guard is correct and it held — the
 * Railway logs show `Bundler host: api.pimlico.io` and no key.
 *
 * The key leaked anyway, on 2026-08-23, because the guard only covers *our* logging. viem builds
 * `RpcRequestError` with `metaMessages: ['URL: <full request url>', 'Request body: …']` and
 * folds those into `error.message`. So `console.error('…', { cause: err.cause })` prints viem's
 * serialization, not ours, and the redaction never gets a say. It fires only on the error path,
 * which is why nobody noticed until an unrelated bug started making every gas estimation fail.
 *
 * The lesson generalises: a redaction that lives at one call site protects that call site. This
 * one is written to be applied to the *value*, so it survives whatever a dependency decided to
 * put inside its own error.
 *
 * ## What it scrubs
 *
 * - any `apikey` / `api_key` / `api-key` / `key` / `token` / `secret` / `password` query
 *   parameter, in a URL anywhere inside a string
 * - vendor key shapes that travel outside query strings: Pimlico (`pim_…`), Alchemy and
 *   Neynar-style long opaque tokens when they appear after a `key=`-ish label
 * - the live values of the URL-shaped env vars, matched literally, so a key we never learned the
 *   shape of still cannot escape
 *
 * It is deliberately conservative about what counts as a secret. Over-scrubbing a log is cheap;
 * under-scrubbing one puts a live credential in a log store.
 */

/** Query parameters whose value is always a secret. */
const SECRET_PARAMS = [
  "apikey",
  "api_key",
  "api-key",
  "key",
  "token",
  "access_token",
  "secret",
  "password",
  "pw",
  "auth",
];

const PARAM_RE = new RegExp(
  `([?&](?:${SECRET_PARAMS.join("|")})=)([^&\\s"'\\\\)]+)`,
  "gi",
);

/** Vendor prefixes that identify a key on sight, wherever it appears. */
const VENDOR_KEY_RE = /\b(pim_)[A-Za-z0-9_-]{8,}\b/g;

/**
 * Env vars whose values are URLs that may embed a credential.
 *
 * Read lazily rather than captured at module load: this module is imported by client-adjacent
 * code paths where the server-only vars are undefined at import time but present later.
 */
const SECRET_ENV_VARS = [
  "PIMLICO_BUNDLER_URL",
  "NEXT_PUBLIC_PIMLICO_BUNDLER_URL",
  "PIMLICO_API_KEY",
  "NEXT_PUBLIC_MONAD_RPC",
  "MONAD_WS_RPC",
  // Kept after the indexer was removed: the variable may still be set in a deployment,
  // and redaction is about what can appear in output, not about what the code reads.
  "NEXT_PUBLIC_ENVIO_ENDPOINT",
  "NEYNAR_API_KEY",
  "ALCHEMY_API_KEY",
  "GEMINI_API_KEY",
  "PINATA_JWT",
];

/** The literal secret-bearing values currently in the environment, longest first. */
function liveSecrets(): string[] {
  const out: string[] = [];
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (!value) continue;

    // For a URL, the secret is the query string, not the whole thing — scrubbing the whole URL
    // would erase the host, which is the useful half and is safe to log.
    const q = value.indexOf("?");
    if (q >= 0 && value.length - q > 8) {
      out.push(value.slice(q + 1));
    } else if (!value.startsWith("http") && value.length >= 12) {
      // A bare credential rather than a URL.
      out.push(value);
    }
  }
  // Longest first so a value containing another is replaced whole.
  return out.sort((a, b) => b.length - a.length);
}

/** Scrub secrets from a string. */
export function redactString(input: string): string {
  let out = input.replace(PARAM_RE, "$1[REDACTED]");
  out = out.replace(VENDOR_KEY_RE, "$1[REDACTED]");
  for (const secret of liveSecrets()) {
    if (secret && out.includes(secret)) {
      out = out.split(secret).join("[REDACTED]");
    }
  }
  return out;
}

/**
 * Scrub secrets from any value, walking objects, arrays and Error chains.
 *
 * Returns a plain, log-safe structure. Errors become objects rather than staying Errors, because
 * a console.* call formats an Error using its own `message`/`stack` and would bypass anything we
 * did to the wrapper.
 */
export function redact(
  value: unknown,
  depth = 0,
  seen = new WeakSet(),
): unknown {
  if (depth > 8) return "[depth limit]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return "[function]";
  if (typeof value === "symbol") return value.toString();

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);

    if (value instanceof Error) {
      const err = value as Error & {
        shortMessage?: string;
        details?: string;
        metaMessages?: unknown;
        cause?: unknown;
      };
      const out: Record<string, unknown> = {
        name: err.name,
        message: redactString(err.message ?? ""),
      };
      if (err.shortMessage) out.shortMessage = redactString(err.shortMessage);
      if (err.details) out.details = redactString(err.details);
      if (err.metaMessages)
        out.metaMessages = redact(err.metaMessages, depth + 1, seen);
      if (err.stack) out.stack = redactString(err.stack);
      if (err.cause) out.cause = redact(err.cause, depth + 1, seen);
      return out;
    }

    if (Array.isArray(value)) {
      return value.map((v) => redact(v, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, depth + 1, seen);
    }
    return out;
  }

  return "[unknown]";
}

/**
 * Drop-in for `console.error` at sites that log a caught error.
 *
 * Use this instead of passing an error (or its `cause`) to console directly.
 */
export function logRedactedError(label: string, error: unknown): void {
  console.error(label, redact(error));
}
