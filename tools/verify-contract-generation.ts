/**
 * Verifies the generation switch in `lib/contract-generation.ts`.
 *
 * Run: `node --experimental-strip-types tools/verify-contract-generation.ts`
 *
 * This project has no test runner, and adding one during a cutover is its own risk. Node 24
 * executes TypeScript directly, so this exercises the real module rather than a copy of its
 * logic — a copy would only prove the copy agrees with itself.
 *
 * What it is actually protecting: `getSubscriptionInfo` lost a field in V6, so a V5-shaped
 * positional decode against V6 returns `isFlagged` where `lastTier` is expected. It does not
 * throw. It reports the wrong subscription tier and a wrong flag state, quietly, forever.
 */

const failures: string[] = [];
let checks = 0;

/**
 * `JSON.stringify` throws on a BigInt, and several values here are BigInts. Serialising them
 * explicitly keeps a mismatch reported as a failure rather than crashing the run — a crash is
 * loud enough to notice but tells you nothing about which check broke.
 */
function show(v: unknown): string {
  if (typeof v === "bigint") return `${v}n`;
  return JSON.stringify(v) ?? String(v);
}

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = show(actual);
  const e = show(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/** The module reads the env var at call time, so re-importing per generation is not needed. */
async function load() {
  return await import("../lib/contract-generation.ts");
}

function setGeneration(v3: boolean) {
  if (v3) process.env.NEXT_PUBLIC_CONTRACTS_V3 = "true";
  else delete process.env.NEXT_PUBLIC_CONTRACTS_V3;
}

const main = async () => {
  const m = await load();

  // ---------------------------------------------------------------- the switch
  setGeneration(false);
  check("legacy: isV3Contracts() is false", m.isV3Contracts(), false);
  setGeneration(true);
  check("v3: isV3Contracts() is true", m.isV3Contracts(), true);

  // Anything other than exactly "true" must not flip it. A half-set flag is worse than an
  // unset one: it would put the app on a mixed pair of ABIs.
  for (const value of ["TRUE", "1", "yes", "false", ""]) {
    process.env.NEXT_PUBLIC_CONTRACTS_V3 = value;
    check(`flag "${value}" does not enable v3`, m.isV3Contracts(), false);
  }

  // ------------------------------------------------- the decode that can go wrong
  // A subscriber on the MONTHLY tier (2) who is NOT flagged.
  const v5Tuple = [123n, 1000n, true, 7n, 0n, 2, false]; // ..., flagVotes, lastTier, isFlagged
  const v6Tuple = [123n, 1000n, true, 7n, 2, false]; //     ..., lastTier, isFlagged

  setGeneration(false);
  const fromV5 = m.decodeSubscriptionInfo(v5Tuple);
  check("legacy: lastTier decoded", fromV5.lastTier, 2);
  check("legacy: isFlagged decoded", fromV5.isFlagged, false);
  check("legacy: userFid decoded", String(fromV5.userFid), "123");

  setGeneration(true);
  const fromV6 = m.decodeSubscriptionInfo(v6Tuple);
  check("v3: lastTier decoded", fromV6.lastTier, 2);
  check("v3: isFlagged decoded", fromV6.isFlagged, false);

  // The whole point: both generations must produce the SAME answer for the same subscriber.
  check("both generations agree on tier", fromV5.lastTier, fromV6.lastTier);
  check("both generations agree on flag", fromV5.isFlagged, fromV6.isFlagged);

  // And the failure being prevented, demonstrated: decoding a V6 tuple with the legacy rule
  // reads index 5, which is `isFlagged` (false) rather than `lastTier` (2).
  setGeneration(false);
  const misdecoded = m.decodeSubscriptionInfo(v6Tuple);
  check(
    "a V6 tuple read with the legacy rule silently yields the WRONG tier",
    misdecoded.lastTier !== 2,
    true,
  );

  // ------------------------------------------------------------------ the FID gate
  setGeneration(false);
  check(
    "legacy: a real FID is usable",
    String(m.subscriptionFid(868469)),
    "868469",
  );
  check("legacy: no FID means cannot subscribe", m.subscriptionFid(0), null);
  check(
    "legacy: undefined FID means cannot subscribe",
    m.subscriptionFid(undefined),
    null,
  );
  check(
    "legacy: wallet-only is blocked with a reason",
    typeof m.walletOnlySubscribeBlockedReason(0) === "string",
    true,
  );
  check(
    "legacy: a Farcaster user is not blocked",
    m.walletOnlySubscribeBlockedReason(868469),
    null,
  );

  setGeneration(true);
  check(
    "v3: a real FID still passes through",
    String(m.subscriptionFid(868469)),
    "868469",
  );
  check("v3: no FID becomes 0, not null", String(m.subscriptionFid(0)), "0");
  check(
    "v3: undefined FID becomes 0",
    String(m.subscriptionFid(undefined)),
    "0",
  );
  check(
    "v3: wallet-only is NOT blocked",
    m.walletOnlySubscribeBlockedReason(0),
    null,
  );
  check(
    "v3: Farcaster user still not blocked",
    m.walletOnlySubscribeBlockedReason(868469),
    null,
  );

  // --------------------------------------------------------------------- the ABIs
  setGeneration(false);
  const legacyAbi = JSON.stringify(m.subscriptionInfoAbi());
  setGeneration(true);
  const v3Abi = JSON.stringify(m.subscriptionInfoAbi());
  check("the two generations use different ABIs", legacyAbi !== v3Abi, true);
  check("legacy ABI carries flagVotes", legacyAbi.includes("flagVotes"), true);
  check("v3 ABI does not carry flagVotes", v3Abi.includes("flagVotes"), false);

  // ------------------------------------------------------------------- formatting
  check(
    "shortenAddress",
    m.shortenAddress("0x1a2b3c4d5e6f7890abcdef1234567890abcdef90"),
    "0x1a2b…ef90",
  );

  setGeneration(false);
  // ---------------------------------------------------------------------------
  // findDuplicateMaster
  //
  // V2 answered "already published?" with hasSong(artist, title). v3 masters carry no title, so
  // the same question has to be asked of the uri. This is the check that stops an artist paying to
  // publish the same track twice, and it silently does nothing if it asks the wrong contract the
  // wrong question — so every branch gets exercised against a stub client that records what was
  // actually called.

  interface StubCall {
    functionName: string;
    args?: readonly unknown[];
  }

  function stubClient(
    answers: Record<string, (args: readonly unknown[]) => unknown>,
    log: StubCall[] = [],
  ) {
    return {
      calls: log,
      readContract: async ({ functionName, args }: any) => {
        log.push({ functionName, args });
        const fn = answers[functionName];
        if (!fn) throw new Error(`unexpected call: ${functionName}`);
        return fn(args ?? []);
      },
    } as any;
  }

  const ARTIST = "0xAAaAaAAAAaAAAaAAAaAaaaAaaAaAaAaAAaaAaAAA";
  const OTHER = "0xBBbBBBbbBbBBbbBBBbBbbbbbBbBbbbBbBBbBBBBB";

  // --- V2: the title lookup ---
  setGeneration(false);
  {
    const cg = await load();
    const calls: StubCall[] = [];
    const client = stubClient({ hasSong: () => true }, calls);
    const dup = await cg.findDuplicateMaster(client, {
      nftAddress: "0x1111111111111111111111111111111111111111",
      artist: ARTIST,
      uri: "ipfs://whatever",
      title: "My Song",
    });
    check("V2 reports a duplicate when hasSong says so", dup, 0n);
    check("V2 asks hasSong, not a uri scan", calls[0]?.functionName, "hasSong");
    check("V2 asks about the title", calls[0]?.args?.[1], "My Song");
  }
  {
    const cg = await load();
    const client = stubClient({ hasSong: () => false });
    check(
      "V2 reports no duplicate when hasSong says no",
      await cg.findDuplicateMaster(client, {
        nftAddress: "0x1111111111111111111111111111111111111111",
        artist: ARTIST,
        uri: "ipfs://whatever",
        title: "My Song",
      }),
      null,
    );
  }

  // --- v3: the uri scan ---
  setGeneration(true);
  const V3_MASTERS: Record<string, { artist: string; uri: string }> = {
    "1": { artist: OTHER, uri: "ipfs://someone-else" },
    "2": { artist: ARTIST, uri: "ipfs://mine-one" },
    "3": { artist: ARTIST, uri: "ipfs://mine-two" },
  };
  const v3Answers = {
    totalMasters: () => 3n,
    getMaster: (args: readonly unknown[]) => {
      const m = V3_MASTERS[String(args[0])];
      return [m.artist, 0n, 0n, 0, 0, 0, ZERO, 0n, ZERO];
    },
    tokenURI: (args: readonly unknown[]) => V3_MASTERS[String(args[0])].uri,
  };
  const ZERO = "0x0000000000000000000000000000000000000000";

  {
    const cg = await load();
    const calls: StubCall[] = [];
    check(
      "v3 finds the artist's own duplicate uri and names the master",
      await cg.findDuplicateMaster(stubClient(v3Answers, calls), {
        nftAddress: "0x1111111111111111111111111111111111111111",
        artist: ARTIST,
        uri: "ipfs://mine-two",
        title: "irrelevant under v3",
      }),
      3n,
    );
    check(
      "v3 never calls hasSong, which does not exist there",
      calls.some((c) => c.functionName === "hasSong"),
      false,
    );
  }
  {
    const cg = await load();
    check(
      "v3 reports no duplicate for a new uri",
      await cg.findDuplicateMaster(stubClient(v3Answers), {
        nftAddress: "0x1111111111111111111111111111111111111111",
        artist: ARTIST,
        uri: "ipfs://brand-new",
        title: "x",
      }),
      null,
    );
  }
  {
    // The same uri published by somebody else is not this artist's duplicate. Getting this wrong
    // would block an artist from minting because an unrelated account used the same metadata.
    const cg = await load();
    check(
      "v3 ignores another artist's identical uri",
      await cg.findDuplicateMaster(stubClient(v3Answers), {
        nftAddress: "0x1111111111111111111111111111111111111111",
        artist: ARTIST,
        uri: "ipfs://someone-else",
        title: "x",
      }),
      null,
    );
  }
  {
    // A degraded RPC must not become a gate that strands a legitimate mint.
    const cg = await load();
    check(
      "v3 fails open when the chain cannot be read",
      await cg.findDuplicateMaster(
        stubClient({
          totalMasters: () => {
            throw new Error("rpc down");
          },
        }),
        {
          nftAddress: "0x1111111111111111111111111111111111111111",
          artist: ARTIST,
          uri: "ipfs://mine-one",
          title: "x",
        },
      ),
      null,
    );
  }
  {
    // A purged master in the middle of the range must not abandon the scan before the match.
    const cg = await load();
    check(
      "v3 skips a purged id and still finds a later duplicate",
      await cg.findDuplicateMaster(
        stubClient({
          ...v3Answers,
          getMaster: (args: readonly unknown[]) => {
            if (String(args[0]) === "2") throw new Error("purged");
            const m = V3_MASTERS[String(args[0])];
            return [m.artist, 0n, 0n, 0, 0, 0, ZERO, 0n, ZERO];
          },
        }),
        {
          nftAddress: "0x1111111111111111111111111111111111111111",
          artist: ARTIST,
          uri: "ipfs://mine-two",
          title: "x",
        },
      ),
      3n,
    );
  }

  console.log(`\n${checks} checks run`);
  if (failures.length) {
    console.error(`\n✗ ${failures.length} FAILED:\n`);
    for (const f of failures) console.error(`  - ${f}\n`);
    process.exit(1);
  }
  console.log("✓ all passed\n");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
