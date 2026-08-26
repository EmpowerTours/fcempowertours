/**
 * Verifies the global ceiling on platform-funded operations.
 *
 * Run: `node --experimental-strip-types tools/verify-platform-gas-budget.ts`
 *
 * ## What this is defending
 *
 * `/api/register-user-safe` spends platform gas — up to three funded transactions per call. It was
 * already authenticated and rate limited, and neither bounds the spend:
 *
 *   - Authentication proves you own an address. Producing a fresh address and signing with it is
 *     free and unlimited, so it filters nobody with a script.
 *   - The rate limit is keyed on IP plus address, so it bounds one caller. The platform pays for
 *     all callers.
 *
 * A ceiling is the only shape that bounds a spend the platform absorbs.
 *
 * Two rules here are the ones that would fail quietly:
 *
 * 1. **Increment before comparing.** Reading then writing lets two simultaneous requests both see
 *    room for the last slot and both spend it. The window between check and write is exactly where
 *    a script aims.
 * 2. **Fail closed.** Everywhere else in this codebase a degraded Redis falls back to allowing the
 *    request, because the cost of being wrong is a stale read. Here it is money leaving, so a
 *    counter that cannot be read must stop the spend rather than remove the only thing bounding it.
 */

import {
  reservePlatformGas,
  type BudgetConfig,
} from "../lib/platform-gas-budget.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/** An in-memory stand-in for the Redis counter, so this needs no server. */
function fakeRedis() {
  const store = new Map<string, number>();
  let broken = false;
  return {
    store,
    break: () => {
      broken = true;
    },
    incr: async (key: string) => {
      if (broken) throw new Error("redis unavailable");
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    },
    expire: async () => {
      if (broken) throw new Error("redis unavailable");
      return 1;
    },
    get: async (key: string) => {
      if (broken) throw new Error("redis unavailable");
      return store.get(key) ?? 0;
    },
  };
}

const fake = fakeRedis();

const CONFIG: BudgetConfig = {
  name: "test-op",
  maxOperations: 3,
  windowSeconds: 86_400,
};

const T0 = 1_700_000_000_000;

// ---------------------------------------------------------------- the ceiling holds

{
  fake.store.clear();
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await reservePlatformGas(CONFIG, T0, fake));
  }
  check(
    "the first three are allowed",
    results.slice(0, 3).map((r) => r.allowed),
    [true, true, true],
  );
  check(
    "the fourth and fifth are refused",
    results.slice(3).map((r) => r.allowed),
    [false, false],
  );
  check("remaining counts down", results[0].remaining, 2);
  check(
    "remaining floors at zero rather than going negative",
    results[4].remaining,
    0,
  );
}

// ---------------------------------------------------------------- reserve, don't check-then-set

{
  fake.store.clear();
  // Two callers racing for the last slot. Increment-first means exactly one wins.
  await reservePlatformGas(CONFIG, T0, fake);
  await reservePlatformGas(CONFIG, T0, fake);
  const [a, b] = await Promise.all([
    reservePlatformGas(CONFIG, T0, fake),
    reservePlatformGas(CONFIG, T0, fake),
  ]);
  check(
    "two simultaneous requests cannot both take the last slot",
    [a.allowed, b.allowed].filter(Boolean).length,
    1,
  );
}

// ---------------------------------------------------------------- windows

{
  fake.store.clear();
  for (let i = 0; i < 3; i++) await reservePlatformGas(CONFIG, T0, fake);
  const exhausted = await reservePlatformGas(CONFIG, T0, fake);
  check("exhausted inside the window", exhausted.allowed, false);

  const nextDay = T0 + 86_400_000;
  const fresh = await reservePlatformGas(CONFIG, nextDay, fake);
  check("a new window starts fresh", fresh.allowed, true);
  check("...and does not inherit the old count", fresh.remaining, 2);
}

{
  fake.store.clear();
  const r = await reservePlatformGas(CONFIG, T0, fake);
  check(
    "resetIn is within the window length",
    r.resetIn > 0 && r.resetIn <= 86_400,
    true,
  );
}

// ---------------------------------------------------------------- fail closed

{
  fake.store.clear();
  fake.break();
  const r = await reservePlatformGas(CONFIG, T0, fake);
  check("a broken counter refuses rather than allows", r.allowed, false);
  check(
    "...and says the refusal was degraded, not a real ceiling hit",
    r.degraded,
    true,
  );
  check("...and reports nothing remaining", r.remaining, 0);
}

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
