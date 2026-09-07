/**
 * The one place a passport's tokenURI is produced.
 *
 * ## Why this exists
 *
 * PassportNFTV4 stores the URI per token and sets it during the mint, so a mint
 * that passes an empty string produces a passport with no metadata — forever, at
 * least until an owner calls `setTokenURI`. That is not hypothetical: every
 * passport minted before 2026-09-06 has an empty tokenURI, because
 * `execute-delegated` defaulted the argument to `""`:
 *
 *     params?.uri || "",
 *
 * Every other argument on that call had a real fallback — "US", "United States",
 * "Americas" — so the one field that could not be reconstructed later was also the
 * only one allowed to be blank. In MetaMask the result is a grey rectangle with a
 * token number and nothing else, which looks like a wallet bug rather than a
 * missing string.
 *
 * `app/api/mint-passport` did this correctly all along. The bug was a second mint
 * path that did not. So the logic lives here now and both call it, because the
 * copy that drifts is always the one nobody is looking at.
 *
 * ## Why IPFS rather than a data: URI
 *
 * The metadata already embeds its artwork as a base64 SVG, so it is
 * self-contained and needs no image host. It is tempting to store the whole
 * document on-chain as `data:application/json;base64,...` and depend on nothing.
 * Measured: 6,905 bytes, about 4.3M gas to store — roughly 0.44 MON per passport
 * at 102 gwei, and Monad charges on the gas LIMIT. An ipfs:// URI is ~60 bytes.
 */

import { generatePassportMetadata } from "@/lib/passport/generatePassportSVG";

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

/**
 * Build the passport metadata and pin it, returning an `ipfs://` URI.
 *
 * THROWS rather than returning a fallback. A caller that swallows this and mints
 * anyway creates a permanently blank NFT and reports success — the exact failure
 * this module was written for. Refusing the mint is recoverable; minting without
 * metadata is not, short of an owner-only repair transaction per token.
 */
export async function buildPassportTokenURI(
  countryCode: string,
  countryName: string,
  tokenId = 0,
): Promise<string> {
  return pinPassportMetadata(
    generatePassportMetadata(countryCode, countryName, tokenId),
    countryCode,
    tokenId,
  );
}

/**
 * Pin an already-built metadata document. Separate from the above because a
 * passport is re-pinned after the mint with its real tokenId baked into the
 * artwork, and at that point the document already exists.
 */
export async function pinPassportMetadata(
  metadata: unknown,
  countryCode: string,
  tokenId = 0,
): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "PINATA_JWT is not set — refusing to mint a passport with no metadata",
    );
  }

  const res = await fetch(PINATA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `passport-${countryCode}-${tokenId}` },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Pinata upload failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }

  const body = (await res.json()) as { IpfsHash?: string };
  if (!body.IpfsHash) {
    throw new Error("Pinata returned no IpfsHash");
  }
  return `ipfs://${body.IpfsHash}`;
}
