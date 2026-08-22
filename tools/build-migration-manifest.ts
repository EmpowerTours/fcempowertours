/**
 * Emit the proposed `~/.claude/tx-manifest.json` entries for the v3 migration.
 *
 * Run: `node --experimental-strip-types tools/build-migration-manifest.ts`
 *
 * Every value here was read off Monad mainnet on 2026-08-21, not transcribed from notes. The
 * output is a *proposal*: this script cannot write the manifest — the agent is denied that file
 * on purpose, so approving a transaction stays a deliberate human act naming one transaction
 * rather than a sentence in a chat log.
 *
 * Two values are not knowable until you have run the steps that produce them, and the script
 * refuses to emit a manifest that pretends otherwise:
 *
 *   PASSPORT_V4   the address of the redeployed PassportNFTV4
 *   REPINNED      the new master metadata CIDs from tools/repin-master-metadata.ts
 *
 * Pass them as env vars once you have them.
 */

const SALES = "0xf824D444AAf251EB2197836FFb218d48927F8cB1";
const REGISTRY = "0x42EbcD44C2295702130f0A641633c691bA5f9480";
const V6 = "0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B";
const PLAY_ORACLE = "0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf";
const LIVE_RADIO = "0x042EDF80713e6822a891e4e8a0800c332B8200fd";
const ZERO = "0x0000000000000000000000000000000000000000";

/** The artist's Farcaster wallet — where the passports live and must stay. */
const FARCASTER_WALLET = "0x33fFCcb1802e13a7eead232BCd4706a2269582b0";
const ARTIST_FID = "765994";

/**
 * The five legacy masters, read from `masterTokens()` on 0xB9B3acf3… .
 *
 * `royaltyBps` is 5000 on every one of them — V2 hardcodes MUSIC_ROYALTY = ART_ROYALTY = 5000,
 * and v3's HARD_MAX_ROYALTY_BPS is also 5000, so they migrate at exactly the cap.
 */
const MASTERS = [
  {
    id: 1,
    uri: "ipfs://QmeWFYapNrV4uehNx8NpF1rspGYe6doL8uc2xDgecMQM5m",
    maxEditions: "0",
    price: "300000000000000000000",
    collectorPrice: "0",
  },
  {
    id: 2,
    uri: "ipfs://QmXeAsQ6ueQAfGE46Ds1ubRdxPdsnjRjXWTMVafQuuY6K5",
    maxEditions: "0",
    price: "300000000000000000000",
    collectorPrice: "0",
  },
  {
    id: 3,
    uri: "ipfs://QmbuMxUTC5UWbox2sG7gN9UzKAm87z6gRsAAkCCHE3wQmw",
    maxEditions: "1000",
    price: "35000000000000000000",
    collectorPrice: "100000000000000000000000000",
  },
  {
    id: 4,
    uri: "ipfs://QmNaLRTW3VBqELMUNopvbco3EpY8TLi9WcghV5Su5rHQ8Y",
    maxEditions: "500",
    price: "100000000000000000000",
    collectorPrice: "1000000000000000000000000",
  },
  {
    id: 5,
    uri: "ipfs://QmV895YjnkLfQkHvmsppsRJgPvNshaoejSWrfQtUdXSWt2",
    maxEditions: "1000",
    price: "35000000000000000000",
    collectorPrice: "500000000000000000000",
  },
] as const;

/** The three passports, read from `getPassportData()` on 0x93126e59… . */
const PASSPORTS = [
  {
    id: 1,
    code: "MX",
    name: "Mexico",
    region: "Central America",
    continent: "North America",
    mintedAt: "1769157019",
  },
  {
    id: 2,
    code: "FR",
    name: "France",
    region: "Western Europe",
    continent: "Europe",
    mintedAt: "1770573209",
  },
  {
    id: 3,
    code: "CN",
    name: "China",
    region: "Eastern Asia",
    continent: "Asia",
    mintedAt: "1770729681",
  },
] as const;

const repinned: Record<string, string> = process.env.REPINNED
  ? JSON.parse(process.env.REPINNED)
  : {};
const passportV4 = process.env.PASSPORT_V4;

const expires = process.env.EXPIRES || "";
if (!expires) {
  console.error(
    "Set EXPIRES to an ISO timestamp (e.g. EXPIRES=2026-08-22T23:59:59Z).\n" +
      "An approval without an expiry is a standing permission, which is not what this is for.",
  );
  process.exit(1);
}

type Entry = {
  approved: boolean;
  to: string;
  sig: string;
  args: string[];
  note: string;
  expires: string;
};
const entries: Entry[] = [];
const add = (to: string, sig: string, args: string[], note: string) =>
  entries.push({ approved: true, to, sig, args, note, expires });

// --- 1. republish the catalogue -------------------------------------------
// Minted BY the deployer, so the deployer is the artist of record and receives every payout.
// That was the deliberate choice: the Farcaster wallet is Warpcast-managed with no key export.
const MINT_SIG =
  "mintMaster(uint256,string,uint32,address,uint96,uint8,uint256,uint256)";
for (const m of MASTERS) {
  const uri = repinned[String(m.id)] ?? m.uri;
  const repinNote =
    m.collectorPrice !== "0" && !repinned[String(m.id)]
      ? " [WARNING: has collector art but was NOT re-pinned — the artwork pointer will be lost]"
      : "";
  add(
    SALES,
    MINT_SIG,
    [
      ARTIST_FID,
      uri,
      m.maxEditions,
      ZERO,
      "5000",
      "0",
      m.price,
      m.collectorPrice,
    ],
    `republish legacy master ${m.id} into v3${repinNote}`,
  );
}

// --- 2. the one real outside buyer ----------------------------------------
// Licence 1000004, held by 0xd6B624F5…, on legacy master 3 → v3 master 3 (ids line up only
// because the registry is empty and the five above mint in order).
//
// mintedAt is derived: V2 stores no mint time, only `expiry`, and expiry = purchase +
// licensePeriod (2592000s). 1788196159 - 2592000 = 1785604159. Exact unless the licence was
// renewed, in which case it records the latest renewal rather than the original purchase.
add(
  REGISTRY,
  "migrateLegacy(address,uint256,uint64,bool,string,uint96)",
  [
    "0xd6B624F524E554e478bd3B9dC5d1b5d44158630F",
    "3",
    "1785604159",
    "false",
    "ipfs://QmbuMxUTC5UWbox2sG7gN9UzKAm87z6gRsAAkCCHE3wQmw",
    "5000",
  ],
  "migrate licence 1000004 — the only licence held by someone outside the project",
);

// --- 3. passports ----------------------------------------------------------
if (passportV4) {
  for (const p of PASSPORTS) {
    add(
      passportV4,
      "migrateLegacyPassport(address,uint256,string,string,string,string,string,uint256)",
      [
        FARCASTER_WALLET,
        ARTIST_FID,
        p.code,
        p.name,
        p.region,
        p.continent,
        "",
        p.mintedAt,
      ],
      `migrate passport ${p.id} (${p.code}) keeping its original mint date`,
    );
  }
}

// --- 4. repoint the integrations ------------------------------------------
add(
  PLAY_ORACLE,
  "setMusicSubscription(address)",
  [V6],
  "PlayOracleV3 → MusicSubscriptionV6",
);
add(
  LIVE_RADIO,
  "setNFTContract(address)",
  [REGISTRY],
  "LiveRadioV3 → v3 LicenseRegistry",
);

// --- 5. seals — irreversible, and opt-in ----------------------------------
//
// Off by default. Approving a seal in the same batch as the migration it closes means one
// mistake in the catalogue becomes permanent before anyone has looked at it. Run the migration,
// check the app, then regenerate with INCLUDE_SEALS=1 as a second, deliberate approval.
if (process.env.INCLUDE_SEALS === "1") {
  add(
    REGISTRY,
    "sealMigration()",
    [],
    "IRREVERSIBLE: close v3 legacy migration forever",
  );
  if (passportV4) {
    add(
      passportV4,
      "sealPassportMigration()",
      [],
      "IRREVERSIBLE: close passport migration forever",
    );
  }
} else {
  console.error(
    "\nSeals omitted. Once the catalogue is verified, regenerate with INCLUDE_SEALS=1.",
  );
}

// --------------------------------------------------------------------------
const missing: string[] = [];
if (!passportV4)
  missing.push("PASSPORT_V4 (redeploy first) — passport entries omitted");
for (const m of MASTERS) {
  if (m.collectorPrice !== "0" && !repinned[String(m.id)]) {
    missing.push(
      `REPINNED[${m.id}] — master ${m.id} has collector art that will be lost`,
    );
  }
}

/**
 * The guard splits a command's arguments on whitespace and strips one layer of quotes from each
 * token, so an argument that *contains* a space can never match its manifest entry — the command
 * parses into more tokens than the entry has. Verified against the guard's own parser: "Central
 * America" arrives as two tokens.
 *
 * That is not a reason to mangle the data. It means those transactions cannot be relayed through
 * the manifest at all and have to be sent by hand, which the guard permits by design — it only
 * inspects commands the agent runs.
 *
 * Splitting them out here rather than leaving a comment about it: an entry that silently fails to
 * match looks identical to one nobody got round to approving.
 */
const unmatchable = entries.filter((e) => e.args.some((a) => /\s/.test(a)));
const manifestable = entries.filter((e) => !e.args.some((a) => /\s/.test(a)));

console.log(JSON.stringify({ approved: manifestable }, null, 2));
console.error(`\n${manifestable.length} entries emitted.`);

if (unmatchable.length) {
  console.error(
    `\n${unmatchable.length} transaction(s) CANNOT go through the manifest — an argument ` +
      `contains a space, which the guard's parser cannot match. Send these by hand:\n`,
  );
  for (const e of unmatchable) {
    const args = e.args.map((a) => `'${a}'`).join(" ");
    console.error(`  # ${e.note}`);
    console.error(`  cast send ${e.to} "${e.sig}" ${args} \\`);
    console.error(`    --rpc-url "$RPC" --account <your-deployer-keystore>\n`);
  }
}
if (missing.length) {
  console.error("\nINCOMPLETE — do not approve this as-is:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(2);
}
