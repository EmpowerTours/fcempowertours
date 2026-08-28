/**
 * Verifies licence holdings across both contract generations.
 *
 * Run: `node --experimental-strip-types tools/verify-user-holdings.ts`
 *
 * ## What this is defending
 *
 * Replacing the indexer's `MusicLicense` rows means answering "what does this wallet own" from
 * the contracts. Three things about that are easy to get wrong and quiet when you do:
 *
 * 1. **There are two contracts.** The cutover left old licences on the legacy NFT and new ones on
 *    the v3 registry. A v3-only query reports nothing for `0x868469e5…`, who holds three legacy
 *    licences. Verified on mainnet: `balanceOf` reads 3 on legacy and 0 on v3.
 *
 * 2. **They disagree about time.** Legacy licences expire — a 30-day `licensePeriod`, and
 *    `0x868469e5…`'s lapsed on 2026-03-06. v3 licences are perpetual by design. Counting a
 *    legacy licence without checking expiry grants access that ended six months ago, which is
 *    why the legacy side calls `hasValidLicense` rather than `balanceOf`.
 *
 * 3. **"Purchases" is a lifetime count.** The dashboard labels the total that way, so it must
 *    span both generations. v3's `totalLicenses()` alone reads 1 where 5 have been sold. The
 *    indexer got this wrong too — it watched only the legacy contract and reported 4.
 *
 * The reads are stubbed. This is about the shape of the answer, not about mainnet being up; the
 * live numbers are recorded in the commit that added it.
 */

import {
  getLicenceHoldings,
  getCatalogueTotals,
} from "../lib/user-holdings.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const REGISTRY = "0x42EbcD44C2295702130f0A641633c691bA5f9480" as const;
const LEGACY = "0xB9B3acf33439360B55d12429301E946f34f3B73F" as const;

/**
 * A client that answers from a script rather than a chain.
 *
 * `v3` maps masterId -> count, `legacy` maps masterId -> hasValidLicense.
 */
function stubClient(opts: {
  totalMasters?: bigint;
  totalLicenses?: bigint;
  v3?: Record<number, number>;
  legacy?: Record<number, boolean>;
  legacyLicenceIds?: number[];
  failV3?: boolean;
  failTotals?: boolean;
}) {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (opts.failTotals) throw new Error("rpc down");
      if (functionName === "totalMasters") return opts.totalMasters ?? 5n;
      throw new Error(`unexpected readContract: ${functionName}`);
    },
    multicall: async ({
      contracts,
    }: {
      contracts: Array<Record<string, unknown>>;
    }) => {
      return contracts.map((c) => {
        const fn = c.functionName as string;
        const args = (c.args ?? []) as unknown[];
        if (fn === "licensesHeld") {
          if (opts.failV3)
            return { status: "failure" as const, error: new Error("x") };
          const id = Number(args[1]);
          return { status: "success" as const, result: opts.v3?.[id] ?? 0 };
        }
        if (fn === "hasValidLicense") {
          const id = Number(args[1]);
          return {
            status: "success" as const,
            result: opts.legacy?.[id] ?? false,
          };
        }
        if (fn === "ownerOf") {
          // Literal token ids, not offsets. Normalising by the same base the code adds would
          // cancel out an off-by-one and make the check below unable to fail.
          const id = Number(args[0]);
          return (opts.legacyLicenceIds ?? []).includes(id)
            ? { status: "success" as const, result: "0xowner" }
            : { status: "failure" as const, error: new Error("nonexistent") };
        }
        if (fn === "totalMasters")
          return {
            status: "success" as const,
            result: opts.totalMasters ?? 5n,
          };
        if (fn === "totalLicenses")
          return {
            status: "success" as const,
            result: opts.totalLicenses ?? 1n,
          };
        return { status: "failure" as const, error: new Error("unexpected") };
      });
    },
  } as never;
}

const opts = { registry: REGISTRY, legacy: LEGACY };

// ---------------------------------------------------------------- both generations count

{
  // 0x868469e5…: three legacy licences, all EXPIRED, nothing on v3.
  const c = stubClient({ v3: {}, legacy: {} });
  const h = await getLicenceHoldings(c, "0xexpired", opts);
  check("an expired legacy licence grants nothing", h.masters, []);
  check("...and hasAny is false", h.hasAny, false);
}

{
  // The same holder before expiry would have read valid on legacy, nothing on v3.
  const c = stubClient({ v3: {}, legacy: { 1: true, 3: true, 4: true } });
  const h = await getLicenceHoldings(c, "0xlegacy", opts);
  check("legacy-only holdings are found at all", h.masters.length, 3);
  check(
    "...and are marked legacy, not v3",
    h.masters.map((m) => [m.masterTokenId, m.v3Count, m.legacyValid]),
    [
      ["1", 0, true],
      ["3", 0, true],
      ["4", 0, true],
    ],
  );
}

{
  // 0xd6b624f5… really does hold both for master 3.
  const c = stubClient({ v3: { 3: 1 }, legacy: { 3: true } });
  const h = await getLicenceHoldings(c, "0xboth", opts);
  check("holding both generations is one entry, not two", h.masters.length, 1);
  check("...carrying both facts", h.masters[0], {
    masterTokenId: "3",
    v3Count: 1,
    legacyValid: true,
  });
}

{
  const c = stubClient({ v3: { 2: 3 }, legacy: {} });
  const h = await getLicenceHoldings(c, "0xmulti", opts);
  check(
    "multiple v3 licences for one master are counted",
    h.masters[0].v3Count,
    3,
  );
}

// ---------------------------------------------------------------- degrade, never throw

{
  const c = stubClient({ failV3: true, legacy: { 2: true } });
  const h = await getLicenceHoldings(c, "0xhalf", opts);
  check(
    "a failed v3 read does not hide a valid legacy licence",
    h.masters.map((m) => m.masterTokenId),
    ["2"],
  );
}

{
  const c = stubClient({ failTotals: true });
  const h = await getLicenceHoldings(c, "0xdown", opts);
  check("an unreachable registry yields empty, not a throw", h.masters, []);
}

{
  const c = stubClient({ totalMasters: 0n });
  const h = await getLicenceHoldings(c, "0xnone", opts);
  check("an empty catalogue is not an error", h.hasAny, false);
}

{
  const h = await getLicenceHoldings(stubClient({}), "", opts);
  check("no address is not a crash", h.hasAny, false);
}

// ---------------------------------------------------------------- lifetime totals

{
  process.env.NEXT_PUBLIC_LEGACY_NFT_CONTRACT = LEGACY;
  // Mainnet as of 2026-08-28: 5 masters, 1 v3 licence, 4 legacy licences.
  const c = stubClient({
    totalMasters: 5n,
    totalLicenses: 1n,
    legacyLicenceIds: [1000001, 1000002, 1000003, 1000004],
  });
  const t = await getCatalogueTotals(c, REGISTRY);
  check("masters come from the registry", t.totalMasters, 5);
  check(
    "purchases span both generations — the indexer reported 4",
    t.totalLicenses,
    5,
  );
}

{
  process.env.NEXT_PUBLIC_LEGACY_NFT_CONTRACT = LEGACY;
  const c = stubClient({ totalLicenses: 1n, legacyLicenceIds: [] });
  const t = await getCatalogueTotals(c, REGISTRY);
  check("with no legacy licences the total is just v3", t.totalLicenses, 1);
}

{
  // Legacy ids are 1000001+ (`_licenseTokenCounter = 1000000`, incremented before use).
  //
  // The discriminator is id 1000000 EXISTING in the stub while 1000001 also does. Correct code
  // probes 1000001.. and counts one; code that starts at the base counts two. An earlier version
  // of this check listed only 1000001, which both versions found — it could not fail, which makes
  // it worse than no check.
  process.env.NEXT_PUBLIC_LEGACY_NFT_CONTRACT = LEGACY;
  const c = stubClient({
    totalLicenses: 0n,
    legacyLicenceIds: [1000000, 1000001],
  });
  const t = await getCatalogueTotals(c, REGISTRY);
  check(
    "probing starts at 1000001, not at the 1000000 base",
    t.totalLicenses,
    1,
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
