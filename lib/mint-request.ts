/**
 * EIP-712 mint requests for the v3 `SalesController`.
 *
 * ## Why minting changed shape
 *
 * The V2 NFT let the platform call `mintMaster` and simply assert who the artist was. v3 does not:
 * `LicenseRegistry.mintMaster` is controller-only, and the controller is required to *prove* the
 * artist consented. `SalesController.mintMasterFor` takes that proof as a signature over the mint
 * payload, so the relayer can pay the gas without being able to mint in someone else's name.
 *
 * ## Getting this wrong is silent
 *
 * The struct below must match `SalesController.MINT_TYPEHASH` field for field, in order, with the
 * exact Solidity types. EIP-712 hashes the *type string*, so a renamed field, a reordered one, or
 * `uint256` where the contract says `uint96` produces a different digest, which recovers a
 * different address, which fails as `BadSignature` — with nothing to say why. `tools/verify-mint-request.ts`
 * pins the type string against the contract source so a drift fails locally rather than on-chain.
 */

import type { Address, Hex, TypedDataDomain } from "viem";

/** Matches `EIP712("EmpowerToursSales", "1")` in the contract constructor. */
export const MINT_DOMAIN_NAME = "EmpowerToursSales";
export const MINT_DOMAIN_VERSION = "1";

/**
 * The EIP-712 type. Field order is load-bearing — it is hashed as a string, so this must read
 * identically to `MINT_TYPEHASH` in SalesController.sol.
 */
export const MINT_REQUEST_TYPES = {
  MintRequest: [
    { name: "artist", type: "address" },
    { name: "artistFid", type: "uint256" },
    { name: "uri", type: "string" },
    { name: "maxCollectorEditions", type: "uint32" },
    { name: "referrer", type: "address" },
    { name: "royaltyBps", type: "uint96" },
    { name: "nftType", type: "uint8" },
    { name: "price", type: "uint256" },
    { name: "collectorPrice", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** The canonical type string, for comparison against the contract in tests. */
export const MINT_REQUEST_TYPE_STRING =
  "MintRequest(address artist,uint256 artistFid,string uri,uint32 maxCollectorEditions,address referrer,uint96 royaltyBps,uint8 nftType,uint256 price,uint256 collectorPrice,uint256 nonce,uint256 deadline)";

export interface MintRequest {
  artist: Address;
  /** 0 when the artist has no Farcaster account. Optional since v3. */
  artistFid: bigint;
  uri: string;
  maxCollectorEditions: number;
  referrer: Address;
  royaltyBps: number;
  /** 0 = MUSIC, 1 = ART. */
  nftType: number;
  price: bigint;
  collectorPrice: bigint;
  nonce: bigint;
  deadline: bigint;
}

export const ZERO_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

export function mintDomain(
  chainId: number,
  salesController: Address,
): TypedDataDomain {
  return {
    name: MINT_DOMAIN_NAME,
    version: MINT_DOMAIN_VERSION,
    chainId,
    verifyingContract: salesController,
  };
}

/**
 * Build a mint request with sane defaults.
 *
 * The nonce is per-signer and consumed on use (`usedNonces[signer][nonce]`), so it only has to be
 * unique for this artist — not globally. A timestamp in milliseconds is unique enough for a human
 * minting tracks and needs no extra round trip to read a counter.
 */
export function buildMintRequest(input: {
  artist: Address;
  uri: string;
  artistFid?: number | bigint;
  maxCollectorEditions?: number;
  referrer?: Address;
  royaltyBps?: number;
  nftType?: number;
  price: bigint;
  collectorPrice?: bigint;
  nonce?: bigint;
  /** Seconds the signature stays valid. Short by default: it authorises a mint. */
  ttlSeconds?: number;
  now?: number;
}): MintRequest {
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  const ttl = input.ttlSeconds ?? 30 * 60;

  return {
    artist: input.artist,
    artistFid: BigInt(input.artistFid ?? 0),
    uri: input.uri,
    maxCollectorEditions: input.maxCollectorEditions ?? 0,
    // A referrer equal to the artist is discarded by the registry, so self-referral is harmless.
    referrer: input.referrer ?? ZERO_ADDRESS,
    royaltyBps: input.royaltyBps ?? 500,
    nftType: input.nftType ?? 0,
    price: input.price,
    collectorPrice: input.collectorPrice ?? 0n,
    nonce: input.nonce ?? BigInt(input.now ?? Date.now()),
    deadline: BigInt(nowSeconds + ttl),
  };
}

/**
 * Reject a request the contract will reject anyway, before a wallet prompt is raised.
 *
 * `HARD_MAX_ROYALTY_BPS` and `MAX_COLLECTOR_EDITIONS` live in `LicenseRegistry`; these mirror them
 * so a user gets a sentence instead of an opaque revert. The contract remains the authority.
 *
 * @param now Milliseconds since epoch. Injected rather than read from the clock so the expiry
 *        branch is testable — a function that reads `Date.now()` internally can only be tested
 *        against whatever time it happens to be run at.
 */
export function validateMintRequest(
  req: MintRequest,
  now: number = Date.now(),
): string | null {
  if (!req.artist || req.artist === ZERO_ADDRESS)
    return "Artist address is required.";
  if (!req.uri || req.uri.trim().length === 0)
    return "Track metadata URI is required.";
  if (req.royaltyBps > 5000) return "Royalty cannot exceed 50%.";
  if (req.maxCollectorEditions < 0)
    return "Collector editions cannot be negative.";
  if (req.nftType !== 0 && req.nftType !== 1)
    return "Type must be music or art.";
  if (req.deadline <= BigInt(Math.floor(now / 1000)))
    return "This request has already expired — try again.";
  return null;
}

/**
 * The mint terms a client claims it is minting, alongside the signed request.
 *
 * The relayer receives both: a signed `MintRequest`, and loose parameters used for the success
 * response, the Farcaster cast and the UI. Only the former is enforced on-chain.
 */
export interface ClaimedMintTerms {
  uri: string;
  price: bigint;
  collectorPrice: bigint;
  maxCollectorEditions: number;
  nftType: number;
}

/**
 * Describe the first way a signed request disagrees with what the caller says it is minting,
 * or `null` if they agree.
 *
 * ## Why this is checked at all
 *
 * The signature covers the request; it does not cover the loose parameters sent beside it. The
 * chain will mint exactly what was signed, but the response and the cast are built from the
 * parameters — so a disagreement publishes an edition on terms nobody agreed to. Nothing reverts,
 * because nothing is wrong on-chain. The mismatch is only ever visible here.
 *
 * Returns a description rather than a boolean so the caller can say *which* field disagreed.
 * "Sign again" without naming the field is a dead end for whoever hits it.
 */
export function describeMintRequestMismatch(
  signed: MintRequest,
  claimed: ClaimedMintTerms,
): string | null {
  if (signed.maxCollectorEditions !== claimed.maxCollectorEditions) {
    return `editions (signed ${signed.maxCollectorEditions}, requested ${claimed.maxCollectorEditions})`;
  }
  if (signed.collectorPrice !== claimed.collectorPrice) {
    return `collector price (signed ${signed.collectorPrice}, requested ${claimed.collectorPrice})`;
  }
  if (signed.price !== claimed.price) {
    return `standard price (signed ${signed.price}, requested ${claimed.price})`;
  }
  if (signed.nftType !== claimed.nftType) {
    return `NFT type (signed ${signed.nftType}, requested ${claimed.nftType})`;
  }
  if (signed.uri !== claimed.uri) return "metadata URI";
  return null;
}

/**
 * Serialise for transport to the relayer. BigInts do not survive `JSON.stringify`.
 */
export function serializeMintRequest(
  req: MintRequest,
): Record<string, string | number> {
  return {
    artist: req.artist,
    artistFid: req.artistFid.toString(),
    uri: req.uri,
    maxCollectorEditions: req.maxCollectorEditions,
    referrer: req.referrer,
    royaltyBps: req.royaltyBps,
    nftType: req.nftType,
    price: req.price.toString(),
    collectorPrice: req.collectorPrice.toString(),
    nonce: req.nonce.toString(),
    deadline: req.deadline.toString(),
  };
}

/**
 * Rebuild a request server-side.
 *
 * Every numeric field is parsed explicitly rather than spread from the body: the values go
 * straight into a signed payload, and a `undefined` silently becoming `0` would change what is
 * minted while still verifying, because the signature covers whatever we reconstruct here.
 */
export function deserializeMintRequest(
  raw: unknown,
): MintRequest | { error: string } {
  if (!raw || typeof raw !== "object")
    return { error: "mintRequest must be an object" };
  const r = raw as Record<string, unknown>;

  const str = (k: string): string | null =>
    typeof r[k] === "string" && r[k] ? (r[k] as string) : null;
  const big = (k: string): bigint | null => {
    const v = r[k];
    if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
    if (typeof v === "number" && Number.isInteger(v) && v >= 0)
      return BigInt(v);
    return null;
  };
  const num = (k: string): number | null => {
    const v = r[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    return null;
  };

  const artist = str("artist");
  const uri = str("uri");
  const referrer = str("referrer") ?? ZERO_ADDRESS;
  const artistFid = big("artistFid");
  const price = big("price");
  const collectorPrice = big("collectorPrice");
  const nonce = big("nonce");
  const deadline = big("deadline");
  const maxCollectorEditions = num("maxCollectorEditions");
  const royaltyBps = num("royaltyBps");
  const nftType = num("nftType");

  const missing = Object.entries({
    artist,
    uri,
    artistFid,
    price,
    collectorPrice,
    nonce,
    deadline,
    maxCollectorEditions,
    royaltyBps,
    nftType,
  })
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  if (missing.length)
    return { error: `mintRequest missing or malformed: ${missing.join(", ")}` };

  return {
    artist: artist as Address,
    artistFid: artistFid as bigint,
    uri: uri as string,
    maxCollectorEditions: maxCollectorEditions as number,
    referrer: referrer as Address,
    royaltyBps: royaltyBps as number,
    nftType: nftType as number,
    price: price as bigint,
    collectorPrice: collectorPrice as bigint,
    nonce: nonce as bigint,
    deadline: deadline as bigint,
  };
}

/** ABI for the relayed call. */
export const MINT_MASTER_FOR_ABI = [
  {
    name: "mintMasterFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "req",
        type: "tuple",
        components: [
          { name: "artist", type: "address" },
          { name: "artistFid", type: "uint256" },
          { name: "uri", type: "string" },
          { name: "maxCollectorEditions", type: "uint32" },
          { name: "referrer", type: "address" },
          { name: "royaltyBps", type: "uint96" },
          { name: "nftType", type: "uint8" },
          { name: "price", type: "uint256" },
          { name: "collectorPrice", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "masterTokenId", type: "uint256" }],
  },
] as const;

/** Tuple form for `encodeFunctionData`, in the contract's field order. */
export function mintRequestTuple(req: MintRequest) {
  return {
    artist: req.artist,
    artistFid: req.artistFid,
    uri: req.uri,
    maxCollectorEditions: req.maxCollectorEditions,
    referrer: req.referrer,
    royaltyBps: BigInt(req.royaltyBps),
    nftType: req.nftType,
    price: req.price,
    collectorPrice: req.collectorPrice,
    nonce: req.nonce,
    deadline: req.deadline,
  } as const;
}

export type SignedMintRequest = {
  request: MintRequest;
  signature: Hex;
};
