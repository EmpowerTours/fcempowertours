import { parseAbi, type Address, type Hex } from "viem";

/**
 * Direct licence resale: the seller signs terms, the buyer executes them.
 *
 * No listing board and no escrow. The seller signs a SaleOrder off-chain — free,
 * no gas, no transaction — and that signature travels in a link. Whoever opens
 * the link and pays gets the licence. Both sides consent to the same terms: the
 * seller by signature, the buyer by being msg.sender and paying.
 *
 * The link cannot be spent by being previewed. `executeSale` requires payment
 * from the caller, and the nonce is consumed on chain, so a chat app fetching
 * the URL for a preview card does nothing. That is the contract's guarantee,
 * not this file's.
 *
 * Royalty is ERC-2981 and automatic: `royaltyInfo(licenseId, price)` is paid to
 * the master's artist and the seller receives the remainder. Standard licences
 * carry 50%, limited editions 7.5% — snapshotted per token when it was minted,
 * so a later governance change cannot alter a licence somebody already bought.
 *
 * `tools/verify-sale-order.ts` pins the struct and typehash against the Solidity.
 * A field out of order here reverts as BadSignature with no clue which one.
 */

/** Matches `EIP712("EmpowerToursSales", "1")` in the contract constructor. */
export const SALE_DOMAIN_NAME = "EmpowerToursSales";
export const SALE_DOMAIN_VERSION = "1";

/** Field order is consensus-critical: it is hashed positionally. */
export const SALE_ORDER_TYPES = {
  SaleOrder: [
    { name: "licenseId", type: "uint256" },
    { name: "seller", type: "address" },
    { name: "price", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const SALES_CONTROLLER_SALE_ABI = parseAbi([
  "function executeSale((uint256 licenseId,address seller,uint256 price,uint256 nonce,uint256 deadline) order, bytes sellerSignature) external",
  "function usedNonces(address signer, uint256 nonce) view returns (bool)",
]);

export interface SaleOrder {
  licenseId: bigint;
  seller: Address;
  price: bigint;
  nonce: bigint;
  deadline: bigint;
}

export function saleDomain(chainId: number, verifyingContract: Address) {
  return {
    name: SALE_DOMAIN_NAME,
    version: SALE_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };
}

/**
 * A 30-day default, because there is no cancel button.
 *
 * Nothing on chain revokes a signed order: the only way to void one is to spend
 * its nonce, which costs a transaction. An offer that expires on its own is the
 * difference between changing your mind and being stuck with a price you set
 * months ago.
 */
export const DEFAULT_SALE_WINDOW_SECONDS = 30 * 24 * 60 * 60;

export function buildSaleOrder(input: {
  licenseId: bigint;
  seller: Address;
  price: bigint;
  /** Defaults to 30 days from now. */
  deadline?: bigint;
  nonce?: bigint;
}): SaleOrder {
  return {
    licenseId: input.licenseId,
    seller: input.seller,
    price: input.price,
    nonce: input.nonce ?? randomNonce(),
    deadline:
      input.deadline ??
      BigInt(Math.floor(Date.now() / 1000) + DEFAULT_SALE_WINDOW_SECONDS),
  };
}

/**
 * A random nonce, not a counter.
 *
 * `usedNonces` is a mapping, not a sequence, so orders need not be consumed in
 * order — which matters because a seller may have several offers outstanding and
 * a counter would let an early one invalidate a later one.
 */
function randomNonce(): bigint {
  const b = new Uint8Array(16);
  // globalThis.crypto only. A `require("node:crypto")` fallback here broke the
  // client bundle outright -- webpack cannot resolve a node: scheme for code
  // that ships to a browser, and the page 500s before rendering. Web Crypto is
  // present in every browser and in Node 18+, so there is nothing to fall back
  // to.
  globalThis.crypto.getRandomValues(b);
  return BigInt(
    "0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join(""),
  );
}

/** For signTypedData: every value a string, so nothing is lost to JSON. */
export function saleMessage(order: SaleOrder): Record<string, string> {
  return {
    licenseId: order.licenseId.toString(),
    seller: order.seller,
    price: order.price.toString(),
    nonce: order.nonce.toString(),
    deadline: order.deadline.toString(),
  };
}

/** Pack an order and its signature into a URL-safe token. */
export function encodeSaleLink(order: SaleOrder, signature: Hex): string {
  const payload = JSON.stringify({
    l: order.licenseId.toString(),
    s: order.seller,
    p: order.price.toString(),
    n: order.nonce.toString(),
    d: order.deadline.toString(),
    g: signature,
  });
  return base64UrlEncode(payload);
}

export function decodeSaleLink(
  token: string,
): { order: SaleOrder; signature: Hex } | null {
  try {
    const raw = JSON.parse(base64UrlDecode(token));
    if (!raw?.l || !raw?.s || !raw?.p || !raw?.n || !raw?.d || !raw?.g) {
      return null;
    }
    return {
      order: {
        licenseId: BigInt(raw.l),
        seller: raw.s as Address,
        price: BigInt(raw.p),
        nonce: BigInt(raw.n),
        deadline: BigInt(raw.d),
      },
      signature: raw.g as Hex,
    };
  } catch {
    // A mangled link must read as "this offer is not valid", never as a crash.
    return null;
  }
}

function base64UrlEncode(s: string): string {
  const b64 =
    typeof btoa === "function"
      ? btoa(s)
      : Buffer.from(s, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return typeof atob === "function"
    ? atob(b64)
    : Buffer.from(b64, "base64").toString("utf8");
}
