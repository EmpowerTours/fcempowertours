import { keccak256, encodePacked } from "viem";
import { Redis } from "@upstash/redis";

/**
 * The version new declarations are signed under.
 *
 * **Older versions stay valid and readable.** A stored declaration is a signed rights record; its
 * hash is over the exact agreement text in force when the artist accepted it. Re-hashing an old
 * record against new text would not "update" it, it would destroy the only thing that makes it
 * evidence. So the text of every published version is kept below and the check is versioned —
 * see {@link agreementTextForVersion} and {@link verifyAgreementHash}.
 */
export const RIGHTS_AGREEMENT_VERSION = "1.1";

/** Versions this module can still rebuild and verify. */
export const SUPPORTED_AGREEMENT_VERSIONS = ["1.0", "1.1"] as const;
export type AgreementVersion = (typeof SUPPORTED_AGREEMENT_VERSIONS)[number];

const RIGHTS_AGREEMENT_TEXT_V1_0 = `EMPOWERTOURS DIRECT ARTIST LICENSING AGREEMENT
Version {{VERSION}} | Date: {{DATE}}

PARTIES
Platform: EmpowerTours (fcempowertours.vercel.app)
Artist: {{ARTIST_ADDRESS}} (Farcaster FID: {{ARTIST_FID}})

DECLARATIONS
The Artist hereby declares and warrants that:

1. PRO AFFILIATION: The Artist is NOT a member of any Performing Rights Organization (PRO) including but not limited to ASCAP, BMI, SESAC, GMR, or any international equivalent. The Artist has not registered the Work with any PRO or collective management organization.

2. COMPOSITION OWNERSHIP: The Artist is the sole author and copyright owner of the musical composition (melody, harmony, lyrics) embodied in the Work, or has obtained all necessary rights from co-authors.

3. MASTER RECORDING OWNERSHIP: The Artist is the sole owner of the master recording (sound recording) of the Work, or has obtained all necessary rights from any co-owners, producers, or featured artists.

4. SAMPLE CLEARANCE: {{SAMPLES_DECLARATION}}

5. ISRC CODE: {{ISRC_DECLARATION}}

LICENSE GRANT
The Artist hereby grants to EmpowerTours a non-exclusive, worldwide, perpetual license to:

a) PERFORMANCE RIGHT: Stream the Work via EmpowerTours Live Radio and on-demand artist pages to registered platform users.

b) MECHANICAL RIGHT: Make server-side reproductions of the Work as necessary to facilitate streaming delivery, caching, and format conversion.

c) MASTER USE RIGHT: Use the master recording of the Work for all streaming purposes described above, including promotional clips of up to 30 seconds.

COMPENSATION
- The Artist retains 90% of all WMON license sales revenue.
- The Artist receives a proportional share of the monthly WMON streaming pool (70% of all subscription revenue), calculated as (Artist's play count / Total platform plays) x Artist Pool.
- 20% of subscription revenue is allocated to the Listener Reward Pool (ListenerRewardPool contract). Active radio listeners — including artists who listen — earn WMON proportional to songs heard each month. Artists who are also active listeners may earn up to 90% of subscription revenue (70% artist pool + 20% listener pool).
- 10% of subscription revenue is allocated to the platform treasury.
- The Artist receives 100% of WMON tips sent by fans through the platform.
- Eligible artists (10+ master NFTs, 100+ lifetime plays) may claim monthly TOURS rewards via the ToursRewardManager.
- This license does not transfer any ownership rights in the Work.

REVOCATION
The Artist may revoke this license at any time by contacting platform administrators. Revocation will take effect within 48 hours and will not affect licenses already sold to individual users.

REPRESENTATIONS
The Artist represents that granting this license does not violate any existing agreement, and that no third party has a claim to the rights granted herein.

TOKEN ID: {{TOKEN_ID}}
RIGHTS AGREEMENT HASH: {{AGREEMENT_HASH}}
MINTED ON: Monad Mainnet (Chain ID: 143)`;

/**
 * v1.1 adds two disclosures and changes nothing else. Both are recorded rather than enforced —
 * see the note on the submit gate in {@link RightsDeclaration}.
 */
const RIGHTS_AGREEMENT_TEXT_V1_1 = RIGHTS_AGREEMENT_TEXT_V1_0.replace(
  "5. ISRC CODE: {{ISRC_DECLARATION}}",
  `5. ISRC CODE: {{ISRC_DECLARATION}}

6. LICENSED INSTRUMENTAL: {{INSTRUMENTAL_DECLARATION}}

7. EXTERNAL DISTRIBUTION: {{DISTRIBUTION_DECLARATION}}`,
);

const AGREEMENT_TEXTS: Record<string, string> = {
  "1.0": RIGHTS_AGREEMENT_TEXT_V1_0,
  "1.1": RIGHTS_AGREEMENT_TEXT_V1_1,
};

/** The agreement text as published under `version`. Unknown versions return null. */
export function agreementTextForVersion(version: string): string | null {
  return AGREEMENT_TEXTS[version] ?? null;
}

/** Current text. Kept as a named export because callers used to import it directly. */
export const RIGHTS_AGREEMENT_TEXT = RIGHTS_AGREEMENT_TEXT_V1_1;

// =============================================
// ISRC
// =============================================

/**
 * ISRC is `CCXXXYYNNNNN` — 2-letter country, 3-char alphanumeric registrant, 2-digit year,
 * 5-digit designation. Artists routinely type it hyphenated (`GX-F97-26-52851`), so input is
 * normalised before validation and stored without separators.
 */
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;

/** Strip separators and upper-case. Safe to call on anything, including empty input. */
export function normalizeIsrc(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * True when `raw` normalises to a well-formed ISRC.
 *
 * **Empty is not invalid.** An artist who has not distributed yet has no ISRC, and blocking them
 * would lock them out of publishing over a field they cannot answer. Callers decide what empty
 * means; this answers only "is what they typed a real ISRC".
 */
export function isValidIsrc(raw: string | null | undefined): boolean {
  return ISRC_PATTERN.test(normalizeIsrc(raw));
}

/** `GXF972652851` -> `GX-F97-26-52851`. Returns the input unchanged if it is not well-formed. */
export function formatIsrcForDisplay(raw: string | null | undefined): string {
  const n = normalizeIsrc(raw);
  if (!ISRC_PATTERN.test(n)) return raw ?? "";
  return `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5, 7)}-${n.slice(7)}`;
}

/**
 * What an artist declared when they published.
 *
 * Everything added in v1.1 is **optional**, for two separate reasons:
 *
 *  - Records signed under v1.0 must keep parsing. They are signed rights records; making a new
 *    field required would retroactively invalidate every one of them.
 *  - The new fields are *disclosure*, never a gate. The submit gate stays
 *    `notPro && ownsComposition && ownsMaster`. Requiring an ISRC or a licence reference would
 *    lock an artist out mid-upload over something they may not be able to answer yet.
 */
export interface RightsDeclaration {
  notPro: boolean;
  ownsComposition: boolean;
  ownsMaster: boolean;
  grantsPerformance: boolean;
  grantsMechanical: boolean;
  grantsMasterUse: boolean;
  containsSamples: boolean;
  samplesCleared: boolean;
  /** Normalised: upper-case, no separators. Empty when the artist has not distributed yet. */
  isrcCode: string;
  artistAddress: string;
  artistFid: string | number;
  accepted: boolean;
  acceptedAt: string;

  /** Which agreement text was accepted. Absent on records written before v1.1 — treat as '1.0'. */
  version?: string;

  // --- v1.1: licensed instrumental -------------------------------------------------------
  /**
   * Recorded over a purchased or licensed instrumental (a "type beat").
   *
   * This is the field the whole upgrade exists for. Those beats are licensed **non-exclusively**,
   * so the same instrumental is on other artists' releases. A recording built on one must not be
   * enrolled in YouTube Content ID / Meta Rights Manager / TikTok: a reference file would
   * false-claim every other legitimate licensee. Distributors reject releases over exactly this.
   */
  usedLicensedInstrumental?: boolean;
  instrumentalProducer?: string;
  instrumentalLicenceRef?: string;
  /** Whether the beat licence permits commercial distribution. Many restrict or forbid it. */
  licenceGrantsDistribution?: boolean;

  // --- v1.1: external distribution -------------------------------------------------------
  /** Already released to Spotify/Apple/etc. through the artist's own distributor. */
  distributedElsewhere?: boolean;
  distributorName?: string;
  /** Digits only. */
  releaseUPC?: string;
}

export interface RightsStatus {
  status: "cleared" | "pending" | "revoked";
  version: string;
  agreementCid: string;
  agreementHash: string;
  declaration: RightsDeclaration;
  tokenId: string;
  storedAt: string;
}

export function generateAgreementHash(
  agreementText: string,
  fid: string | number,
  address: string,
): string {
  return keccak256(
    encodePacked(
      ["string", "uint256", "address"],
      [agreementText, BigInt(fid), address as `0x${string}`],
    ),
  );
}

/**
 * Rebuild the agreement exactly as it was accepted.
 *
 * @param version Which published text to fill. Defaults to the declaration's own version, so a
 *        v1.0 record rebuilds against v1.0 text and its stored hash still matches. Passing the
 *        current version for an old record would produce a document that never existed.
 */
export function buildFilledAgreement(
  declaration: RightsDeclaration,
  tokenId?: string,
  agreementHash?: string,
  version?: string,
): string {
  const useVersion = version || declaration.version || "1.0";
  const template = agreementTextForVersion(useVersion);
  if (!template) {
    throw new Error(
      `Unknown rights agreement version "${useVersion}". Known: ${SUPPORTED_AGREEMENT_VERSIONS.join(", ")}.`,
    );
  }

  const samplesText = declaration.containsSamples
    ? declaration.samplesCleared
      ? "The Work contains samples from third-party recordings. The Artist has obtained all necessary clearances and licenses for these samples."
      : "The Work contains samples. Clearance status: PENDING."
    : "The Work does NOT contain any samples from third-party recordings.";

  const isrcText = declaration.isrcCode
    ? `ISRC: ${formatIsrcForDisplay(declaration.isrcCode)}`
    : "No ISRC code provided.";

  let filled = template
    .replace("{{VERSION}}", useVersion)
    .replace("{{DATE}}", declaration.acceptedAt || new Date().toISOString())
    .replace("{{ARTIST_ADDRESS}}", declaration.artistAddress)
    .replace("{{ARTIST_FID}}", String(declaration.artistFid))
    .replace("{{SAMPLES_DECLARATION}}", samplesText)
    .replace("{{ISRC_DECLARATION}}", isrcText)
    .replace("{{TOKEN_ID}}", tokenId || "PENDING")
    .replace("{{AGREEMENT_HASH}}", agreementHash || "PENDING");

  // v1.0 has no such placeholders, so these are no-ops on an old record.
  filled = filled
    .replace(
      "{{INSTRUMENTAL_DECLARATION}}",
      instrumentalDeclarationText(declaration),
    )
    .replace(
      "{{DISTRIBUTION_DECLARATION}}",
      distributionDeclarationText(declaration),
    );

  return filled;
}

export function instrumentalDeclarationText(d: RightsDeclaration): string {
  if (!d.usedLicensedInstrumental) {
    return "The Work does NOT incorporate a purchased or third-party licensed instrumental.";
  }

  const parts = ["The Work is recorded over a licensed instrumental."];
  if (d.instrumentalProducer)
    parts.push(`Producer: ${d.instrumentalProducer}.`);
  if (d.instrumentalLicenceRef)
    parts.push(`Licence reference: ${d.instrumentalLicenceRef}.`);
  parts.push(
    d.licenceGrantsDistribution
      ? "The Artist declares the licence permits commercial distribution."
      : "The Artist has NOT confirmed that the licence permits commercial distribution.",
  );
  parts.push(
    "Because the instrumental is licensed non-exclusively, this recording must NOT be enrolled in " +
      "content identification systems (YouTube Content ID, Meta Rights Manager, TikTok), as a " +
      "reference file would generate false claims against other legitimate licensees.",
  );
  return parts.join(" ");
}

export function distributionDeclarationText(d: RightsDeclaration): string {
  if (!d.distributedElsewhere) {
    return "The Work is not currently released through an external distributor.";
  }
  const parts = ["The Work is also released through an external distributor."];
  if (d.distributorName) parts.push(`Distributor: ${d.distributorName}.`);
  if (d.releaseUPC) parts.push(`UPC: ${d.releaseUPC}.`);
  parts.push(
    "This licence is non-exclusive and does not conflict with that release.",
  );
  return parts.join(" ");
}

/**
 * Re-derive a stored record's hash against the text version it was signed under.
 *
 * This is the "version the check" rule made concrete: a v1.0 record verifies against v1.0 text
 * and stays valid forever, rather than appearing tampered with the moment the agreement changes.
 */
export function verifyAgreementHash(status: RightsStatus): boolean {
  const version = status.version || status.declaration.version || "1.0";
  if (!agreementTextForVersion(version)) return false;

  const rebuilt = buildFilledAgreement(
    status.declaration,
    status.tokenId,
    undefined,
    version,
  );
  const expected = generateAgreementHash(
    rebuilt,
    status.declaration.artistFid,
    status.declaration.artistAddress,
  );
  return expected === status.agreementHash;
}

export async function storeRightsStatus(
  redis: Redis,
  tokenId: string,
  declaration: RightsDeclaration,
  agreementCid: string = "",
  agreementHash: string = "",
): Promise<void> {
  const status: RightsStatus = {
    status: "cleared",
    version: declaration.version || RIGHTS_AGREEMENT_VERSION,
    agreementCid,
    agreementHash,
    // Stamp the version onto the declaration itself as well as the envelope. The declaration
    // travels separately — it is pinned to IPFS by the upload route — and without this a copy
    // read back from IPFS could not say which agreement text it was signed under.
    declaration: {
      ...declaration,
      version: declaration.version || RIGHTS_AGREEMENT_VERSION,
    },
    tokenId,
    storedAt: new Date().toISOString(),
  };

  await redis.set(`rights:status:${tokenId}`, JSON.stringify(status));
}

export async function getRightsStatus(
  redis: Redis,
  tokenId: string,
): Promise<RightsStatus | null> {
  const data = await redis.get<string>(`rights:status:${tokenId}`);
  if (!data) return null;
  return typeof data === "string"
    ? JSON.parse(data)
    : (data as unknown as RightsStatus);
}

export async function hasRightsClearance(
  redis: Redis,
  tokenId: string,
): Promise<boolean> {
  const status = await getRightsStatus(redis, tokenId);
  // Legacy NFTs (no record) pass through
  if (!status) return true;
  return status.status === "cleared";
}

/**
 * Get all tokenIds with explicit 'cleared' rights status.
 * Used by Venue Player to build the PRO-free catalog.
 * Unlike hasRightsClearance(), this does NOT pass legacy NFTs through.
 */
export async function getClearedTokenIds(redis: Redis): Promise<string[]> {
  // Scan for all rights:status:* keys
  const cleared: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: "rights:status:*",
      count: 100,
    });
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor) : nextCursor;

    for (const key of keys) {
      const tokenId = (key as string).replace("rights:status:", "");
      const status = await getRightsStatus(redis, tokenId);
      if (status && status.status === "cleared") {
        cleared.push(tokenId);
      }
    }
  } while (cursor !== 0);

  return cleared;
}
