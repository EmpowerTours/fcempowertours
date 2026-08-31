/**
 * Verifies the passport mint preflight and the calls it builds.
 *
 * Run: `node --experimental-strip-types tools/verify-passport-mint.ts`
 *
 * ## What this is defending
 *
 * A passport mint reverted, and the app reported "Mint transaction reverted" — after the gas was
 * spent. Two separate misconfigurations were in front of it and both looked the same from
 * outside:
 *
 *   1. `Not authorized to mint`. The Platform Safe was never added to `authorizedMinters` after
 *      the V4 redeploy. `platformOperator` WAS set, which is a different mapping granting nothing
 *      here — easy to check, see set, and believe you are finished.
 *   2. `_mintPassport` calls `wmonToken.safeTransferFrom(msg.sender, platformWallet, MINT_PRICE)`
 *      and the Safe's allowance to the passport contract was zero.
 *
 * Neither had ever been reached, because every passport on the live contract arrived via
 * `migrateLegacyPassport`, which skips payment. The first genuine mint hit both.
 *
 * So the checks are about the two ways this goes quietly wrong again: a preflight that passes
 * something it should refuse, and an approval that is the wrong size — too small reverts, too
 * large leaves a standing allowance on a Safe holding real funds.
 */

import {
  preflightPassportMint,
  buildPassportMintCalls,
} from "../lib/passport-mint.ts";

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

const PASSPORT = "0x4D5533e29Cf190131885Dc7Dbef22e31F4252410";
const WMON = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";
const SAFE = "0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA";
const OWNER = "0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1";
const PRICE = 150_000000000000000000n;

function stub(o: {
  authorized?: boolean;
  owner?: string;
  allowance?: bigint;
  balance?: bigint;
  price?: bigint;
  throws?: boolean;
}) {
  return {
    async readContract({ functionName, args }: any) {
      if (o.throws) throw new Error("no code at address");
      switch (functionName) {
        case "MINT_PRICE":
          return o.price ?? PRICE;
        case "wmonToken":
          return WMON;
        case "owner":
          return o.owner ?? OWNER;
        case "authorizedMinters":
          return o.authorized ?? false;
        case "allowance":
          return o.allowance ?? 0n;
        case "balanceOf":
          return o.balance ?? 1908_000000000000000000n;
        default:
          throw new Error(`unexpected read: ${functionName} ${args}`);
      }
    },
  } as any;
}

// ------------------------------------------------------------- the live failure, before the fix

{
  const r = await preflightPassportMint(stub({ authorized: false }), {
    passport: PASSPORT,
    sender: SAFE,
  });
  check("an unauthorised sender is refused BEFORE spending gas", r.ok, false);
  if (!r.ok) {
    check(
      "...naming the call that fixes it",
      r.fix.includes("setAuthorizedMinter"),
      true,
    );
    check(
      "...and warning that platformOperator is not the same mapping",
      r.fix.includes("platformOperator"),
      true,
    );
  }
}

// ----------------------------------------------------------------------- and when it is allowed

{
  const r = await preflightPassportMint(stub({ authorized: true }), {
    passport: PASSPORT,
    sender: SAFE,
  });
  check("an authorised minter passes", r.ok, true);
  if (r.ok) {
    check(
      "...reading the price from the contract, not a constant",
      r.mintPrice,
      PRICE,
    );
    check(
      "...and reporting a zero allowance rather than refusing on it",
      r.allowance,
      0n,
    );
  }
}

check(
  "the owner may mint even without being in authorizedMinters — the modifier says so",
  (
    await preflightPassportMint(stub({ authorized: false, owner: SAFE }), {
      passport: PASSPORT,
      sender: SAFE,
    })
  ).ok,
  true,
);

// A zero allowance must NOT block: the approval is granted in the same batch as the mint. If this
// ever refuses, passports stop minting entirely for a condition that is the normal case.
check(
  "a zero allowance is not treated as a failure",
  (
    await preflightPassportMint(stub({ authorized: true, allowance: 0n }), {
      passport: PASSPORT,
      sender: SAFE,
    })
  ).ok,
  true,
);

// Balance IS a real blocker, and belongs before the transaction rather than inside it.
{
  const r = await preflightPassportMint(
    stub({ authorized: true, balance: PRICE - 1n }),
    { passport: PASSPORT, sender: SAFE },
  );
  check("too little WMON to cover the price is refused", r.ok, false);
  check(
    "exactly the price is enough",
    (
      await preflightPassportMint(stub({ authorized: true, balance: PRICE }), {
        passport: PASSPORT,
        sender: SAFE,
      })
    ).ok,
    true,
  );
}

check(
  "an unreadable contract fails closed rather than proceeding",
  (
    await preflightPassportMint(stub({ throws: true }), {
      passport: PASSPORT,
      sender: SAFE,
    })
  ).ok,
  false,
);

// ------------------------------------------------------------------------------- the batch

const MINT_DATA = "0xdeadbeef" as const;

{
  const calls = buildPassportMintCalls({
    passport: PASSPORT,
    wmon: WMON,
    mintPrice: PRICE,
    allowance: 0n,
    mintData: MINT_DATA,
  });
  check(
    "with no allowance, approve is bundled ahead of the mint",
    calls.length,
    2,
  );
  check(
    "...the approval goes to the TOKEN, not the passport",
    calls[0].to,
    WMON,
  );
  check("...and the mint to the passport", calls[1].to, PASSPORT);
  check(
    "...in that order — approve must precede the transfer it authorises",
    calls[1].data,
    MINT_DATA,
  );
  check("...the approval carries no value", calls[0].value, 0n);

  // approve(address,uint256) = 0x095ea7b3, then the spender and the amount, 32 bytes each.
  //
  // Parsed defensively: an ordering mutation puts the mint's short calldata here, and
  // `BigInt("0x")` THROWS. An uncaught throw aborts the file and hides every check after it —
  // which is how the ordering mutation first came back with no output at all rather than a
  // failure.
  const data = calls[0].data;
  const word = (from: number, to: number) => {
    const hex = data.slice(from, to);
    if (hex.length !== to - from) return null;
    try {
      return BigInt("0x" + hex);
    } catch {
      return null;
    }
  };
  check("...it is an approve call", data.slice(0, 10), "0x095ea7b3");
  check(
    "...approving the PASSPORT contract as spender",
    data.length >= 74 ? "0x" + data.slice(34, 74) : null,
    PASSPORT.toLowerCase(),
  );
  check(
    "...for EXACTLY the mint price, not an unlimited allowance",
    word(74, 138),
    PRICE,
  );
}

{
  // A leftover allowance from a batch whose mint reverted is enough on its own. Re-approving on
  // top would leave the excess standing on a Safe that holds real funds.
  const calls = buildPassportMintCalls({
    passport: PASSPORT,
    wmon: WMON,
    mintPrice: PRICE,
    allowance: PRICE,
    mintData: MINT_DATA,
  });
  check("a sufficient existing allowance skips the approval", calls.length, 1);
  check("...sending only the mint", calls[0].to, PASSPORT);
}

check(
  "an allowance one wei short still approves",
  buildPassportMintCalls({
    passport: PASSPORT,
    wmon: WMON,
    mintPrice: PRICE,
    allowance: PRICE - 1n,
    mintData: MINT_DATA,
  }).length,
  2,
);

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
