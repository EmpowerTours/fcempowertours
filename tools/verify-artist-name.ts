/**
 * Verifies the artist-name resolution order in `lib/artist-name.ts`.
 *
 * Run: `node --experimental-strip-types tools/verify-artist-name.ts`
 *
 * ## What this is defending
 *
 * `contract-generation.ts` specified this order in a comment and nothing implemented it, so an
 * artist with no Farcaster account rendered as a bare address everywhere. The order itself is
 * not arbitrary — getting it wrong is a misrepresentation, not a cosmetic bug:
 *
 * 1. **A ProfileRegistry name must never be presented as a Farcaster username.** Anyone can
 *    register one, first-come, and the contract warns that homoglyphs are registerable. So `@`
 *    belongs to Farcaster alone, and a `profile` name must be rendered with its address visible.
 * 2. **Farcaster wins when both exist**, because it is the one a third party verified.
 * 3. **A failed lookup must never cost the caller a name.** A Farcaster 404 is the normal case
 *    for a wallet-only artist — that is the whole point of the v3 identity work — not an error.
 */

import {
  resolveArtistName,
  shortenAddress,
  _resetArtistNameCache,
} from "../lib/artist-name.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const ADDR = "0x33fFCcb1802e13a7eead232BCd4706a2269582b0";
const OTHER = "0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1";

const fc = (name: string | null) => async () => name;
const pr = (name: string | null) => async () => name;

// ---------------------------------------------------------------- shortening

check(
  "an address shortens to head and tail",
  shortenAddress(ADDR),
  "0x33fF…82b0",
);
check("a short string is returned as-is", shortenAddress("0x12"), "0x12");
check("empty is safe", shortenAddress(""), "");

// ---------------------------------------------------------------- order

{
  _resetArtistNameCache();
  const r = await resolveArtistName(ADDR, {
    lookupFarcaster: fc("unify34"),
    lookupProfile: pr("Earvin Gallardo"),
  });
  check("Farcaster wins when both exist", r.display, "@unify34");
  check("...and is reported as farcaster", r.source, "farcaster");
  check("...and needs no address alongside", r.needsAddressShown, false);
}

{
  _resetArtistNameCache();
  const r = await resolveArtistName(ADDR, {
    lookupFarcaster: fc(null),
    lookupProfile: pr("Earvin Gallardo"),
  });
  check(
    "the registry name is used when Farcaster has none",
    r.display,
    "Earvin Gallardo",
  );
  check("...reported as profile, not farcaster", r.source, "profile");
  check("...and MUST be shown with its address", r.needsAddressShown, true);
  check(
    "...and carries no @, which belongs to Farcaster",
    r.display.includes("@"),
    false,
  );
}

{
  _resetArtistNameCache();
  const r = await resolveArtistName(ADDR, {
    lookupFarcaster: fc(null),
    lookupProfile: pr(null),
  });
  check("with neither, the address is the name", r.display, "0x33fF…82b0");
  check("...reported as address", r.source, "address");
}

// ---------------------------------------------------------------- failures never cost a name

{
  _resetArtistNameCache();
  const r = await resolveArtistName(ADDR, {
    lookupFarcaster: async () => {
      throw new Error("neynar 404");
    },
    lookupProfile: pr("Earvin Gallardo"),
  });
  check(
    "a thrown Farcaster lookup falls through to the registry",
    r.display,
    "Earvin Gallardo",
  );
}

{
  _resetArtistNameCache();
  const r = await resolveArtistName(ADDR, {
    lookupFarcaster: async () => {
      throw new Error("neynar down");
    },
    lookupProfile: async () => {
      throw new Error("rpc down");
    },
  });
  check(
    "both failing still yields a renderable name",
    r.display,
    "0x33fF…82b0",
  );
  check("...and never throws", r.source, "address");
}

{
  _resetArtistNameCache();
  const r = await resolveArtistName(ADDR, {});
  check("no lookups configured is not a crash", r.source, "address");
}

// ---------------------------------------------------------------- caching

{
  _resetArtistNameCache();
  let fcCalls = 0;
  const counting = async () => {
    fcCalls++;
    return "unify34";
  };
  await resolveArtistName(ADDR, { lookupFarcaster: counting });
  await resolveArtistName(ADDR, { lookupFarcaster: counting });
  await resolveArtistName(ADDR.toLowerCase(), { lookupFarcaster: counting });
  check("a repeat resolve is served from cache", fcCalls, 1);
  check("...case-insensitively, so one artist is not two entries", fcCalls, 1);
}

{
  _resetArtistNameCache();
  let calls = 0;
  const counting = async () => {
    calls++;
    return "unify34";
  };
  await resolveArtistName(ADDR, { lookupFarcaster: counting });
  await resolveArtistName(OTHER, { lookupFarcaster: counting });
  check("different addresses are not conflated", calls, 2);
}

{
  // A rename frees the old name in the same transaction, so this cannot cache forever.
  _resetArtistNameCache();
  let n = 0;
  const renaming = async () => (n++ === 0 ? "Old Name" : "New Name");
  let clock = 1_000_000;
  const now = () => clock;

  const first = await resolveArtistName(ADDR, { lookupProfile: renaming, now });
  check("the first read sees the old name", first.display, "Old Name");

  clock += 4 * 60 * 1000;
  const cached = await resolveArtistName(ADDR, {
    lookupProfile: renaming,
    now,
  });
  check("still cached before the TTL", cached.display, "Old Name");

  clock += 2 * 60 * 1000;
  const fresh = await resolveArtistName(ADDR, { lookupProfile: renaming, now });
  check("a rename appears once the TTL passes", fresh.display, "New Name");
}

// ---------------------------------------------------------------- the name rules
//
// These mirror `ProfileRegistry._validateName`, run before spending gas. The one that matters
// most is the space rule: the contract rejects only LEADING and TRAILING spaces, so
// "Earvin Gallardo" is valid. A validator that rejected interior spaces would block the exact
// name this control was built for, and would look like a contract limitation rather than a bug.

import {
  validateDisplayName,
  byteLength,
} from "../lib/profile-name.ts";

check("an ordinary name passes", validateDisplayName("unify34"), null);
check("a name WITH A SPACE passes", validateDisplayName("Earvin Gallardo"), null);
check("empty is rejected", validateDisplayName("") !== null, true);
check("a leading space is rejected", validateDisplayName(" Earvin") !== null, true);
check("a trailing space is rejected", validateDisplayName("Earvin ") !== null, true);
check(
  "a control character is rejected",
  validateDisplayName("Earvin\u0007Gallardo") !== null,
  true,
);
check("a tab is rejected", validateDisplayName("Earvin\tGallardo") !== null, true);

check("bytes, not characters: ascii", byteLength("Earvin Gallardo"), 15);
check("an accent costs two bytes", byteLength("é"), 2);
check("an emoji costs four", byteLength("🎵"), 4);

check("32 bytes is allowed", validateDisplayName("a".repeat(32)), null);
check("33 bytes is rejected", validateDisplayName("a".repeat(33)) !== null, true);
check(
  "eight emoji are 32 bytes and allowed",
  validateDisplayName("🎵".repeat(8)),
  null,
);
check(
  "nine emoji are 36 bytes and rejected",
  validateDisplayName("🎵".repeat(9)) !== null,
  true,
);

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
