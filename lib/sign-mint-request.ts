/**
 * Client-side half of v3 minting: ask the artist's wallet to approve the mint.
 *
 * The platform pays the gas but cannot mint in anyone's name — `SalesController.mintMasterFor`
 * only accepts a payload the artist signed. This is where that signature is produced.
 *
 * Kept out of the modal so the wire shape lives next to `lib/mint-request.ts`, which is pinned
 * against the Solidity by `tools/verify-mint-request.ts`. A drift between what is signed here and
 * what the contract hashes reverts as `BadSignature` with no explanation of which field is wrong.
 */

import { parseEther, type Address, type Hex } from "viem";
import {
  buildMintRequest,
  mintDomain,
  serializeMintRequest,
  validateMintRequest,
  MINT_REQUEST_TYPES,
} from "./mint-request";

/** Monad mainnet. The chain id is part of the EIP-712 domain, so it must be the real one. */
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 143);

export interface SignMintRequestInput {
  artist: Address;
  /** 0 when the artist has no Farcaster account. */
  artistFid: number;
  uri: string;
  /** Price per licence, in whole WMON, as typed by the artist. */
  price: string;
  /** 0 = MUSIC, 1 = ART. */
  nftType: number;
  maxCollectorEditions?: number;
  collectorPrice?: string;
  referrer?: Address;
  signTypedData: (params: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
}

export async function signMintRequest(input: SignMintRequestInput): Promise<{
  mintRequest: Record<string, string | number>;
  mintSignature: Hex;
}> {
  const salesController = process.env.NEXT_PUBLIC_SALES_CONTROLLER as
    | Address
    | undefined;
  if (!salesController) {
    throw new Error(
      "Minting is not configured: NEXT_PUBLIC_SALES_CONTROLLER is unset. Contact admin@empowertours.xyz.",
    );
  }

  const request = buildMintRequest({
    artist: input.artist,
    artistFid: input.artistFid,
    uri: input.uri,
    price: parseEther(input.price),
    collectorPrice: input.collectorPrice
      ? parseEther(input.collectorPrice)
      : 0n,
    maxCollectorEditions: input.maxCollectorEditions ?? 0,
    nftType: input.nftType,
    referrer: input.referrer,
  });

  // Refuse before raising a wallet prompt. A revert after the artist has already approved
  // something reads as "the app is broken", not "that price was invalid".
  const problem = validateMintRequest(request);
  if (problem) throw new Error(problem);

  const mintSignature = await input.signTypedData({
    domain: mintDomain(CHAIN_ID, salesController) as unknown as Record<
      string,
      unknown
    >,
    types: MINT_REQUEST_TYPES as unknown as Record<string, unknown>,
    primaryType: "MintRequest",
    // viem accepts BigInts here; the Farcaster path stringifies them on its way to the wallet.
    message: request as unknown as Record<string, unknown>,
  });

  return { mintRequest: serializeMintRequest(request), mintSignature };
}
