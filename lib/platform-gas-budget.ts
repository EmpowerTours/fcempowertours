/**
 * A global ceiling on operations the platform pays gas for.
 *
 * ## What this bounds that a rate limit does not
 *
 * `checkRateLimit` is keyed on IP plus user address, which bounds what one caller can do. It does
 * not bound what *everyone* can do. Proving ownership of an address costs an attacker a signature
 * — free, and unlimited — so N fresh wallets from N addresses each pass authentication, each pass
 * their own per-caller limit, and each cost the platform up to three funded transactions. The
 * per-caller limit is the wrong shape for a spend the platform absorbs.
 *
 * This is a single counter for the whole platform, per rolling window. It answers "have we spent
 * enough today", which is the question the treasury actually cares about.
 *
 * ## Why now
 *
 * `/api/register-user-safe` was already authenticated and rate limited. It was also, until
 * 2026-08-24, harmless: `PassportNFTV4.platformOperator` was the zero address, so the registration
 * batch reverted during gas estimation and no transaction was ever sent. Setting the operator
 * (9d2e660) fixed the feature and, in the same move, turned a route that spent nothing into one
 * that spends. The cap is the missing half of that fix.
 *
 * ## Fail closed
 *
 * If the counter cannot be read, the operation is refused. Everywhere in this codebase that
 * failing open is the right call, the cost of being wrong is a degraded read. Here the cost is
 * platform funds leaving, so the default flips: a Redis outage stops spending rather than
 * removing the only thing bounding it.
 */

export interface BudgetConfig {
  /** Namespace for the counter. One per spending operation. */
  name: string;
  /** Operations allowed platform-wide per window. */
  maxOperations: number;
  windowSeconds: number;
}

export interface BudgetDecision {
  allowed: boolean;
  /** How many remain in this window. 0 when refused. */
  remaining: number;
  /** Seconds until the window resets. */
  resetIn: number;
  /** Set when the counter could not be read, so the refusal is not a real ceiling hit. */
  degraded?: boolean;
}

/**
 * The counter this budget rides on.
 *
 * Injected rather than imported so the module stays free of the `@/` alias, which does not
 * resolve under `node --experimental-strip-types` — the same constraint that shaped
 * `envio-health.ts`, and the reason a ceiling on platform spending can be tested at all.
 */
export interface BudgetCounter {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/** The live counter. Imported lazily so this module has no load-time dependency on Redis. */
async function defaultCounter(): Promise<BudgetCounter> {
  const { redis } = await import("@/lib/redis");
  return redis as unknown as BudgetCounter;
}

/** Fixed windows, so the key carries its own expiry and cannot drift. */
function windowKey(config: BudgetConfig, now: number): string {
  const bucket = Math.floor(now / (config.windowSeconds * 1000));
  return `platform-gas:${config.name}:${bucket}`;
}

/**
 * Reserve one operation against the budget.
 *
 * Increments first and compares after, so two simultaneous requests cannot both see room for the
 * last slot. That costs an over-count when a caller is refused — deliberate, because the failure
 * it prevents is spending past the ceiling and the failure it causes is refusing slightly early.
 */
export async function reservePlatformGas(
  config: BudgetConfig,
  now: number = Date.now(),
  counter?: BudgetCounter,
): Promise<BudgetDecision> {
  const key = windowKey(config, now);

  try {
    const store = counter ?? (await defaultCounter());
    const used = await store.incr(key);
    if (used === 1) {
      await store.expire(key, config.windowSeconds);
    }

    const elapsed = now % (config.windowSeconds * 1000);
    const resetIn = Math.ceil((config.windowSeconds * 1000 - elapsed) / 1000);

    return {
      allowed: used <= config.maxOperations,
      remaining: Math.max(0, config.maxOperations - used),
      resetIn,
    };
  } catch (error) {
    console.error(`[PlatformGas] ${config.name}: counter unavailable`, error);
    return {
      allowed: false,
      remaining: 0,
      resetIn: config.windowSeconds,
      degraded: true,
    };
  }
}

/**
 * Budgets, one per operation the platform funds.
 *
 * `registerUserSafe` costs up to three transactions each. 100 a day is far above any organic rate
 * for a product with single-digit subscribers, and far below what an attacker would need for the
 * spend to matter. Override with PLATFORM_GAS_MAX_SAFE_REGISTRATIONS_PER_DAY once real signup
 * volume exists.
 */
export const PlatformGasBudgets = {
  registerUserSafe: {
    name: "register-user-safe",
    maxOperations: Number(
      process.env.PLATFORM_GAS_MAX_SAFE_REGISTRATIONS_PER_DAY ?? 100,
    ),
    windowSeconds: 86_400,
  },
} satisfies Record<string, BudgetConfig>;
