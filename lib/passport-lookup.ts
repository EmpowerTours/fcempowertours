/**
 * Every passport an address holds, read from the contracts.
 *
 * ## The problem this solves
 *
 * The indexer answered `PassportNFT(where: {owner: $address})` — give me everything this wallet
 * holds. The contract cannot answer that question. `PassportNFTV4` offers only
 * `getPassportByAddress(address, countryCode)`: it can confirm a passport for a country you name,
 * and there is no enumerator.
 *
 * So the question is inverted — ask about every country instead of every token. That sounds
 * expensive and is not, because `Multicall3` turns 195 reads into one request. Measured on the
 * free public RPC, cold: **1202ms for all 195**, and it returns the right answer (`0x33fFCcb1…`
 * resolves to MX, FR, CN — exactly the three passports the v3 migration moved).
 *
 * `contract-generation.ts` already had `findPassport`, which loops the same codes **sequentially**
 * and returns the FIRST hit. That shape suits "does this person have a passport at all"; it
 * cannot answer "which ones", and at 195 codes the sequential version would be minutes.
 *
 * ## Why this must exist rather than the indexer being repaired
 *
 * The envio config's passport entry is named `PassportNFTV2`, points at an address its own
 * comment calls **V3**, and the live contract is **V4**. The indexer has been two generations
 * behind since the cutover, so it cannot serve passports correctly even fully caught up — it
 * would miss every passport minted since, including the three that were migrated.
 */

import type { Address, PublicClient } from "viem";
import { parseAbi } from "viem";

const PASSPORT_ABI = parseAbi([
  "function getPassportByAddress(address user, string countryCode) view returns (uint256)",
  "function getPassportByFid(uint256 fid, string countryCode) view returns (uint256)",
  // A struct return is ONE tuple, not nine values — they ABI-encode differently, and declaring
  // it flat made every detail read fail. The failure was invisible because the fallback below
  // keeps the passport with empty fields, so the UI showed three passports with no country
  // names rather than an error.
  "function getPassportData(uint256 tokenId) view returns ((uint256 userFid, string countryCode, string countryName, string region, string continent, uint256 mintedAt, bool verified, string verificationProof, uint256 verifiedAt))",
]);

export interface PassportRef {
  tokenId: string;
  countryCode: string;
}

export interface PassportDetail extends PassportRef {
  countryName: string;
  region: string;
  continent: string;
  mintedAt: number;
  verified: boolean;
  userFid: number;
}

/**
 * Which passports an address holds.
 *
 * Pass the country list rather than importing it, so the caller controls the search space — a
 * page that already knows the user is in Mexico can pass one code instead of 195.
 *
 * `byFid` is a fallback, not the primary: under V4 a holder with no Farcaster account is
 * deliberately absent from the FID index, so the address lookup is the only one that sees
 * everyone. The FID path exists because legacy passports predate the address view.
 */
export async function findAllPassports(
  client: PublicClient,
  opts: {
    passportAddress: Address;
    countryCodes: readonly string[];
    address?: Address;
    fid?: number;
  },
): Promise<PassportRef[]> {
  const { passportAddress, countryCodes, address, fid } = opts;
  if (countryCodes.length === 0) return [];
  if (!address && !fid) return [];

  const useAddress = Boolean(address);

  const results = await client.multicall({
    contracts: countryCodes.map((code) => ({
      address: passportAddress,
      abi: PASSPORT_ABI,
      functionName: useAddress
        ? ("getPassportByAddress" as const)
        : ("getPassportByFid" as const),
      args: useAddress
        ? ([address as Address, code] as const)
        : ([BigInt(fid ?? 0), code] as const),
    })),
    // A country with no passport is the ordinary case, not an error. Some revert rather than
    // returning 0, so failures are simply "no passport here".
    allowFailure: true,
  });

  const found: PassportRef[] = [];
  countryCodes.forEach((code, i) => {
    const r = results[i];
    if (r?.status !== "success") return;
    const tokenId = r.result as bigint;
    if (tokenId > 0n)
      found.push({ tokenId: tokenId.toString(), countryCode: code });
  });

  return found;
}

/**
 * Fill in the details for passports already found.
 *
 * Separate from the search on purpose: the search touches 195 countries and finds a handful, so
 * fetching metadata for every candidate would be 195 wasted reads. One batch for the hits.
 */
export async function getPassportDetails(
  client: PublicClient,
  passportAddress: Address,
  refs: readonly PassportRef[],
): Promise<PassportDetail[]> {
  if (refs.length === 0) return [];

  const results = await client.multicall({
    contracts: refs.map((r) => ({
      address: passportAddress,
      abi: PASSPORT_ABI,
      functionName: "getPassportData" as const,
      args: [BigInt(r.tokenId)] as const,
    })),
    allowFailure: true,
  });

  const out: PassportDetail[] = [];
  refs.forEach((ref, i) => {
    const r = results[i];
    if (r?.status !== "success") {
      // A passport that answered the ownership question but not the detail one still exists.
      // Returning it with empty fields beats dropping it and showing the holder fewer than they
      // have.
      out.push({
        ...ref,
        countryName: "",
        region: "",
        continent: "",
        mintedAt: 0,
        verified: false,
        userFid: 0,
      });
      return;
    }
    // A named-field struct decodes as an OBJECT, unlike multiple named returns which decode as
    // a tuple. Both shapes appear in this codebase; reading one as the other yields undefined
    // everywhere rather than an error.
    const d = r.result as {
      userFid?: bigint;
      countryCode?: string;
      countryName?: string;
      region?: string;
      continent?: string;
      mintedAt?: bigint;
      verified?: boolean;
    };
    out.push({
      tokenId: ref.tokenId,
      countryCode: d.countryCode || ref.countryCode,
      countryName: d.countryName || "",
      region: d.region || "",
      continent: d.continent || "",
      mintedAt: Number(d.mintedAt ?? 0),
      verified: Boolean(d.verified),
      userFid: Number(d.userFid ?? 0),
    });
  });

  return out;
}
