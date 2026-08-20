/**
 * Checks `lib/rights-declaration.ts`.
 *
 * Run: `node --experimental-strip-types tools/verify-rights-declaration.ts`
 *
 * Two things here are worth more than the rest:
 *
 *  1. **A v1.0 record must stay valid forever.** These are signed rights records. Their hash is
 *     over the agreement text in force when the artist accepted it, so re-hashing an old record
 *     against new text does not update it — it destroys the only thing that makes it evidence.
 *  2. **Empty is not invalid.** An artist who has not distributed yet has no ISRC. Treating blank
 *     as a validation failure would lock them out of publishing over a field they cannot answer.
 */

import {
  normalizeIsrc,
  isValidIsrc,
  formatIsrcForDisplay,
  buildFilledAgreement,
  generateAgreementHash,
  verifyAgreementHash,
  agreementTextForVersion,
  instrumentalDeclarationText,
  distributionDeclarationText,
  RIGHTS_AGREEMENT_VERSION,
  SUPPORTED_AGREEMENT_VERSIONS,
  type RightsDeclaration,
  type RightsStatus,
} from "../lib/rights-declaration.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

// =====================================================================
// ISRC
// =====================================================================

check(
  "hyphenated input normalises",
  normalizeIsrc("GX-F97-26-52851"),
  "GXF972652851",
);
check(
  "spaces and case normalise",
  normalizeIsrc(" gx f97 26 52851 "),
  "GXF972652851",
);
check("empty normalises to empty", normalizeIsrc(""), "");
check("null normalises to empty", normalizeIsrc(null), "");

check("a well-formed ISRC validates", isValidIsrc("GXF972652851"), true);
check("hyphenated validates too", isValidIsrc("GX-F97-26-52851"), true);
check("lower case validates", isValidIsrc("gxf972652851"), true);

// Registrant may be alphanumeric; country must be letters; year and designation must be digits.
check(
  "digits in the registrant are allowed",
  isValidIsrc("USK4L1234567"),
  true,
);
check(
  "a digit in the country code is rejected",
  isValidIsrc("1XF972652851"),
  false,
);
check("letters in the year are rejected", isValidIsrc("GXF97AB52851"), false);
check("too short is rejected", isValidIsrc("GXF97265285"), false);
check("too long is rejected", isValidIsrc("GXF9726528510"), false);

/** The distinction the whole design rests on: blank is not an error, it is "not yet". */
check("empty is NOT a valid ISRC", isValidIsrc(""), false);
check("...but empty is also not garbage", normalizeIsrc(""), "");

check(
  "display formatting",
  formatIsrcForDisplay("GXF972652851"),
  "GX-F97-26-52851",
);
check(
  "display formatting is idempotent",
  formatIsrcForDisplay("GX-F97-26-52851"),
  "GX-F97-26-52851",
);
check(
  "malformed input is returned unchanged",
  formatIsrcForDisplay("nope"),
  "nope",
);

// =====================================================================
// Versioning
// =====================================================================

check("current version is 1.1", RIGHTS_AGREEMENT_VERSION, "1.1");
check(
  "both versions are supported",
  [...SUPPORTED_AGREEMENT_VERSIONS],
  ["1.0", "1.1"],
);
check(
  "v1.0 text is still available",
  agreementTextForVersion("1.0") !== null,
  true,
);
check("v1.1 text is available", agreementTextForVersion("1.1") !== null, true);
check("an unknown version returns null", agreementTextForVersion("9.9"), null);

const v10 = agreementTextForVersion("1.0")!;
const v11 = agreementTextForVersion("1.1")!;
check(
  "v1.0 has no instrumental placeholder",
  v10.includes("{{INSTRUMENTAL_DECLARATION}}"),
  false,
);
check("v1.1 has one", v11.includes("{{INSTRUMENTAL_DECLARATION}}"), true);
check(
  "v1.1 has a distribution placeholder",
  v11.includes("{{DISTRIBUTION_DECLARATION}}"),
  true,
);
check("the two texts differ", v10 === v11, false);

// =====================================================================
// A v1.0 record must keep working
// =====================================================================

const legacy: RightsDeclaration = {
  notPro: true,
  ownsComposition: true,
  ownsMaster: true,
  grantsPerformance: true,
  grantsMechanical: true,
  grantsMasterUse: true,
  containsSamples: false,
  samplesCleared: false,
  isrcCode: "",
  artistAddress: "0x1111111111111111111111111111111111111111",
  artistFid: "868469",
  accepted: true,
  acceptedAt: "2026-01-01T00:00:00.000Z",
  // No `version` field at all — exactly how records were written before v1.1.
};

const legacyText = buildFilledAgreement(legacy, "42");
check("a v1.0 record still builds", legacyText.length > 0, true);
check(
  "and defaults to the v1.0 text",
  legacyText.includes("Version 1.0"),
  true,
);
check(
  "with no unreplaced placeholder left behind",
  legacyText.includes("{{"),
  false,
);

const legacyHash = generateAgreementHash(
  legacyText,
  legacy.artistFid,
  legacy.artistAddress,
);
const legacyStatus: RightsStatus = {
  status: "cleared",
  version: "1.0",
  agreementCid: "",
  agreementHash: legacyHash,
  declaration: legacy,
  tokenId: "42",
  storedAt: "2026-01-01T00:00:00.000Z",
};
check(
  "a v1.0 record still verifies after the bump",
  verifyAgreementHash(legacyStatus),
  true,
);

/**
 * The failure being prevented: verifying an old record against the *current* text. It produces a
 * document that never existed and reports a genuine, untampered record as invalid.
 */
const wronglyRehashed = generateAgreementHash(
  buildFilledAgreement(legacy, "42", undefined, "1.1"),
  legacy.artistFid,
  legacy.artistAddress,
);
check(
  "re-hashing a v1.0 record against v1.1 text gives a DIFFERENT hash",
  wronglyRehashed === legacyHash,
  false,
);

// =====================================================================
// v1.1 records
// =====================================================================

const modern: RightsDeclaration = {
  ...legacy,
  version: "1.1",
  isrcCode: "GXF972652851",
  usedLicensedInstrumental: true,
  instrumentalProducer: "Your Loving Lounge",
  instrumentalLicenceRef: "INV-2026-0042",
  licenceGrantsDistribution: true,
  distributedElsewhere: true,
  distributorName: "RouteNote",
  releaseUPC: "196922873423",
};

const modernText = buildFilledAgreement(modern, "43");
check(
  "a v1.1 record builds against v1.1 text",
  modernText.includes("Version 1.1"),
  true,
);
check("no placeholder left behind", modernText.includes("{{"), false);
check(
  "the producer is recorded",
  modernText.includes("Your Loving Lounge"),
  true,
);
check(
  "the licence reference is recorded",
  modernText.includes("INV-2026-0042"),
  true,
);
check("the distributor is recorded", modernText.includes("RouteNote"), true);
check(
  "the ISRC renders hyphenated",
  modernText.includes("GX-F97-26-52851"),
  true,
);

/** The commercial point of the whole task. */
check(
  "a licensed instrumental carries the Content ID warning",
  modernText.includes("must NOT be enrolled in content identification systems"),
  true,
);
check(
  "a track with no licensed instrumental does not",
  buildFilledAgreement(
    { ...modern, usedLicensedInstrumental: false },
    "44",
  ).includes("must NOT be enrolled"),
  false,
);

check(
  "an unconfirmed distribution licence is stated as unconfirmed",
  instrumentalDeclarationText({
    ...modern,
    licenceGrantsDistribution: false,
  }).includes("has NOT confirmed"),
  true,
);
check(
  "no external distribution reads plainly",
  distributionDeclarationText({ ...modern, distributedElsewhere: false }),
  "The Work is not currently released through an external distributor.",
);

const modernHash = generateAgreementHash(
  modernText,
  modern.artistFid,
  modern.artistAddress,
);
check(
  "a v1.1 record verifies",
  verifyAgreementHash({
    status: "cleared",
    version: "1.1",
    agreementCid: "",
    agreementHash: modernHash,
    declaration: modern,
    tokenId: "43",
    storedAt: "2026-08-20T00:00:00.000Z",
  }),
  true,
);

check(
  "a tampered record does NOT verify",
  verifyAgreementHash({
    status: "cleared",
    version: "1.1",
    agreementCid: "",
    agreementHash: modernHash,
    declaration: { ...modern, instrumentalProducer: "Someone Else" },
    tokenId: "43",
    storedAt: "2026-08-20T00:00:00.000Z",
  }),
  false,
);

// A record with none of the new fields set must still build and verify under v1.1.
const sparse: RightsDeclaration = { ...legacy, version: "1.1" };
const sparseText = buildFilledAgreement(sparse, "45");
check(
  "a v1.1 record with no new fields still builds",
  sparseText.includes("{{"),
  false,
);
check(
  "and still verifies",
  verifyAgreementHash({
    status: "cleared",
    version: "1.1",
    agreementCid: "",
    agreementHash: generateAgreementHash(
      sparseText,
      sparse.artistFid,
      sparse.artistAddress,
    ),
    declaration: sparse,
    tokenId: "45",
    storedAt: "2026-08-20T00:00:00.000Z",
  }),
  true,
);

let threw = false;
try {
  buildFilledAgreement(legacy, "1", undefined, "9.9");
} catch {
  threw = true;
}
check(
  "an unknown version throws rather than silently mis-building",
  threw,
  true,
);

console.log(`\n${checks} checks run`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
