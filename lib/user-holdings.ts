/**
 * What a wallet owns, read from the contracts.
 *
 * ## Why this exists
 *
 * The indexer served a `MusicLicense` row per licence. Replacing that needs two things it did not
 * have to think about.
 *
 * **The catalogue is split across two contracts.** The v3 cutover left legacy licences on
 * `NEXT_PUBLIC_LEGACY_NFT_CONTRACT` and new ones on the v3 registry. A v3-only query misses the
 * old ones — verified: `0x868469e5…` reads `balanceOf 3` on legacy and `0` on v3. That is true
 * whether the answer comes from the chain or a healthy indexer, so the licences view was broken
 * for a reason restoring Envio would not have fixed.
 *
 * **The two generations disagree about time.** Legacy licences expire — `licensePeriod` is 30
 * days, and `0x868469e5…`'s three lapsed on 2026-03-06. v3 licences are perpetual;
 * `LicenseRegistry`'s header says expiry was dropped on purpose. So the legacy side must ask
 * `hasValidLicense`, not `balanceOf`, or it grants access that ended six months ago.
 *
 * ## Enumeration is not available, and is not needed
 *
 * `LicenseRegistry` is not `ERC721Enumerable` — there is no `tokenOfOwnerByIndex`. But
 * `_licensesHeld` is keyed `owner → masterId → count` with a public getter, so the loop runs over
 * **masters**, not licences. With five masters that is five reads, batched into one request.
 */

import type { Address, PublicClient } from "viem";
import { parseAbi } from "viem";

const V3_ABI = parseAbi([
  "function totalMasters() view returns (uint256)",
  "function licensesHeld(address owner, uint256 masterTokenId) view returns (uint32)",
  "function totalLicenses() view returns (uint256)",
]);

const LEGACY_ABI = parseAbi([
  "function hasValidLicense(address user, uint256 masterTokenId) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

/**
 * Legacy licence ids start here — `_licenseTokenCounter = 1000000`, incremented before use, so
 * the first licence is 1000001. The counter is `private` with no getter, so the count can only be
 * found by asking which ids exist.
 */
const LEGACY_LICENCE_ID_BASE = 1_000_000n;

/**
 * How far to probe for legacy licences.
 *
 * One batched request either way, so the cost is flat rather than per-licence — measured at 814ms
 * for 256 calls. Far above the four that exist, far below anything expensive. If the platform
 * ever sold more than this on the legacy contract the total would silently cap, so hitting the
 * limit is logged rather than assumed.
 */
const LEGACY_LICENCE_PROBE_LIMIT = 256;

export interface MasterHolding {
  masterTokenId: string;
  /** Perpetual licences held on the v3 registry. */
  v3Count: number;
  /** A legacy licence that has NOT expired. Legacy licences lapse after `licensePeriod`. */
  legacyValid: boolean;
}

export interface Holdings {
  address: string;
  /** Only masters the address actually holds something for. */
  masters: MasterHolding[];
  /** True when the address can play any master — the question most callers actually ask. */
  hasAny: boolean;
}

/**
 * Licences held by one address, across both contract generations.
 *
 * Failures degrade to "holds nothing for that master" rather than throwing: a licence view that
 * errors is worse than one that under-reports, because a caller can retry a page but cannot
 * recover a thrown request. `allowFailure` on both batches does that work.
 */
export async function getLicenceHoldings(
  client: PublicClient,
  owner: string,
  opts: { registry?: Address; legacy?: Address } = {},
): Promise<Holdings> {
  const registry =
    opts.registry ??
    (process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined);
  const legacy =
    opts.legacy ??
    (process.env.NEXT_PUBLIC_LEGACY_NFT_CONTRACT as Address | undefined);

  const empty: Holdings = { address: owner, masters: [], hasAny: false };
  if (!owner || !registry) return empty;

  let total: bigint;
  try {
    total = (await client.readContract({
      address: registry,
      abi: V3_ABI,
      functionName: "totalMasters",
    })) as bigint;
  } catch {
    return empty;
  }
  if (total === 0n) return empty;

  const ids: bigint[] = [];
  for (let id = 1n; id <= total; id++) ids.push(id);

  const [v3, legacyResults] = await Promise.all([
    client.multicall({
      contracts: ids.map((id) => ({
        address: registry,
        abi: V3_ABI,
        functionName: "licensesHeld" as const,
        args: [owner as Address, id] as const,
      })),
      allowFailure: true,
    }),
    legacy
      ? client.multicall({
          contracts: ids.map((id) => ({
            address: legacy,
            abi: LEGACY_ABI,
            // Honours expiry, which is the whole reason this is not a balance check.
            functionName: "hasValidLicense" as const,
            args: [owner as Address, id] as const,
          })),
          allowFailure: true,
        })
      : Promise.resolve([]),
  ]);

  const masters: MasterHolding[] = [];
  ids.forEach((id, i) => {
    const a = v3[i];
    const b = legacyResults[i];
    const v3Count =
      a?.status === "success" ? Number(a.result as number | bigint) : 0;
    const legacyValid = b?.status === "success" ? Boolean(b.result) : false;
    if (v3Count > 0 || legacyValid) {
      masters.push({ masterTokenId: id.toString(), v3Count, legacyValid });
    }
  });

  return { address: owner, masters, hasAny: masters.length > 0 };
}

/** Does this address hold a playable licence for one master? */
export async function hasLicenceFor(
  client: PublicClient,
  owner: string,
  masterTokenId: string | number,
  opts: { registry?: Address; legacy?: Address } = {},
): Promise<boolean> {
  const holdings = await getLicenceHoldings(client, owner, opts);
  const wanted = String(masterTokenId);
  return holdings.masters.some((m) => m.masterTokenId === wanted);
}

export interface CatalogueTotals {
  totalMasters: number;
  totalLicenses: number;
}

/**
 * Platform totals — what the indexer's `GlobalStats` provided.
 *
 * Counts BOTH generations, because the dashboard labels this "Purchases": a lifetime count of
 * licences sold, not of currently-valid ones. Reading only the v3 registry would report 1 where
 * 5 have been sold, turning a real number into a misleading one.
 *
 * There is no double-counting to worry about: licences were never migrated between the contracts.
 * `migrateLegacy` mints a v3 licence for a legacy one and is still unrun — see DEPLOYMENT_PLAN
 * "NOT YET LIVE" — so a licence exists on exactly one side today. **If that migration is ever
 * run, this becomes a double count and must be revisited.**
 *
 * Worth noting the indexer under-reported here too: it watched only the legacy contract, so its
 * `totalMusicLicensesPurchased` of 4 already missed the v3 licence.
 */
export async function getCatalogueTotals(
  client: PublicClient,
  registryAddress?: Address,
): Promise<CatalogueTotals> {
  const registry =
    registryAddress ??
    (process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined);
  if (!registry) return { totalMasters: 0, totalLicenses: 0 };

  const legacy = process.env.NEXT_PUBLIC_LEGACY_NFT_CONTRACT as
    | Address
    | undefined;

  const [v3Totals, legacyOwners] = await Promise.all([
    client.multicall({
      contracts: [
        {
          address: registry,
          abi: V3_ABI,
          functionName: "totalMasters" as const,
        },
        {
          address: registry,
          abi: V3_ABI,
          functionName: "totalLicenses" as const,
        },
      ],
      allowFailure: true,
    }),
    legacy
      ? client.multicall({
          contracts: Array.from(
            { length: LEGACY_LICENCE_PROBE_LIMIT },
            (_, i) => ({
              address: legacy,
              abi: LEGACY_ABI,
              functionName: "ownerOf" as const,
              args: [LEGACY_LICENCE_ID_BASE + BigInt(i + 1)] as const,
            }),
          ),
          allowFailure: true,
        })
      : Promise.resolve([]),
  ]);

  const [masters, licenses] = v3Totals;
  const legacyCount = legacyOwners.filter(
    (r) => r?.status === "success",
  ).length;

  if (legacyCount === LEGACY_LICENCE_PROBE_LIMIT) {
    console.warn(
      `[holdings] legacy licence probe hit its ${LEGACY_LICENCE_PROBE_LIMIT} cap — the total is a floor, not a count`,
    );
  }

  const v3Count =
    licenses?.status === "success" ? Number(licenses.result as bigint) : 0;

  return {
    totalMasters:
      masters?.status === "success" ? Number(masters.result as bigint) : 0,
    totalLicenses: v3Count + legacyCount,
  };
}
