/**
 * Stamp the discoveries that already happened.
 *
 *   npx tsx tools/backfill-discovery-stamps.ts                 # dry run
 *   BROADCAST=1 npx tsx tools/backfill-discovery-stamps.ts     # write them
 *
 * ## Why backfill at all
 *
 * `recordPlay` has been firing since the radio went live, so listeners have
 * already discovered artists — the events happened, nothing recorded them on a
 * passport. Starting clean would mean the earliest listeners, the ones who were
 * there first, have the emptiest passports. That is backwards.
 *
 * ## Where the history comes from
 *
 * The chain, not Redis. Every `recordPlay` is a transaction to the PlayOracle, so
 * the full history is on chain whether or not any cache survived. Read via
 * Etherscan v2 (chainid 143) because the public RPC caps eth_getLogs at 100
 * blocks — see reference_monad_stablecoins_privacy.
 *
 * ## What it will not do
 *
 * Stamp anyone twice. Existing stamps are read from each passport first, and a
 * (listener, artist) pair already carrying a discovery stamp is skipped. Safe to
 * re-run, which matters because a partial run is the likely outcome of any RPC
 * hiccup.
 *
 * Listeners with no passport are reported, not stamped. Their discoveries are for
 * the pending queue, which the live path fills going forward.
 */

import { JsonRpcProvider, Wallet, Contract, Interface } from "ethers";
import { readFileSync } from "node:fs";

const RPC = process.env.MONAD_RPC ?? "https://rpc.monad.xyz";
const BROADCAST = Boolean(process.env.BROADCAST);

function fromEnv(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  for (const file of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
        if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      /* missing file is fine */
    }
  }
  return "";
}

const PASSPORT =
  fromEnv("NEXT_PUBLIC_PASSPORT_NFT") ||
  "0x4D5533e29Cf190131885Dc7Dbef22e31F4252410";
const ORACLE =
  fromEnv("NEXT_PUBLIC_PLAY_ORACLE") ||
  "0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf";
const REGISTRY =
  fromEnv("NEXT_PUBLIC_NFT_CONTRACT") ||
  "0x42EbcD44C2295702130f0A641633c691bA5f9480";
const PROFILES =
  fromEnv("NEXT_PUBLIC_PROFILE_REGISTRY") ||
  "0xf4C27308f2183E7Cb07c32FAF449a259831E16EC";
const ETHERSCAN = fromEnv("ETHERSCAN_API_KEY");

const provider = new JsonRpcProvider(RPC);

const recordPlayIface = new Interface([
  "function recordPlay(address user, uint256 masterTokenId, uint256 duration)",
]);

async function playHistory(): Promise<
  { user: string; masterTokenId: string }[]
> {
  if (!ETHERSCAN)
    throw new Error("ETHERSCAN_API_KEY is required to read play history");
  const url =
    `https://api.etherscan.io/v2/api?chainid=143&module=account&action=txlist` +
    `&address=${ORACLE}&page=1&offset=10000&sort=asc&apikey=${ETHERSCAN}`;
  const res = await fetch(url);
  const body = (await res.json()) as {
    result?: { input: string; isError: string }[];
  };
  const out: { user: string; masterTokenId: string }[] = [];
  for (const tx of body.result ?? []) {
    if (tx.isError !== "0") continue;
    try {
      const parsed = recordPlayIface.parseTransaction({ data: tx.input });
      if (parsed?.name !== "recordPlay") continue;
      out.push({
        user: (parsed.args[0] as string).toLowerCase(),
        masterTokenId: String(parsed.args[1]),
      });
    } catch {
      /* not a recordPlay call */
    }
  }
  return out;
}

const passportAbi = [
  "function getTotalSupply() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function getPassportStamps(uint256) view returns (tuple(string location,string eventType,address artist,uint256 timestamp,bool verified,string placeId,string googleMapsUri,int256 latitude,int256 longitude)[])",
  "function addVenueStamp(uint256 tokenId, string location, string eventType, address artist, bool verified, string placeId, string googleMapsUri, int256 latitude, int256 longitude)",
];

const plays = await playHistory();
console.log(`recordPlay calls found: ${plays.length}`);

const registry = new Contract(
  REGISTRY,
  [
    "function getMaster(uint256) view returns (address artist, uint256 artistFid, uint64 createdAt, uint32 maxCollectorEditions, uint32 collectorsMinted, uint8 nftType, address referrer, uint96 royaltyShareBps, address royaltyShareSink)",
    "function totalMasters() view returns (uint256)",
    "function tokenURI(uint256) view returns (string)",
    "function masterSuspended(uint256) view returns (bool)",
  ],
  provider,
);
const profiles = new Contract(
  PROFILES,
  ["function displayNameOf(address) view returns (string)"],
  provider,
);

/**
 * A Farcaster handle from an fid, via the keyless fname registry.
 *
 * Used before the ProfileRegistry because an fid is what the master itself
 * carries, and unify34 - the only artist on the platform - has a Farcaster
 * account and no registered profile name. Without this tier every stamp would
 * read a hex address.
 */
async function fnameFor(fid: bigint): Promise<string> {
  if (!fid || fid === 0n) return "";
  try {
    const res = await fetch(
      `https://fnames.farcaster.xyz/transfers?fid=${fid.toString()}`,
    );
    if (!res.ok) return "";
    const body = (await res.json()) as { transfers?: { username?: string }[] };
    const last = body.transfers?.[body.transfers.length - 1];
    return last?.username ? String(last.username).slice(0, 24) : "";
  } catch {
    return "";
  }
}

/**
 * Which artist a play should actually credit.
 *
 * Every play so far was of masters #1-#5 - the copies the v3 migration minted,
 * whose artist is the DEPLOYER because mintMaster sets the artist to msg.sender.
 * Crediting those literally would stamp "first heard 0x8df6...8ec1" on every
 * passport, which is precisely the wrong-attribution bug the catalogue had.
 *
 * A suspended master resolves to the live master carrying the same AUDIO, exactly
 * as the catalogue dedupe does. The recording is the identity; a retired master is
 * an old pointer at it.
 */
const GATEWAY = "https://harlequin-used-hare-224.mypinata.cloud/ipfs/";
const resolveIpfs = (u: string) =>
  u.startsWith("ipfs://") ? GATEWAY + u.slice(7) : u;

async function audioOf(id: bigint | string): Promise<string> {
  try {
    const uri: string = await registry.tokenURI(id);
    if (!uri) return "";
    const res = await fetch(resolveIpfs(uri));
    if (!res.ok) return "";
    const md = (await res.json()) as {
      animation_url?: string;
      audio_url?: string;
    };
    return resolveIpfs(md.animation_url ?? md.audio_url ?? "");
  } catch {
    return "";
  }
}

/** audio URL -> the highest LIVE master id carrying it. */
const liveByAudio = new Map<string, bigint>();
{
  const totalMasters: bigint = await registry.totalMasters();
  for (let id = totalMasters; id >= 1n; id--) {
    if (await registry.masterSuspended(id)) continue;
    const audio = await audioOf(id);
    if (audio && !liveByAudio.has(audio)) liveByAudio.set(audio, id);
  }
  console.log(`live masters by audio: ${liveByAudio.size}`);
}

async function creditedArtist(masterTokenId: string): Promise<string | null> {
  const suspended: boolean = await registry.masterSuspended(masterTokenId);
  let id: bigint | string = masterTokenId;
  if (suspended) {
    const audio = await audioOf(masterTokenId);
    const live = audio ? liveByAudio.get(audio) : undefined;
    if (live === undefined) return null; // retired with no replacement
    id = live;
  }
  const m = await registry.getMaster(id);
  return (m[0] as string).toLowerCase();
}

// (listener, artist) -> the first master that introduced them, in play order.
const discoveries = new Map<
  string,
  { listener: string; artist: string; master: string }
>();
const artistOf = new Map<string, string>();
for (const p of plays) {
  if (!artistOf.has(p.masterTokenId)) {
    const a = await creditedArtist(p.masterTokenId);
    if (a === null) continue;
    artistOf.set(p.masterTokenId, a);
  }
  const artist = artistOf.get(p.masterTokenId);
  if (!artist) continue;
  if (artist === p.user) continue; // nobody discovers themselves
  const key = `${p.user}:${artist}`;
  if (!discoveries.has(key))
    discoveries.set(key, { listener: p.user, artist, master: p.masterTokenId });
}
console.log(`distinct (listener, artist) discoveries: ${discoveries.size}\n`);

const wallet = BROADCAST
  ? new Wallet(fromEnv("DEPLOYER_PRIVATE_KEY"), provider)
  : null;
const passport = new Contract(PASSPORT, passportAbi, wallet ?? provider);
const total: bigint = await passport.getTotalSupply();

const owners = new Map<string, bigint>();
for (let id = 1n; id <= total; id++) {
  try {
    owners.set(((await passport.ownerOf(id)) as string).toLowerCase(), id);
  } catch {
    /* burned */
  }
}

let stamped = 0,
  skipped = 0,
  noPassport = 0;
for (const d of discoveries.values()) {
  const tokenId = owners.get(d.listener);
  if (tokenId === undefined) {
    console.log(
      `  ${d.listener.slice(0, 10)}… discovered ${d.artist.slice(0, 10)}… — NO PASSPORT, skipped`,
    );
    noPassport++;
    continue;
  }

  const existing = await passport.getPassportStamps(tokenId);
  if (
    existing.some(
      (s: { eventType: string; artist: string }) =>
        s.eventType === "discovery" && s.artist.toLowerCase() === d.artist,
    )
  ) {
    skipped++;
    continue;
  }

  let name = "";
  try {
    const m = await registry.getMaster(d.master);
    name = await fnameFor(m[1] as bigint);
  } catch {
    /* no fid */
  }
  if (!name) {
    try {
      const registered: string = await profiles.displayNameOf(d.artist);
      if (registered?.trim()) name = registered.trim().slice(0, 24);
    } catch {
      /* no profile */
    }
  }
  if (!name) name = `${d.artist.slice(0, 6)}…${d.artist.slice(-4)}`;

  console.log(
    `  passport #${tokenId}: ${d.listener.slice(0, 10)}… first heard ${name}`,
  );
  if (BROADCAST) {
    const tx = await passport.addVenueStamp(
      tokenId,
      name,
      "discovery",
      d.artist,
      true,
      "",
      "",
      0,
      0,
    );
    await tx.wait();
    console.log(`      ${tx.hash}`);
  }
  stamped++;
}

console.log(`\n${BROADCAST ? "stamped" : "would stamp"}: ${stamped}`);
console.log(`already stamped: ${skipped}`);
console.log(`no passport (queue a prompt instead): ${noPassport}`);
if (!BROADCAST)
  console.log("\nDRY RUN — nothing sent. Re-run with BROADCAST=1.");
