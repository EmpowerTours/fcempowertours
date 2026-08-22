/**
 * Contract reads the v3 handlers need, kept free of `generated` imports so they can be tested.
 *
 * ## Why these exist at all
 *
 * v3's `MasterMinted` dropped `tokenURI`, `price` and `royalty`. Price arrives via
 * `SalesController.PricingSet`, but the uri and royalty are only reachable by calling the
 * contract — ERC721URIStorage's `MetadataUpdate` carries the token id and nothing else.
 *
 * ## Why they are hand-rolled rather than viem
 *
 * The indexer has no web3 dependency and already speaks raw `fetch` for IPFS. Two calldata
 * builders and one ABI string decode is a smaller surface than a new dependency in a service
 * whose failure mode is a stalled index.
 *
 * Every function here fails soft. A handler that throws stops the indexer at that block, which
 * is far worse than a master row with a missing title — the missing title is visible and
 * recoverable, a stalled index is neither.
 */

/** Monad mainnet. Overridable so the indexer is not pinned to one provider. */
export const V3_RPC =
  process.env.ENVIO_MONAD_RPC ||
  "https://monad-mainnet.g.alchemy.com/v2/QM9CqBmMU3Bu9ovRgNXZZ";

export interface ReadLogger {
  warn: (m: string) => void;
}

/** 32-byte left-padded hex of a bigint, for building calldata by hand. */
export function word(v: bigint): string {
  return v.toString(16).padStart(64, "0");
}

/**
 * Decode an ABI-encoded dynamic `string` return value.
 *
 * Layout is `[offset][length][utf-8 bytes, right-padded]`. The offset is read rather than assumed
 * to be 0x20 — it always is for a single return value, but reading it costs nothing and a wrong
 * assumption yields plausible garbage instead of an error.
 *
 * Returns "" for anything malformed. An empty uri is handled downstream; a thrown exception here
 * would stall the indexer.
 */
export function decodeAbiString(hex: string | null): string {
  if (!hex || hex.length < 130) return "";
  try {
    const body = hex.slice(2);
    const offset = parseInt(body.slice(0, 64), 16) * 2;
    if (!Number.isFinite(offset) || offset + 64 > body.length) return "";
    const length = parseInt(body.slice(offset, offset + 64), 16);
    if (!Number.isFinite(length) || length === 0) return "";
    const bytes = body.slice(offset + 64, offset + 64 + length * 2);
    if (bytes.length < length * 2) return "";
    const buf = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      buf[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return "";
  }
}

/**
 * Decode the second word of an ERC-2981 `royaltyInfo` return as a percentage.
 *
 * Called with a denominator of 10000, so the returned amount *is* the basis points.
 */
export function decodeRoyaltyPercent(hex: string | null): number {
  if (!hex || hex.length < 130) return 0;
  try {
    return Number(BigInt("0x" + hex.slice(2).slice(64, 128))) / 100;
  } catch {
    return 0;
  }
}

/** One `eth_call`, returning raw hex or null. Never throws. */
export async function ethCall(
  to: string,
  data: string,
  log?: ReadLogger,
): Promise<string | null> {
  try {
    const res = await fetch(V3_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      log?.warn(`eth_call to ${to} returned HTTP ${res.status}`);
      return null;
    }
    const json: any = await res.json();
    if (json.error || typeof json.result !== "string") {
      log?.warn(
        `eth_call to ${to} errored: ${JSON.stringify(json.error ?? json)}`,
      );
      return null;
    }
    return json.result;
  } catch (e: any) {
    log?.warn(`eth_call to ${to} failed: ${e?.message}`);
    return null;
  }
}

/** `tokenURI(uint256)` — selector 0xc87b56dd. */
export async function readTokenUri(
  contract: string,
  tokenId: bigint,
  log?: ReadLogger,
): Promise<string> {
  return decodeAbiString(
    await ethCall(contract, `0xc87b56dd${word(tokenId)}`, log),
  );
}

/**
 * The master's resale royalty, as a percentage.
 *
 * v3 sets it with `_setTokenRoyalty(masterTokenId, artist, royaltyBps)`, so ERC-2981's
 * `royaltyInfo(tokenId, 10000)` returns the bps directly. Reading `Master.royaltyShareBps`
 * instead would be wrong — that is the revenue-share sink, a different concept that happens to
 * sit beside it in the struct.
 */
export async function readRoyaltyPercent(
  contract: string,
  tokenId: bigint,
  log?: ReadLogger,
): Promise<number> {
  return decodeRoyaltyPercent(
    await ethCall(contract, `0x2a55205a${word(tokenId)}${word(10000n)}`, log),
  );
}
