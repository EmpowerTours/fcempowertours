import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { activeChain } from "@/app/chains";

/**
 * Config Health Check
 *
 * Every serious outage in this app so far has been a configuration mismatch, not
 * a code bug:
 *
 *  - PlayOracleV3 pointed at a superseded MusicSubscription, so every play
 *    reverted with "Only oracle can record plays" — silently, for months
 *  - MusicSubscriptionV5.oracle() pointed at an EOA rather than the oracle
 *  - The radio reward manager paid out a deprecated TOURS token
 *  - NEXT_PUBLIC_LIVE_RADIO and the documented radio address disagreed
 *
 * None of these are visible from the outside: the app boots fine, the UI renders,
 * and the failure only shows up as "nothing happens". So this endpoint reads the
 * addresses the running deployment actually resolves, follows the pointers between
 * the contracts, and reports whether they agree.
 *
 * Read-only and unauthenticated — it exposes deployed contract addresses, which
 * are public on-chain anyway, and no secrets.
 */

const RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";

const ORACLE_ABI = parseAbi([
  "function musicSubscription() view returns (address)",
]);
const SUBSCRIPTION_ABI = parseAbi([
  "function oracle() view returns (address)",
  "function treasury() view returns (address)",
]);
const RADIO_ABI = parseAbi([
  "function rewardManager() view returns (address)",
  "function isLive() view returns (bool)",
]);
const RM_ABI = parseAbi([
  "function toursToken() view returns (address)",
  "function authorizedDistributors(address) view returns (bool)",
]);

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function eq(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export async function GET() {
  const env = {
    liveRadio: process.env.NEXT_PUBLIC_LIVE_RADIO as Address | undefined,
    playOracle: process.env.NEXT_PUBLIC_PLAY_ORACLE as Address | undefined,
    musicSubscription: process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as
      | Address
      | undefined,
    toursToken: process.env.NEXT_PUBLIC_TOURS_TOKEN as Address | undefined,
    rewardManager: process.env.NEXT_PUBLIC_TOURS_REWARD_MANAGER as
      | Address
      | undefined,
    listenerRewardPool: process.env.NEXT_PUBLIC_LISTENER_REWARD_POOL as
      | Address
      | undefined,
    safeAccount: process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address | undefined,

    // Which mint path is live. This decides whether a music mint goes through
    // SalesController/LicenseRegistry (v3, where artistFid is optional and 0
    // means "no Farcaster account") or the old EmpowerToursNFT, which reverts
    // "Invalid FID" for every wallet-only user.
    //
    // Reported here because it is the difference between a working mint and an
    // impossible one, and it was previously only knowable by reading .env on the
    // server — so diagnosing it meant guessing which contract was in play.
    contractsV3: process.env.NEXT_PUBLIC_CONTRACTS_V3 === "true",
    nftContract: process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined,
    salesController: process.env.NEXT_PUBLIC_SALES_CONTROLLER as
      | Address
      | undefined,
  };

  const checks: Check[] = [];

  try {
    const client = createPublicClient({
      chain: activeChain,
      transport: http(RPC),
    });

    // --- play recording path -------------------------------------------------
    if (env.playOracle && env.musicSubscription) {
      const [oracleTarget, subOracle] = await Promise.all([
        client.readContract({
          address: env.playOracle,
          abi: ORACLE_ABI,
          functionName: "musicSubscription",
        }),
        client.readContract({
          address: env.musicSubscription,
          abi: SUBSCRIPTION_ABI,
          functionName: "oracle",
        }),
      ]);

      checks.push({
        name: "PlayOracle → MusicSubscription",
        ok: eq(oracleTarget, env.musicSubscription),
        detail: eq(oracleTarget, env.musicSubscription)
          ? "oracle points at the configured subscription"
          : `oracle points at ${oracleTarget}, but NEXT_PUBLIC_MUSIC_SUBSCRIPTION is ${env.musicSubscription} — plays will revert`,
      });

      checks.push({
        name: "MusicSubscription.oracle → PlayOracle",
        ok: eq(subOracle, env.playOracle),
        detail: eq(subOracle, env.playOracle)
          ? "subscription accepts plays from the configured oracle"
          : `subscription expects oracle ${subOracle}, but NEXT_PUBLIC_PLAY_ORACLE is ${env.playOracle} — plays will revert with "Only oracle can record plays"`,
      });
    }

    // --- radio + reward path -------------------------------------------------
    if (env.liveRadio) {
      const isLive = await client
        .readContract({
          address: env.liveRadio,
          abi: RADIO_ABI,
          functionName: "isLive",
        })
        .catch(() => null);

      checks.push({
        name: "LiveRadio reachable",
        ok: isLive !== null,
        detail:
          isLive === null
            ? `no isLive() at ${env.liveRadio} — wrong address?`
            : `isLive = ${isLive}`,
      });

      // Only V3-style radios delegate rewards; V2 hardcodes them, so a missing
      // rewardManager() here is informational rather than a failure.
      const radioRm = await client
        .readContract({
          address: env.liveRadio,
          abi: RADIO_ABI,
          functionName: "rewardManager",
        })
        .catch(() => null);

      if (radioRm) {
        const [rmToken, rmAuthorised] = await Promise.all([
          client
            .readContract({
              address: radioRm,
              abi: RM_ABI,
              functionName: "toursToken",
            })
            .catch(() => null),
          client
            .readContract({
              address: radioRm,
              abi: RM_ABI,
              functionName: "authorizedDistributors",
              args: [env.liveRadio],
            })
            .catch(() => null),
        ]);

        checks.push({
          name: "Radio reward manager pays the configured TOURS",
          ok: eq(rmToken, env.toursToken),
          detail: eq(rmToken, env.toursToken)
            ? "reward manager pays the same TOURS the app uses"
            : `reward manager pays ${rmToken}, but NEXT_PUBLIC_TOURS_TOKEN is ${env.toursToken} — listeners would earn the wrong token`,
        });

        checks.push({
          name: "Radio authorised to distribute rewards",
          ok: rmAuthorised === true,
          detail:
            rmAuthorised === true
              ? "radio can distribute from the reward manager"
              : "radio is NOT an authorised distributor — reward payouts will fail",
        });

        checks.push({
          name: "Radio reward manager matches env",
          ok: eq(radioRm, env.rewardManager),
          detail: eq(radioRm, env.rewardManager)
            ? "radio and NEXT_PUBLIC_TOURS_REWARD_MANAGER agree"
            : `radio uses ${radioRm}, env says ${env.rewardManager} — two managers in play`,
        });
      } else {
        checks.push({
          name: "Radio reward manager",
          ok: true,
          detail:
            "radio has no rewardManager() — hardcoded reward constants (V2-style)",
        });
      }
    }

    const failing = checks.filter((c) => !c.ok);

    return NextResponse.json(
      {
        healthy: failing.length === 0,
        chainId: activeChain.id,
        env,
        checks,
        failing: failing.map((c) => c.name),
      },
      { status: failing.length === 0 ? 200 : 500 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { healthy: false, error: error?.message ?? "Unknown error", env, checks },
      { status: 500 },
    );
  }
}
