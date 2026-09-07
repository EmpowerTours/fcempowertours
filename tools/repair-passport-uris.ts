/**
 * Back-fill the tokenURI of passports minted without one.
 *
 *   npx tsx tools/repair-passport-uris.ts                 # dry run, IPFS mode
 *   PINATA_JWT=... npx tsx tools/repair-passport-uris.ts  # dry run, real pinning
 *   PINATA_JWT=... BROADCAST=1 npx tsx tools/repair-passport-uris.ts
 *   ONCHAIN=1 BROADCAST=1 npx tsx tools/repair-passport-uris.ts   # no Pinata
 *
 * ## What is being repaired
 *
 * PassportNFTV4 sets the tokenURI during the mint. `execute-delegated` defaulted
 * that argument to "", so passports #1-#4 carry no metadata: MetaMask draws a grey
 * rectangle with a token number. The mint path is fixed in
 * lib/passport/token-uri.ts; this repairs what was already minted.
 *
 * Nothing is invented. Country, name and fid all live on chain in
 * `getPassportData`, so the artwork is regenerated from the contract's own record
 * rather than from anything remembered here.
 *
 * ## Two modes, because the cost difference is three orders of magnitude
 *
 * IPFS (default): the document is pinned and only an ~60-byte `ipfs://` URI is
 * stored. Costs about 0.0002 MON per token. Needs PINATA_JWT, which lives in the
 * Railway environment rather than in .env.
 *
 * ONCHAIN=1: the whole document is stored as `data:application/json;base64,...`.
 * The metadata is already self-contained — its artwork is an embedded base64 SVG —
 * so this depends on nothing external, ever. Measured against mainnet: 6,905
 * bytes, 3,955,706 gas, about 0.52 MON per token at 102 gwei, and Monad charges on
 * the gas LIMIT rather than gas used.
 *
 * Only the owner may call setTokenURI. owner() is the deployer.
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { generatePassportMetadata } from "../lib/passport/generatePassportSVG.ts";

const RPC = process.env.MONAD_RPC ?? "https://rpc.monad.xyz";
const PASSPORT = (process.env.PASSPORT_NFT ??
  "0x4D5533e29Cf190131885Dc7Dbef22e31F4252410") as `0x${string}`;
const BROADCAST = Boolean(process.env.BROADCAST);
const ONCHAIN = Boolean(process.env.ONCHAIN);

const ABI = parseAbi([
  "function getTotalSupply() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function owner() view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function setTokenURI(uint256 tokenId, string uri)",
  "function getPassportStamps(uint256) view returns ((string location,string eventType,address artist,uint256 timestamp,bool verified,string placeId,string googleMapsUri,int256 latitude,int256 longitude)[])",
  "function getPassportData(uint256) view returns ((uint256,string,string,string,string,uint256,bool,string,uint256))",
]);

const chain = {
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

function envFromDotEnv(key: string): string | undefined {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* no .env is fine */
  }
  return undefined;
}

/**
 * Pin a file (not JSON) and return its ipfs:// URI.
 *
 * The SVG is pinned SEPARATELY from the metadata that references it, so the
 * `image` field is an ipfs:// URI rather than a base64 data URI. That second
 * layer matters as much as the first: MetaMask Mobile fails to render base64
 * images inside metadata even when the metadata itself is fetched over IPFS
 * (metamask-mobile #2236), so pinning only the JSON would leave the passport
 * blank for exactly the reason it is blank today.
 *
 * The shape to match is the music NFTs, which render correctly in the same
 * wallet: ipfs:// at the tokenURI AND ipfs:// at the image.
 */
async function pinFile(
  data: string,
  filename: string,
  contentType: string,
): Promise<string> {
  const jwt = process.env.PINATA_JWT ?? envFromDotEnv("PINATA_JWT");
  if (!jwt) throw new Error("PINATA_JWT is not set");
  const form = new FormData();
  form.append("file", new Blob([data], { type: contentType }), filename);
  form.append("pinataMetadata", JSON.stringify({ name: filename }));
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!res.ok)
    throw new Error(
      `Pinata file ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const body = (await res.json()) as { IpfsHash?: string };
  if (!body.IpfsHash)
    throw new Error("Pinata returned no IpfsHash for the file");
  return `ipfs://${body.IpfsHash}`;
}

async function pin(metadata: unknown, name: string): Promise<string> {
  const jwt = process.env.PINATA_JWT ?? envFromDotEnv("PINATA_JWT");
  if (!jwt)
    throw new Error(
      "PINATA_JWT is not set. Supply it, or use ONCHAIN=1 to store the metadata directly (about 0.52 MON per token).",
    );
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name } }),
  });
  if (!res.ok)
    throw new Error(
      `Pinata ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const body = (await res.json()) as { IpfsHash?: string };
  if (!body.IpfsHash) throw new Error("Pinata returned no IpfsHash");
  return `ipfs://${body.IpfsHash}`;
}

const client = createPublicClient({ chain, transport: http(RPC) });

/** The stamps this passport carries, so the artwork can be rebuilt around them. */
async function readStamps(id: number) {
  try {
    const raw = (await client.readContract({
      address: PASSPORT,
      abi: ABI,
      functionName: "getPassportStamps",
      args: [BigInt(id)],
    })) as readonly {
      location: string;
      eventType: string;
      artist: string;
      timestamp: bigint;
      verified: boolean;
    }[];
    return raw.map((s) => ({
      locationName: s.location,
      city: s.location,
      country: "",
      stampedAt: Number(s.timestamp),
      experienceType: s.eventType,
      verified: s.verified,
    }));
  } catch {
    return [];
  }
}

const total = Number(
  await client.readContract({
    address: PASSPORT,
    abi: ABI,
    functionName: "getTotalSupply",
  }),
);
const owner = await client.readContract({
  address: PASSPORT,
  abi: ABI,
  functionName: "owner",
});
console.log(`passport ${PASSPORT}`);
console.log(`supply   ${total}`);
console.log(`owner    ${owner}`);
console.log(
  `mode     ${ONCHAIN ? "ONCHAIN data: URI" : "IPFS"}${BROADCAST ? " (BROADCAST)" : " (dry run)"}\n`,
);

const jobs: { id: number; uri: string; country: string }[] = [];

for (let id = 1; id <= total; id++) {
  let existing = "";
  try {
    existing = await client.readContract({
      address: PASSPORT,
      abi: ABI,
      functionName: "tokenURI",
      args: [BigInt(id)],
    });
  } catch {
    console.log(`  #${id}  does not exist, skipping`);
    continue;
  }
  // REFRESH=1 rewrites a passport that already has a URI. Needed because all four
  // carry on-chain data: URIs, and the point of a refresh run is replacing those
  // with ipfs:// so MetaMask Mobile can render them at all.
  if (existing.length > 0 && !process.env.REFRESH) {
    console.log(
      `  #${id}  already has a tokenURI (${existing.length} bytes) - set REFRESH=1 to replace it`,
    );
    continue;
  }

  const d = (await client.readContract({
    address: PASSPORT,
    abi: ABI,
    functionName: "getPassportData",
    args: [BigInt(id)],
  })) as readonly [
    bigint,
    string,
    string,
    string,
    string,
    bigint,
    boolean,
    string,
    bigint,
  ];
  const countryCode = d[1];
  const countryName = d[2];

  // Regenerate WITH the stamps the passport now carries. tokenURI stores a
  // snapshot, so a stamp written on chain stays invisible until the artwork is
  // rebuilt - passport #4 has carried a discovery stamp since 2026-09-07 that no
  // wallet can see.
  const stamps = await readStamps(id);
  const metadata = generatePassportMetadata(
    countryCode,
    countryName,
    id,
    stamps,
  ) as Record<string, unknown>;

  let uri: string;
  if (ONCHAIN) {
    uri =
      "data:application/json;base64," +
      Buffer.from(JSON.stringify(metadata)).toString("base64");
  } else {
    // Pin the ARTWORK first, then point the metadata at it. Pinning only the
    // JSON would leave `image` as a base64 data URI, which MetaMask Mobile fails
    // to render even when the metadata itself came over IPFS - the passport would
    // stay blank for the same reason it is blank today.
    const image = String(metadata.image ?? "");
    if (image.startsWith("data:image/svg+xml;base64,")) {
      const svg = Buffer.from(image.split(",", 2)[1], "base64").toString(
        "utf8",
      );
      metadata.image = await pinFile(
        svg,
        `passport-${countryCode}-${id}.svg`,
        "image/svg+xml",
      );
    }
    uri = await pin(metadata, `passport-${countryCode}-${id}`);
  }

  console.log(
    `  #${id}  ${countryCode} ${countryName} -> ${uri.length} bytes  ${uri.slice(0, 48)}…`,
  );
  jobs.push({ id, uri, country: `${countryCode} ${countryName}` });
}

if (jobs.length === 0) {
  console.log("\nnothing to repair.");
  process.exit(0);
}
console.log(`\nwould repair: ${jobs.map((j) => "#" + j.id).join(" ")}`);

if (!BROADCAST) {
  console.log("\nDRY RUN - nothing sent. Re-run with BROADCAST=1 to apply.");
  process.exit(0);
}

const pk = (process.env.DEPLOYER_PRIVATE_KEY ??
  envFromDotEnv("DEPLOYER_PRIVATE_KEY")) as `0x${string}` | undefined;
if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
const account = privateKeyToAccount(pk);
if (account.address.toLowerCase() !== (owner as string).toLowerCase()) {
  throw new Error(
    `REFUSING: key derives ${account.address}, but owner() is ${owner}`,
  );
}
const wallet = createWalletClient({ account, chain, transport: http(RPC) });
console.log(`\nsender ${account.address}`);

for (const j of jobs) {
  const gas = await client.estimateContractGas({
    address: PASSPORT,
    abi: ABI,
    functionName: "setTokenURI",
    args: [BigInt(j.id), j.uri],
    account,
  });
  const limit = (gas * 130n) / 100n;
  console.log(`  #${j.id} ${j.country}: gas ${gas}, limit ${limit}`);
  const hash = await wallet.writeContract({
    address: PASSPORT,
    abi: ABI,
    functionName: "setTokenURI",
    args: [BigInt(j.id), j.uri],
    gas: limit,
  });
  await client.waitForTransactionReceipt({ hash });
  const back = await client.readContract({
    address: PASSPORT,
    abi: ABI,
    functionName: "tokenURI",
    args: [BigInt(j.id)],
  });
  if (back !== j.uri)
    throw new Error(
      `#${j.id} read back ${back.length} bytes, expected ${j.uri.length}`,
    );
  console.log(`    done ${hash}`);
}
console.log(`\nrepaired: ${jobs.map((j) => "#" + j.id).join(" ")}`);
