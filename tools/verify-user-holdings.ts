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
  getRecentLicenses,
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
  /** Keyed by LITERAL licence id (1000001, …), never by an offset-normalised index. */
  licenses?: Record<
    number,
    { masterTokenId: number; mintedAt: number; isCollector: boolean }
  >;
  licenceOwners?: Record<number, string>;
}) {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (opts.failTotals) throw new Error("rpc down");
      if (functionName === "totalMasters") return opts.totalMasters ?? 5n;
      if (functionName === "totalLicenses") return opts.totalLicenses ?? 1n;
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
        if (fn === "getLicense") {
          // The contract reads a mapping here, so an id that was never minted comes back as a
          // ZEROED STRUCT with a 200 — verified on mainnet, getLicense(1) answers (0, 0, false).
          // A stub that returned a failure instead would make the offset mutation undetectable:
          // wrong ids would look like empty results rather than fabricated licences.
          const id = Number(args[0]);
          const l = opts.licenses?.[id];
          return {
            status: "success" as const,
            result: l
              ? {
                  masterTokenId: BigInt(l.masterTokenId),
                  mintedAt: BigInt(l.mintedAt),
                  isCollector: l.isCollector,
                }
              : { masterTokenId: 0n, mintedAt: 0n, isCollector: false },
          };
        }
        if (fn === "ownerOf") {
          // Literal token ids, not offsets. Normalising by the same base the code adds would
          // cancel out an off-by-one and make the check below unable to fail.
          const id = Number(args[0]);
          if (opts.licenceOwners && id in opts.licenceOwners) {
            return { status: "success" as const, result: opts.licenceOwners[id] };
          }
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

// ---------------------------------------------------------------- the recent licence feed

/**
 * `MusicLicense(limit: N, order_by: {createdAt: desc})` — a global feed, replaced the same way as
 * the passport one: ids come from a monotonic counter, so id order is mint order.
 *
 * The trap is the range. Licence ids start at LICENSE_ID_OFFSET (1,000,000), and
 * `totalLicenses()` returns a COUNT rather than the highest id — it is `_licenseCounter - OFFSET`.
 * So the newest licence sits at `OFFSET + total`, not at `total`.
 *
 * Getting that wrong does not error. `getLicense` reads a mapping, so unminted ids return a
 * zeroed struct with a 200 — confirmed on mainnet, `getLicense(1)` answers `(0, 0, false)`. A
 * naive 1-based range would therefore render a feed of licences for master 0, minted at the
 * epoch: uniform, plausible, entirely invented. The stub models that, and the mutation below
 * exists to prove these checks would catch it.
 */
const LICENCES = {
  1000001: { masterTokenId: 3, mintedAt: 1785604159, isCollector: false },
  1000002: { masterTokenId: 5, mintedAt: 1785704159, isCollector: true },
  1000003: { masterTokenId: 2, mintedAt: 1785804159, isCollector: false },
};
const LICENCE_OWNERS = { 1000001: "0xd6B6", 1000002: "0xaaaa", 1000003: "0xbbbb" };

{
  const c = stubClient({
    totalLicenses: 3n,
    licenses: LICENCES,
    licenceOwners: LICENCE_OWNERS,
  });
  const recent = await getRecentLicenses(c, "0xregistry", 10);
  check(
    "licence ids carry the 1,000,000 offset — a count is not an id",
    recent.map((l) => l.licenseId),
    ["1000003", "1000002", "1000001"],
  );
  check(
    "each licence keeps its own master, so the stride is right",
    recent.map((l) => l.masterTokenId),
    ["2", "5", "3"],
  );
  check(
    "...and its own buyer",
    recent.map((l) => l.licensee),
    ["0xbbbb", "0xaaaa", "0xd6B6"],
  );
  check("newest first", recent.map((l) => l.mintedAt), [
    1785804159, 1785704159, 1785604159,
  ]);
  check(
    "the collector flag survives per licence",
    recent.map((l) => l.isCollector),
    [false, true, false],
  );
}

{
  const c = stubClient({
    totalLicenses: 3n,
    licenses: LICENCES,
    licenceOwners: LICENCE_OWNERS,
  });
  check(
    "a limit below the total takes the NEWEST",
    (await getRecentLicenses(c, "0xregistry", 1)).map((l) => l.licenseId),
    ["1000003"],
  );
}

{
  // The live case today: exactly one licence, id 1000001, master 3.
  const c = stubClient({
    totalLicenses: 1n,
    licenses: { 1000001: LICENCES[1000001] },
    licenceOwners: { 1000001: "0xd6B6" },
  });
  const recent = await getRecentLicenses(c, "0xregistry", 10);
  check("the live single licence resolves", recent.length, 1);
  check("...to master 3", recent[0]?.masterTokenId, "3");
}

{
  const c = stubClient({ totalLicenses: 0n });
  check("no licences is empty, not a phantom row", await getRecentLicenses(c, "0xregistry", 10), []);
}

{
  // A zeroed struct is the mapping's "never minted", not a licence for master 0. This is the
  // last line of defence if the range is ever wrong again.
  const c = stubClient({ totalLicenses: 3n, licenses: {} });
  check(
    "unminted ids are dropped rather than rendered as master 0",
    await getRecentLicenses(c, "0xregistry", 10),
    [],
  );
}

{
  const c = stubClient({ totalLicenses: 3n, licenses: LICENCES });
  const recent = await getRecentLicenses(c, "0xregistry", 10);
  check("a failed ownerOf keeps the licence", recent.length, 3);
  check("...with the buyer absent", recent[0]?.licensee ?? null, null);
}

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
