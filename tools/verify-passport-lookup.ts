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
} from "../lib/passport-lookup.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const PASSPORT = "0x4D5533e29Cf190131885Dc7Dbef22e31F4252410" as const;

/** Records which function the search actually called, so preference can be asserted. */
function stubClient(opts: {
  byAddress?: Record<string, number>;
  byFid?: Record<string, number>;
  reverts?: string[];
  details?: Record<number, Record<string, unknown>>;
  seen?: string[];
}) {
  return {
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

        if (fn === "getPassportData") {
          const id = Number(args[0]);
          const d = opts.details?.[id];
          return d
            ? { status: "success" as const, result: d }
            : { status: "failure" as const, error: new Error("no data") };
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
  check("a struct return decodes by NAME, not by position", d[0].countryName, "Mexico");
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

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
