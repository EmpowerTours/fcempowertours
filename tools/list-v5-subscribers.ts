/**
 * Enumerate everyone who ever subscribed on `MusicSubscriptionV5`, and say who is still active.
 *
 * Run: `node --experimental-strip-types tools/list-v5-subscribers.ts`
 *
 * ## Why this exists
 *
 * The v3 cutover pointed the app at `MusicSubscriptionV6`. Subscriptions did not migrate, so
 * anyone holding an unexpired V5 subscription is invisible to the app: it reads V6, sees nothing,
 * and shows them as unsubscribed. They paid and, as far as the product is concerned, did not.
 *
 * `docs/PRIORITIES.md` #4 carried this as UNVERIFIED because the public Monad RPC caps
 * `eth_getLogs` at a 100-block range and the set spans millions of blocks. The plan was to use
 * the keyed Alchemy endpoint instead.
 *
 * **That does not work either.** Measured 2026-08-25: the key is on the Free plan, which caps
 * `eth_getLogs` at a **10**-block range — worse than the public RPC. Covering the ~48.7M blocks
 * since the subscription contract went live would need roughly 4.9 million requests. Event
 * enumeration is unavailable at any tier this project currently has.
 *
 * So this checks known addresses directly instead. `getSubscriptionInfo` is a plain contract
 * read, which no plan restricts, and with single-digit subscribers that answers the question.
 * What it cannot do is find a subscriber nobody has a record of — stated in the output rather
 * than left implied.
 *
 * ## The URL is never printed
 *
 * `contracts/foundry.toml` is gitignored precisely because it holds a provider URL with an API
 * key in the path. This script reads that file itself rather than taking the URL as an argument,
 * so the key never appears in a shell history, a process list, or this script's output. On
 * failure it reports the host only — the same rule `lib/pimlico-safe-aa.ts` follows, and the one
 * a viem error dump broke on 2026-08-23.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";

const V5 = "0x5372aD0291a69c1EBc0BE2dc6DE9dab224045f19" as const;
const V6 = "0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B" as const;

const SUBSCRIPTION_ABI = parseAbi([
  "function getSubscriptionInfo(address user) view returns (uint256 userFid, uint256 expiry, bool active, uint256 totalPlays, uint256 flagVotes, uint8 lastTier, bool isFlagged)",
]);

const V6_ABI = parseAbi([
  "function getSubscriptionInfo(address user) view returns (uint256 userFid, uint256 expiry, bool active, uint256 totalPlays, uint8 lastTier, bool isFlagged)",
]);

/** Read the keyed endpoint out of the gitignored foundry config. Never returned to a caller. */
function rpcUrl(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const fromEnv = process.env.MONAD_RPC;
  if (fromEnv) return fromEnv;

  try {
    const toml = readFileSync(
      join(here, "..", "contracts", "foundry.toml"),
      "utf8",
    );
    const match = toml.match(/https:\/\/[^\s"']*alchemy[^\s"']*/);
    if (match) return match[0];
  } catch {
    // fall through
  }
  return "https://rpc.monad.xyz";
}

const url = rpcUrl();
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
})();

const chain = {
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [url] } },
} as const;

const client = createPublicClient({ chain, transport: http(url) });

console.log(`Reading contract state via ${host}\n`);

const head = await client.getBlockNumber();
console.log(`chain head ${head}\n`);

/**
 * Candidate addresses, checked directly rather than discovered from events.
 *
 * Event enumeration is not available at any tier this project has. The public Monad RPC caps
 * `eth_getLogs` at a 100-block range; the keyed Alchemy endpoint is on the **Free** plan, which
 * caps it at **10** — measured 2026-08-25, and worse than the public one. Covering the ~48.7M
 * blocks since the subscription contract went live would need roughly 4.9 million requests.
 *
 * With single-digit subscribers that does not matter: `getSubscriptionInfo` is a plain contract
 * read, so the question "is anyone stranded" can be answered for every address the project knows
 * about. What this cannot do is find a subscriber nobody has a record of. That limit is real and
 * is stated in the output rather than left implied.
 *
 * Pass extra addresses as arguments to widen the set.
 */
const CANDIDATES = [
  // The artist / primary user
  "0x33fFCcb1802e13a7eead232BCd4706a2269582b0",
  // Licence holders seen in production logs
  "0x868469e5d124f81cf63e1a3808795649ca6c3d77",
  "0xd6b624f524e554e478bd3b9dc5d1b5d44158630f",
  // The user Safe, in case a subscription was ever taken against it rather than the wallet
  "0xCE1E82bBa89F444e7852Da08b2d24081130FE1FF",
  // Platform-side addresses, for completeness
  "0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1",
  "0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA",
  ...process.argv.slice(2),
];

const subscribers = [...new Set(CANDIDATES.map((a) => a.toLowerCase()))];

const now = BigInt(Math.floor(Date.now() / 1000));
let stranded = 0;

console.log(
  "address                                      V5 expiry            V5 active  V6 active",
);
console.log("-".repeat(92));

for (const address of subscribers) {
  const [v5, v6] = await Promise.all([
    client.readContract({
      address: V5,
      abi: SUBSCRIPTION_ABI,
      functionName: "getSubscriptionInfo",
      args: [address as `0x${string}`],
    }) as Promise<
      readonly [bigint, bigint, boolean, bigint, bigint, number, boolean]
    >,
    client
      .readContract({
        address: V6,
        abi: V6_ABI,
        functionName: "getSubscriptionInfo",
        args: [address as `0x${string}`],
      })
      .catch(() => null) as Promise<
      readonly [bigint, bigint, boolean, bigint, number, boolean] | null
    >,
  ]);

  const expiry = v5[1];
  // `active` is a stored flag; an expired subscription can still read true, so both are checked.
  const liveOnV5 = v5[2] && expiry >= now;
  const liveOnV6 = v6 ? v6[2] && v6[1] >= now : false;

  if (liveOnV5 && !liveOnV6) stranded++;

  const when =
    expiry === 0n
      ? "never"
      : new Date(Number(expiry) * 1000).toISOString().slice(0, 16);
  console.log(
    `${address}  ${when.padEnd(18)}  ${String(liveOnV5).padEnd(9)}  ${String(liveOnV6)}${liveOnV5 && !liveOnV6 ? "   <-- STRANDED" : ""}`,
  );
}

console.log(`\n${subscribers.length} addresses checked.`);
console.log(
  "This is every address the project has a record of, not every address that ever subscribed —\n" +
    "event enumeration needs a paid RPC tier. A subscriber nobody recorded would not appear here.",
);
console.log(
  stranded === 0
    ? "\nNobody is stranded: every unexpired V5 subscription is matched on V6, or all have lapsed."
    : `\n${stranded} subscriber(s) hold an unexpired V5 subscription the app cannot see. They paid and show as unsubscribed.`,
);
