/**
 * Verifies the passport search that replaces the indexer's `PassportNFT` rows.
 *
 * Run: `node --experimental-strip-types tools/verify-passport-lookup.ts`
 *
 * ## What this is defending
 *
 * The indexer answered "everything this wallet holds". The contract cannot: `PassportNFTV4`
 * offers only `getPassportByAddress(address, countryCode)` and has no enumerator. So the question
 * is inverted — ask about every country — which works only because Multicall3 makes 195 reads one
 * request. Measured cold on the free public RPC: 1202ms for 195, and live it resolves
 * `0x33fFCcb1…` to MX, FR, CN, the three passports the migration moved.
 *
 * Three rules here fail quietly if broken:
 *
 * 1. **Every hit is returned, not the first.** `contract-generation.ts`'s existing `findPassport`
 *    stops at the first match, which answers "do they have one" and cannot answer "which ones".
 *    Returning early here would silently show a holder of three passports only one.
 * 2. **A reverting country is not an error.** Most of the 195 have no passport, and some revert
 *    rather than returning 0. Treating that as failure would empty the result.
 * 3. **Address beats FID.** Under V4 a holder with no Farcaster account is deliberately absent
 *    from the FID index, so an FID-first search returns nothing for exactly the wallet-only users
 *    the v3 work exists to support.
 */

import {
  findAllPassports,
  getPassportDetails,
  getRecentPassports,
} from "../lib/passport-lookup.ts";

const failures: string[] = [];
let checks = 0;

// BigInt-safe: a stride slip puts a raw `getPassportData` struct where a plain owner string
// belongs, and a bare JSON.stringify throws on its BigInts — turning a reportable failure into an
// uncaught crash that a "did it print a pass line" harness reads as no result at all.
const show = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = show(actual);
  const e = show(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const PASSPORT = "0x4D5533e29Cf190131885Dc7Dbef22e31F4252410" as const;

/** Records which function the search actually called, so preference can be asserted. */
function stubClient(opts: {
  byAddress?: Record<string, number>;
  byFid?: Record<string, number>;
  reverts?: string[];
  details?: Record<number, Record<string, unknown>>;
  owners?: Record<number, string>;
  supply?: number;
  seen?: string[];
}) {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      opts.seen?.push(functionName);
      if (functionName === "getTotalSupply") return BigInt(opts.supply ?? 0);
      throw new Error(`unstubbed read: ${functionName}`);
    },
    multicall: async ({
      contracts,
      allowFailure,
    }: {
      contracts: Array<Record<string, unknown>>;
      allowFailure?: boolean;
    }) => {
      const out = contracts.map((c) => {
        const fn = c.functionName as string;
        const args = (c.args ?? []) as unknown[];
        opts.seen?.push(fn);

        // Token ids are uint256. viem throws at encode time on a negative, so a stub that
        // quietly accepts one is more permissive than the real client — and the range-clamp
        // check below then cannot fail, because ids 0 and -1 just look like empty results.
        if (fn === "getPassportData" || fn === "ownerOf") {
          const raw = BigInt(args[0] as bigint);
          if (raw < 1n) {
            throw new Error(
              `cannot encode ${raw} as uint256 tokenId — ids are 1-based`,
            );
          }
        }

        if (fn === "getPassportData") {
          const id = Number(args[0]);
          const d = opts.details?.[id];
          return d
            ? { status: "success" as const, result: d }
            : { status: "failure" as const, error: new Error("no data") };
        }

        if (fn === "ownerOf") {
          const id = Number(args[0]);
          const o = opts.owners?.[id];
          return o
            ? { status: "success" as const, result: o }
            : { status: "failure" as const, error: new Error("nonexistent") };
        }

        const code = String(args[1]);
        if (opts.reverts?.includes(code)) {
          return { status: "failure" as const, error: new Error("revert") };
        }
        const table =
          fn === "getPassportByAddress" ? opts.byAddress : opts.byFid;
        return {
          status: "success" as const,
          result: BigInt(table?.[code] ?? 0),
        };
      });

      // Model viem's real contract: with allowFailure false a single reverting call throws and
      // takes the batch with it. The first version of this stub ignored the flag, which made the
      // "reverts are ordinary" check below unable to fail — it was testing the stub, not the code.
      if (allowFailure === false && out.some((r) => r.status === "failure")) {
        throw new Error("multicall reverted and allowFailure is false");
      }
      return out;
    },
  } as never;
}

const CODES = ["MX", "US", "FR", "CN", "TH", "GB"];

// ---------------------------------------------------------------- every hit, not the first

{
  const c = stubClient({ byAddress: { MX: 1, FR: 2, CN: 3 } });
  const found = await findAllPassports(c, {
    passportAddress: PASSPORT,
    countryCodes: CODES,
    address: "0xholder",
  });
  check("all three passports are returned, not just the first", found, [
    { tokenId: "1", countryCode: "MX" },
    { tokenId: "2", countryCode: "FR" },
    { tokenId: "3", countryCode: "CN" },
  ]);
}

{
  const c = stubClient({ byAddress: {} });
  const found = await findAllPassports(c, {
    passportAddress: PASSPORT,
    countryCodes: CODES,
    address: "0xnobody",
  });
  check("holding none returns empty, not an error", found, []);
}

{
  // tokenId 0 means "no passport", and is not a token.
  const c = stubClient({ byAddress: { MX: 0, FR: 2 } });
  const found = await findAllPassports(c, {
    passportAddress: PASSPORT,
    countryCodes: CODES,
    address: "0xholder",
  });
  check("a zero tokenId is absence, not a passport", found, [
    { tokenId: "2", countryCode: "FR" },
  ]);
}

// ---------------------------------------------------------------- reverts are ordinary

{
  const c = stubClient({ byAddress: { FR: 2 }, reverts: ["MX", "US", "CN"] });
  const found = await findAllPassports(c, {
    passportAddress: PASSPORT,
    countryCodes: CODES,
    address: "0xholder",
  });
  check("countries that revert do not hide the ones that answer", found, [
    { tokenId: "2", countryCode: "FR" },
  ]);
}

// ---------------------------------------------------------------- address beats FID

{
  const seen: string[] = [];
  const c = stubClient({
    byAddress: { MX: 1 },
    byFid: { US: 9 },
    seen,
  });
  const found = await findAllPassports(c, {
    passportAddress: PASSPORT,
    countryCodes: CODES,
    address: "0xholder",
    fid: 765994,
  });
  check(
    "with both available the ADDRESS index is used",
    [...new Set(seen)],
    ["getPassportByAddress"],
  );
  check("...and returns the address's passport", found, [
    { tokenId: "1", countryCode: "MX" },
  ]);
}

{
  const seen: string[] = [];
  const c = stubClient({ byFid: { US: 9 }, seen });
  const found = await findAllPassports(c, {
    passportAddress: PASSPORT,
    countryCodes: CODES,
    fid: 765994,
  });
  check(
    "with no address, the FID index is the fallback",
    [...new Set(seen)],
    ["getPassportByFid"],
  );
  check("...and finds the legacy passport", found, [
    { tokenId: "9", countryCode: "US" },
  ]);
}

{
  const found = await findAllPassports(stubClient({}), {
    passportAddress: PASSPORT,
    countryCodes: CODES,
  });
  check("neither address nor fid searches nothing", found, []);
}

{
  const found = await findAllPassports(stubClient({ byAddress: { MX: 1 } }), {
    passportAddress: PASSPORT,
    countryCodes: [],
    address: "0xholder",
  });
  check("an empty country list is not a crash", found, []);
}

// ---------------------------------------------------------------- details

{
  // `getPassportData` returns a STRUCT, which viem decodes as an OBJECT with named fields — not
  // as the positional tuple that multiple named return values produce. Both shapes appear in
  // this codebase, and reading one as the other yields undefined everywhere rather than an
  // error. Declaring this flat made every detail read fail against mainnet, and the failure was
  // invisible because the fallback keeps the passport with empty fields: the endpoint returned
  // three passports with no country names and a 200.
  const c = stubClient({
    details: {
      1: {
        userFid: 765994n,
        countryCode: "MX",
        countryName: "Mexico",
        region: "Central America",
        continent: "North America",
        mintedAt: 1769157019n,
        verified: false,
        verificationProof: "",
        verifiedAt: 0n,
      },
    },
  });
  const d = await getPassportDetails(c, PASSPORT, [
    { tokenId: "1", countryCode: "MX" },
  ]);
  check(
    "a struct return decodes by NAME, not by position",
    d[0].countryName,
    "Mexico",
  );
  check("...region survives", d[0].region, "Central America");
  check("...and the fid", d[0].userFid, 765994);
}

{
  // A passport that answered ownership but not detail still exists and must still be shown.
  const c = stubClient({ details: {} });
  const d = await getPassportDetails(c, PASSPORT, [
    { tokenId: "7", countryCode: "JP" },
  ]);
  check("a failed detail read keeps the passport", d.length, 1);
  check("...falling back to the code we searched with", d[0].countryCode, "JP");
}

// ---------------------------------------------------------------- the global recent feed

/**
 * `PassportNFT(limit: 8, order_by: {mintedAt: desc})` was a global feed, which `findAllPassports`
 * cannot produce — it is anchored to one holder.
 *
 * The first version of this took the shortcut that ids come from a monotonic counter, so id order
 * IS mint order. It is not: `migrateLegacyPassport` takes a fresh id and preserves the ORIGINAL
 * `mintedAt`, so a passport migrated today carries a high id and an old timestamp. Every passport
 * live today is a migrated one, so this is the normal case rather than an edge. The MIGRATION
 * group below is the check that was missing — it passes against the sort and fails against the
 * shortcut.
 *
 * Two more things here fail silently if broken. The multicall interleaves two calls per id, so a
 * wrong stride pairs each passport with the PREVIOUS one's owner — plausible output, wrong
 * attribution. And the range clamp only matters when the limit exceeds the supply, which is the
 * live case today: supply is 3 and the dashboard asks for 8.
 */
const DETAILS_3 = {
  1: {
    userFid: 765994n,
    countryCode: "MX",
    countryName: "Mexico",
    region: "Central America",
    continent: "North America",
    mintedAt: 1769157019n,
    verified: false,
  },
  2: {
    userFid: 765994n,
    countryCode: "FR",
    countryName: "France",
    region: "Western Europe",
    continent: "Europe",
    mintedAt: 1770512345n,
    verified: false,
  },
  3: {
    userFid: 765994n,
    countryCode: "CN",
    countryName: "China",
    region: "Eastern Asia",
    continent: "Asia",
    mintedAt: 1770729681n,
    verified: false,
  },
};
const OWNERS_3 = { 1: "0xaaa", 2: "0xbbb", 3: "0xccc" };

{
  const c = stubClient({ supply: 3, details: DETAILS_3, owners: OWNERS_3 });
  const recent = await getRecentPassports(c, PASSPORT, 8);
  check(
    "asking for more than exist returns what exists, not ids 0 and below",
    recent.map((p) => p.tokenId),
    ["3", "2", "1"],
  );
  check(
    "each passport keeps its OWN owner — a stride slip would shift these by one",
    recent.map((p) => p.owner),
    ["0xccc", "0xbbb", "0xaaa"],
  );
  check(
    "...and its own country, from the same interleaved batch",
    recent.map((p) => p.countryCode),
    ["CN", "FR", "MX"],
  );
  check(
    "newest first",
    recent.map((p) => p.mintedAt),
    [1770729681, 1770512345, 1769157019],
  );
}

// ------------------------------------------------------- MIGRATION: a high id with an old mint

{
  // Passport 3 is migrated: the newest id, but minted long before the other two. Sorting by id
  // would put it first and call it the most recent passport on the platform.
  const MIGRATED = {
    1: { ...DETAILS_3[1], mintedAt: 1770000000n },
    2: { ...DETAILS_3[2], mintedAt: 1780000000n },
    3: { ...DETAILS_3[3], mintedAt: 1700000000n },
  };
  const c = stubClient({ supply: 3, details: MIGRATED, owners: OWNERS_3 });
  const recent = await getRecentPassports(c, PASSPORT, 8);
  check(
    "a migrated passport sorts by its ORIGINAL mint, not by its fresh id",
    recent.map((p) => p.tokenId),
    ["2", "1", "3"],
  );
  check(
    "...so the feed is ordered by mintedAt descending",
    recent.map((p) => p.mintedAt),
    [1780000000, 1770000000, 1700000000],
  );

  // The limit must be applied AFTER the sort. Applied before, this returns ids 3 and 2 — and 3
  // is the OLDEST passport of the three.
  const two = await getRecentPassports(
    stubClient({ supply: 3, details: MIGRATED, owners: OWNERS_3 }),
    PASSPORT,
    2,
  );
  check(
    "a limit takes the two newest by mint, not the two highest ids",
    two.map((p) => p.tokenId),
    ["2", "1"],
  );
}

{
  // Same second for two migrations: order must still be deterministic, not whatever the multicall
  // happened to return.
  const TIED = {
    1: { ...DETAILS_3[1], mintedAt: 1770000000n },
    2: { ...DETAILS_3[2], mintedAt: 1770000000n },
    3: { ...DETAILS_3[3], mintedAt: 1770000000n },
  };
  const c = stubClient({ supply: 3, details: TIED, owners: OWNERS_3 });
  // Honest about what this pins: it fixes the OUTPUT for equal mint times, but it cannot
  // discriminate the comparator's tie-break clause. The scan already yields ids descending and
  // V8's sort is stable, so dropping the clause passes this check too — verified by mutation.
  // The clause stays because it states the intent rather than leaning on sort stability, and it
  // is what keeps this correct if the scan order ever changes.
  check(
    "equal mint times still produce a fixed order, not an arbitrary one",
    (await getRecentPassports(c, PASSPORT, 8)).map((p) => p.tokenId),
    ["3", "2", "1"],
  );
}

{
  const c = stubClient({ supply: 3, details: DETAILS_3, owners: OWNERS_3 });
  const recent = await getRecentPassports(c, PASSPORT, 2);
  check(
    "a limit below the supply takes the NEWEST, not the oldest",
    recent.map((p) => p.tokenId),
    ["3", "2"],
  );
  check("...and reads the whole collection to decide that", recent.length, 2);
}

{
  const c = stubClient({ supply: 0 });
  check(
    "an empty collection is empty, not a crash",
    await getRecentPassports(c, PASSPORT, 8),
    [],
  );
}

{
  const c = stubClient({ supply: 3, details: DETAILS_3, owners: OWNERS_3 });
  check(
    "a zero limit reads nothing",
    await getRecentPassports(c, PASSPORT, 0),
    [],
  );
}

{
  // Ids are 1-based: `_mintPassport` increments the counter BEFORE using it, so there is no
  // token 0. Reading a supply of 1 as a 0-based range would ask for id 0 and find nothing.
  const c = stubClient({
    supply: 1,
    details: { 1: DETAILS_3[1] },
    owners: { 1: "0xaaa" },
  });
  check(
    "a single passport is id 1, not id 0",
    (await getRecentPassports(c, PASSPORT, 5)).map((p) => p.tokenId),
    ["1"],
  );
}

{
  // A missing owner must not drop the passport — the feed is about the mint, not the transfer.
  const c = stubClient({
    supply: 3,
    details: DETAILS_3,
    owners: { 3: "0xccc" },
  });
  const recent = await getRecentPassports(c, PASSPORT, 8);
  check("a failed ownerOf keeps the passport", recent.length, 3);
  check(
    "...with the owner simply absent",
    recent.map((p) => p.owner ?? null),
    ["0xccc", null, null],
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
