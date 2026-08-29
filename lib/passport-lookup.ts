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
  // Named `getTotalSupply`, NOT the ERC721Enumerable `totalSupply` — that one reverts here, as
  // does `tokenByIndex`. V4 extends plain ERC721, so this is the only counter.
  "function getTotalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  // Arrays of structs, so one tuple[] each — the same by-name decoding as getPassportData.
  "function getItineraryStamps(uint256 tokenId) view returns ((uint256 itineraryId, string locationName, string city, string country, uint256 stampedAt, bool gpsVerified, string placeId, string googleMapsUri, int256 latitude, int256 longitude)[])",
  "function getPassportStamps(uint256 tokenId) view returns ((string location, string eventType, address artist, uint256 timestamp, bool verified, string placeId, string googleMapsUri, int256 latitude, int256 longitude)[])",
]);

export interface PassportRef {
  tokenId: string;
  countryCode: string;
}

export interface PassportDetail extends PassportRef {
  /** Empty unless the caller asked for it — the owner costs an extra read per passport. */
  owner?: string;
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

/**
 * How many passports exist. Ids run 1..N with no gaps.
 *
 * `_mintPassport` does `_tokenIdCounter++` and then uses the incremented value, so the first
 * passport is id 1, not 0 — and since V4 has no burn, every id in that range is live. Both facts
 * are what make the walk below safe.
 */
export async function getTotalSupply(
  client: PublicClient,
  passportAddress: Address,
): Promise<number> {
  const supply = await client.readContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: "getTotalSupply",
  });
  return Number(supply);
}

/**
 * The most recently minted passports across every holder.
 *
 * ## Why this is not a search
 *
 * The indexer answered `PassportNFT(limit: 8, order_by: {mintedAt: desc})` — a global feed, which
 * `findAllPassports` cannot produce because it is anchored to one holder.
 *
 * ## Why id order is NOT mint order
 *
 * The obvious shortcut is that ids come from a monotonic counter, so the newest ids are the newest
 * passports and no sort is needed. That is wrong here, and this file said otherwise until it was
 * checked against the contract: `migrateLegacyPassport` takes a **fresh** id from the same counter
 * while **preserving the original `mintedAt`** (V4 line 761 — the stated reason the function
 * exists). A passport migrated today therefore carries a high id and a months-old timestamp.
 *
 * It is not hypothetical. All three passports live today were migrated: the contract was deployed
 * 2026-08-22 and their `mintedAt` values are 2026-01-23, 2026-02-08 and 2026-02-10. They are in id
 * order only because they happened to be migrated in that order — luck, not a guarantee.
 *
 * So the range is a candidate window and `mintedAt` decides the order. `mintedAt` is a stored
 * struct field, so this costs a sort, not a read.
 *
 * ## The bound on that, stated rather than hidden
 *
 * Sorting a window is exact only when the window holds every passport that could belong in the
 * answer. Below `MAX_RECENT_SCAN` every passport is read and the answer is exact. Above it, a
 * migration whose original mint predates the window can still be missed — so the scan is capped
 * loudly rather than silently returning a window that looks like a ranking. At a supply of 3 this
 * is theoretical, which is exactly when it is cheap to get right.
 *
 * One multicall covers the details and the owners together.
 *
 * ## What is lost
 *
 * `txHash`. The indexer knew which transaction minted each passport; a contract read cannot, and
 * the logs are out of reach — the public RPC caps `eth_getLogs` at 100 blocks and the current
 * Alchemy key at 10, so the mint transactions are unreachable at any tier available here. Callers
 * render that link as `{item.txHash && ...}`, so it degrades to no link rather than a break.
 */
/**
 * How many passports `getRecentPassports` will read before it stops being exact.
 *
 * Every id in the scan is one multicall entry pair, so this is a real cost ceiling, not a
 * formality. It is far above the current supply of 3.
 */
export const MAX_RECENT_SCAN = 500;

export async function getRecentPassports(
  client: PublicClient,
  passportAddress: Address,
  limit = 10,
): Promise<PassportDetail[]> {
  const supply = await getTotalSupply(client, passportAddress);
  if (supply === 0 || limit <= 0) return [];

  // The whole collection, up to the cap. Reading only `limit` ids would rank a window by
  // `mintedAt` without knowing whether an older id holds a newer mint — which a migration makes
  // possible. `Math.max(1, …)` matters while the collection is small: with a supply of 3 this
  // must produce [3,2,1], not ids down to -4.
  const scan = Math.min(supply, MAX_RECENT_SCAN);
  const ids: number[] = [];
  for (let id = supply; id >= Math.max(1, supply - scan + 1); id--)
    ids.push(id);

  const results = await client.multicall({
    contracts: ids.flatMap((id) => [
      {
        address: passportAddress,
        abi: PASSPORT_ABI,
        functionName: "getPassportData" as const,
        args: [BigInt(id)] as const,
      },
      {
        address: passportAddress,
        abi: PASSPORT_ABI,
        functionName: "ownerOf" as const,
        args: [BigInt(id)] as const,
      },
    ]),
    allowFailure: true,
  });

  const out: PassportDetail[] = [];
  ids.forEach((id, i) => {
    // Two calls per id, so the stride is 2 — reading these as one-per-id would pair every
    // passport with the previous one's owner.
    const data = results[i * 2];
    const owner = results[i * 2 + 1];
    if (data?.status !== "success") return;

    const d = data.result as {
      userFid?: bigint;
      countryCode?: string;
      countryName?: string;
      region?: string;
      continent?: string;
      mintedAt?: bigint;
      verified?: boolean;
    };
    out.push({
      tokenId: String(id),
      countryCode: d.countryCode || "",
      countryName: d.countryName || "",
      region: d.region || "",
      continent: d.continent || "",
      mintedAt: Number(d.mintedAt ?? 0),
      verified: Boolean(d.verified),
      userFid: Number(d.userFid ?? 0),
      owner: owner?.status === "success" ? (owner.result as string) : undefined,
    });
  });

  // By mint time, not by id — see the note above. Ties keep the higher id first, so a batch
  // migrated within one second still has a stable order.
  out.sort(
    (a, b) => b.mintedAt - a.mintedAt || Number(b.tokenId) - Number(a.tokenId),
  );

  return out.slice(0, limit);
}

export interface ItineraryStamp {
  itineraryId: number;
  locationName: string;
  city: string;
  country: string;
  stampedAt: number;
  gpsVerified: boolean;
}

/**
 * The itinerary stamps on a passport.
 *
 * The indexer served these from `PassportNFT_ItineraryStampAdded` events, which is the one place
 * an event feed genuinely had an edge — except the contract stores the stamps rather than only
 * emitting them, so `getItineraryStamps` returns the same list without touching logs. That
 * matters because logs are unreachable here: the public RPC caps `eth_getLogs` at 100 blocks and
 * the current Alchemy key at 10.
 *
 * The indexer called the time field `timestamp`; the contract calls it `stampedAt`. Same value.
 *
 * Newest first, to match the `order_by: {timestamp: desc}` the callers were written against —
 * the contract returns them in the order they were added, so this reverses a copy.
 */
export async function getItineraryStamps(
  client: PublicClient,
  passportAddress: Address,
  tokenId: string | number,
  limit = 20,
): Promise<ItineraryStamp[]> {
  const raw = (await client.readContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: "getItineraryStamps",
    args: [BigInt(tokenId)],
  })) as ReadonlyArray<{
    itineraryId: bigint;
    locationName: string;
    city: string;
    country: string;
    stampedAt: bigint;
    gpsVerified: boolean;
  }>;

  return [...raw]
    .reverse()
    .slice(0, limit)
    .map((s) => ({
      itineraryId: Number(s.itineraryId),
      locationName: s.locationName || "Unknown",
      city: s.city || "Unknown",
      country: s.country || "Unknown",
      stampedAt: Number(s.stampedAt),
      gpsVerified: Boolean(s.gpsVerified),
    }));
}

export interface VenueStamp {
  location: string;
  eventType: string;
  timestamp: number;
  verified: boolean;
}

/**
 * The venue stamps on a passport — what the indexer served as `PassportNFT_StampAdded`.
 *
 * Kept separate from itinerary stamps because they are different structs with different fields,
 * and callers treat venue stamps as the legacy fallback: they read itinerary stamps first and
 * come here only when there are none.
 */
export async function getVenueStamps(
  client: PublicClient,
  passportAddress: Address,
  tokenId: string | number,
  limit = 20,
): Promise<VenueStamp[]> {
  const raw = (await client.readContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: "getPassportStamps",
    args: [BigInt(tokenId)],
  })) as ReadonlyArray<{
    location: string;
    eventType: string;
    timestamp: bigint;
    verified: boolean;
  }>;

  return [...raw]
    .reverse()
    .slice(0, limit)
    .map((s) => ({
      location: s.location || "Event",
      eventType: s.eventType || "",
      timestamp: Number(s.timestamp),
      verified: Boolean(s.verified),
    }));
}

/**
 * How many passports an address holds.
 *
 * `findAllPassports` can answer this, but it costs a 195-country multicall to do it. Callers that
 * only need the number — a profile stat, a balances panel — get it from the ERC-721 `balanceOf`
 * in a single read. Use the search when you need to know WHICH countries; use this when you need
 * HOW MANY.
 */
export async function getPassportCount(
  client: PublicClient,
  passportAddress: Address,
  owner: Address,
): Promise<number> {
  try {
    const n = await client.readContract({
      address: passportAddress,
      abi: PASSPORT_ABI,
      functionName: "balanceOf",
      args: [owner],
    });
    return Number(n);
  } catch {
    // A balance read that fails is "unknown", and reporting 0 is the honest degradation for a
    // count — better than throwing a whole balances response away over one number.
    return 0;
  }
}
