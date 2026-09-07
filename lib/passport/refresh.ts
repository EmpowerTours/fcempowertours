/**
 * Rebuild a passport's artwork after its stamps change.
 *
 * ## Why this has to exist
 *
 * `tokenURI` stores a SNAPSHOT. The artwork is generated from the stamps, so
 * writing a stamp on chain does not change what anyone sees — passport #4 carried
 * a discovery stamp for a full day while every wallet showed an empty visa page.
 *
 * So a stamp is two writes, not one: the stamp itself, then this. That doubles
 * the real cost of a stamp and was not in any of the earlier gas figures.
 *
 * ## Why it is cheap anyway
 *
 * The metadata is pinned and only a ~90-byte https:// URL goes on chain, so the
 * refresh costs about 0.001 MON rather than the 0.52 an on-chain data: URI would.
 *
 * ## https:// and not ipfs://
 *
 * MetaMask does not resolve ipfs:// NFT URIs on Monad. Both the tokenURI and the
 * `image` inside it must be plain https:// or the passport renders as a grey box.
 * See lib/passport/token-uri.ts for the full account of that.
 *
 * ## Failure is not fatal
 *
 * A refresh rides on a stamp that already succeeded. If pinning or the write
 * fails, the stamp is still on chain and the next refresh picks it up — so this
 * logs and returns rather than throwing into the caller.
 */

import { generatePassportMetadata } from "@/lib/passport/generatePassportSVG";
import { pinPassportMetadata, pinPassportSVG } from "@/lib/passport/token-uri";

const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT_NFT ?? "";
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC ?? "https://rpc.monad.xyz";
const ORACLE_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const ABI = [
  "function getPassportData(uint256) view returns (tuple(uint256 userFid,string countryCode,string countryName,string region,string continent,uint256 mintedAt,bool verified,string verificationProof,uint256 verifiedAt))",
  "function getPassportStamps(uint256) view returns (tuple(string location,string eventType,address artist,uint256 timestamp,bool verified,string placeId,string googleMapsUri,int256 latitude,int256 longitude)[])",
  "function setTokenURI(uint256 tokenId, string uri) external",
  "function owner() view returns (address)",
];

export interface RefreshResult {
  refreshed: boolean;
  tokenId: number;
  stamps?: number;
  uri?: string;
  txHash?: string;
  reason?: string;
}

/** Regenerate the artwork for one passport and write the new tokenURI. */
export async function refreshPassportMetadata(
  tokenId: number | bigint,
): Promise<RefreshResult> {
  const id = Number(tokenId);
  if (!PASSPORT_NFT || !ORACLE_PRIVATE_KEY) {
    return { refreshed: false, tokenId: id, reason: "not configured" };
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);
    const passport = new Contract(PASSPORT_NFT, ABI, wallet);

    // Only the owner may set a tokenURI. Say so plainly rather than letting the
    // transaction revert with an opaque error after gas is spent.
    const owner: string = await passport.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      return {
        refreshed: false,
        tokenId: id,
        reason: `signer ${wallet.address} is not owner ${owner}`,
      };
    }

    const data = await passport.getPassportData(id);
    const raw = await passport.getPassportStamps(id);

    const stamps = raw.map(
      (s: {
        location: string;
        eventType: string;
        timestamp: bigint;
        verified: boolean;
      }) => ({
        locationName: s.location,
        city: s.location,
        country: String(data.countryName ?? ""),
        stampedAt: Number(s.timestamp),
        experienceType: s.eventType,
        verified: s.verified,
      }),
    );

    const metadata = generatePassportMetadata(
      String(data.countryCode),
      String(data.countryName),
      id,
      stamps,
    ) as Record<string, unknown>;

    // The artwork is a base64 SVG inside the document. It is pinned as its own
    // file so `image` is a fetchable https:// URL — a data: image is the other
    // half of what MetaMask refuses to render.
    const image = String(metadata.image ?? "");
    if (image.startsWith("data:image/svg+xml;base64,")) {
      metadata.image = await pinPassportSVG(
        Buffer.from(image.split(",", 2)[1], "base64").toString("utf8"),
        String(data.countryCode),
        id,
      );
    }

    const uri = await pinPassportMetadata(
      metadata,
      String(data.countryCode),
      id,
    );
    const tx = await passport.setTokenURI(id, uri);
    await tx.wait();

    return {
      refreshed: true,
      tokenId: id,
      stamps: stamps.length,
      uri,
      txHash: tx.hash,
    };
  } catch (err: unknown) {
    const reason =
      err instanceof Error
        ? err.message.slice(0, 140)
        : String(err).slice(0, 140);
    console.warn(`[PassportRefresh] #${id} failed:`, reason);
    return { refreshed: false, tokenId: id, reason };
  }
}
