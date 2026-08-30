/**
 * Verifies the two decisions that were reported broken on the unify34 profile.
 *
 * Run: `node --experimental-strip-types tools/verify-wallet-and-migration.ts`
 *
 * ## Why these are behaviour checks and not source scans
 *
 * Both bugs already had source-scan checks written for them, and both scans were blind. They
 * tested that a token appeared in the file — `sameFid`, `getEthereumProvider` — which stays true
 * when the logic around it is gutted. `const sameFid = false;` still contains "sameFid".
 *
 * A check that cannot fail is worse than no check, because the gate goes green and somebody
 * believes it. So the logic moved into `lib/` where it can be called with real inputs, and these
 * assert what it DOES.
 *
 * ## 1. "Move your catalogue" offered work that was already done
 *
 * The card asked whether a v3 master with this tokenURI is owned by the connected wallet. The v3
 * re-publish ran from the deployer key, so `artist` is the deployer and the wallet is the artist.
 * Nothing matched, all five tracks read as pending, and accepting would have minted a second copy
 * of every track.
 *
 * ## 2. Every client-signed transaction failed
 *
 * `sendTransaction` looked for `sdk.ethereum`, which @farcaster/miniapp-sdk does not define — the
 * wallet is `sdk.wallet.getEthereumProvider()` / `sdk.wallet.ethProvider` (0.2.1,
 * dist/types.d.ts:68). Reported as "no transaction sending method available" when migrating, but
 * it was every transaction the user signs. Gasless paths go through /api/execute-delegated, which
 * is why it stayed hidden.
 */

import { migratedAs } from "../lib/migration-status.ts";
import { resolveWalletProvider } from "../lib/wallet-provider.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const j = (v: unknown) =>
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
  if (j(actual) !== j(expected))
    failures.push(
      `${name}\n     expected ${j(expected)}\n     actual   ${j(actual)}`,
    );
}

const WALLET = "0x33fFCcb1802e13a7eead232BCd4706a2269582b0";
const DEPLOYER = "0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1";
const FID = 765994n;

// ------------------------------------------------------- already migrated, under another key

check(
  "the live case: minted by the deployer, same fid — already migrated",
  migratedAs({ id: 3, artist: DEPLOYER, fid: FID }, { fid: FID }, WALLET),
  3,
);
check(
  "minted by the wallet itself is also migrated",
  migratedAs({ id: 3, artist: WALLET, fid: 0n }, { fid: FID }, WALLET),
  3,
);
check(
  "address comparison ignores case",
  migratedAs(
    { id: 7, artist: WALLET.toUpperCase().replace("0X", "0x"), fid: 0n },
    { fid: 0n },
    WALLET.toLowerCase(),
  ),
  7,
);

// --------------------------------------------------------------- and when it is NOT migrated

check(
  "no v3 copy at all means not migrated",
  migratedAs(undefined, { fid: FID }, WALLET),
  undefined,
);
check(
  "a different artist's copy of the same URI is not YOUR migration",
  migratedAs({ id: 9, artist: DEPLOYER, fid: 111111n }, { fid: FID }, WALLET),
  undefined,
);

// The subtle one. fid is optional on both contracts, so 0 must never match 0 — otherwise every
// fid-less legacy row matches every fid-less v3 master that happens to share a URI, and the card
// silently refuses to migrate real tracks.
check(
  "two missing fids do not count as the same fid",
  migratedAs({ id: 9, artist: DEPLOYER, fid: 0n }, { fid: 0n }, WALLET),
  undefined,
);

// ------------------------------------------------------------------ the miniapp wallet lookup

{
  const p = {};
  check(
    "the SDK's async accessor is used first",
    (
      await resolveWalletProvider(
        { wallet: { getEthereumProvider: async () => p } },
        {},
      )
    ).source,
    "getEthereumProvider",
  );
  check(
    "...and returns that provider, not window.ethereum",
    (
      await resolveWalletProvider(
        { wallet: { getEthereumProvider: async () => p } },
        {},
      )
    ).provider === p,
    true,
  );
}

check(
  "ethProvider is the fallback when the accessor is absent",
  (await resolveWalletProvider({ wallet: { ethProvider: {} } }, undefined))
    .source,
  "ethProvider",
);

{
  // Caught, not awaited bare: if the rejection ever propagates, an uncaught throw here would
  // abort the whole file and hide every check after it. That happened once already in
  // verify-radio-queue.ts, for the same reason.
  let source: string;
  try {
    source = (
      await resolveWalletProvider(
        {
          wallet: {
            getEthereumProvider: async () => {
              throw new Error("denied");
            },
            ethProvider: {},
          },
        },
        undefined,
      )
    ).source;
  } catch (e) {
    source = `THREW: ${(e as Error).message}`;
  }
  check(
    "a rejecting accessor falls through instead of taking the transaction with it",
    source,
    "ethProvider",
  );
}

check(
  "an accessor resolving undefined also falls through",
  (
    await resolveWalletProvider(
      {
        wallet: { getEthereumProvider: async () => undefined, ethProvider: {} },
      },
      undefined,
    )
  ).source,
  "ethProvider",
);

check(
  "outside Farcaster, window.ethereum is used",
  (await resolveWalletProvider(null, {})).source,
  "window",
);

// This is the exact shape the broken code met: a real SDK, whose wallet it never asked.
{
  const result = await resolveWalletProvider(
    { wallet: { ethProvider: {} } },
    undefined,
  );
  check(
    "a miniapp SDK is never reported as having no wallet",
    result.provider !== null,
    true,
  );
}

{
  const none = await resolveWalletProvider({ wallet: {} }, undefined);
  check("with nothing anywhere, the result is null", none.provider, null);
  check(
    "...and it names what was tried, so the message can too",
    none.source === "none" && none.tried.includes("window.ethereum"),
    true,
  );
}

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
