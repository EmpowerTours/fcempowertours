/**
 * Is the indexer close enough to the chain head to be trusted?
 *
 * ## The failure this exists for
 *
 * On 2026-08-13 the hosted indexer stopped at block 95,657,100 and stayed there. It was not
 * down: every query returned HTTP 200 with well-formed, internally consistent rows. The app
 * served an eight-day-old catalogue and nothing reported a problem — the v3 migration looked
 * correct in the UI precisely because the UI was showing a snapshot from before it.
 *
 * So the check cannot be "did the request succeed". It has to be "how far behind is it", which
 * means comparing the indexer's own cursor against the chain head.
 *
 * ## Why this file imports nothing from the project
 *
 * The chain head arrives as a callback rather than a viem client built from `@/app/chains`.
 * That keeps the module free of path aliases, which is what lets it be exercised directly by
 * `tools/verify-catalogue-source.ts` under plain node — a guard that cannot be tested without
 * booting Next.js would not have been tested.
 */

/**
 * How far behind the indexer may fall before it is considered stale.
 *
 * Monad produces a block roughly every 400ms, so 5,000 blocks is about half an hour. A healthy
 * indexer sits seconds behind; half an hour means something has actually stopped. Set
 * `ENVIO_MAX_LAG_BLOCKS` to tune it without a deploy.
 */
export function maxLagBlocks(): bigint {
  return BigInt(process.env.ENVIO_MAX_LAG_BLOCKS || "5000");
}

/** How long a verdict is trusted, so the chain head is not queried on every request. */
function healthTtlMs(): number {
  return Number(process.env.ENVIO_HEALTH_TTL_MS || "60000");
}

export interface EnvioHealth {
  healthy: boolean;
  /** Blocks behind the chain head. `null` when the indexer could not be reached at all. */
  lagBlocks: bigint | null;
  reason: string;
}

let cached: { at: number; health: EnvioHealth } | null = null;

/** Test seam: forget the cached verdict. */
export function resetEnvioHealthCache(): void {
  cached = null;
}

const CHAIN_METADATA_QUERY = `{ chain_metadata { latest_processed_block } }`;

/**
 * Never throws. Any failure — unreachable, malformed, missing cursor — is reported as unhealthy,
 * because the caller's only decision is "indexer or chain", and every one of those cases means
 * the chain.
 */
export async function checkEnvioHealth(opts: {
  endpoint: string | undefined;
  getHead: () => Promise<bigint>;
  now?: number;
}): Promise<EnvioHealth> {
  const now = opts.now ?? Date.now();
  if (cached && now - cached.at < healthTtlMs()) return cached.health;

  const health = await evaluate(opts.endpoint, opts.getHead);
  cached = { at: now, health };
  return health;
}

async function evaluate(
  endpoint: string | undefined,
  getHead: () => Promise<bigint>,
): Promise<EnvioHealth> {
  if (!endpoint) {
    return {
      healthy: false,
      lagBlocks: null,
      reason: "no indexer endpoint configured",
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: CHAIN_METADATA_QUERY }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // 402 is the one that prompted all this; 404 is a deleted deployment.
      return {
        healthy: false,
        lagBlocks: null,
        reason: `indexer returned HTTP ${res.status}`,
      };
    }

    const body: any = await res.json();
    const processed = body?.data?.chain_metadata?.[0]?.latest_processed_block;
    if (processed === undefined || processed === null) {
      return {
        healthy: false,
        lagBlocks: null,
        reason: "indexer reported no cursor",
      };
    }

    const head = await getHead();
    // A cursor ahead of the head is a reorg or a wrong chain id. Clamp at zero rather than
    // reporting a negative lag, which would compare as "very fresh" and pass.
    const lag = head > BigInt(processed) ? head - BigInt(processed) : 0n;
    const limit = maxLagBlocks();

    return lag <= limit
      ? { healthy: true, lagBlocks: lag, reason: `${lag} blocks behind` }
      : {
          healthy: false,
          lagBlocks: lag,
          reason: `indexer is ${lag} blocks behind (limit ${limit})`,
        };
  } catch (e: any) {
    return {
      healthy: false,
      lagBlocks: null,
      reason: `indexer unreachable: ${e?.message ?? "unknown error"}`,
    };
  }
}
