import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "@/app/chains";

/**
 * Monthly Distribution Keeper
 *
 * Subscription revenue only reaches artists once finalizeMonthlyDistribution has
 * run for a month: it splits revenue 10% treasury / 20% listener reserve / 70%
 * artist pool, and until it does, artists have nothing to claim. Nothing in the
 * app ever called it — no route, no schedule, no UI — so revenue simply sat.
 *
 * The contract enforces four preconditions, and one of them is a trap:
 *
 *   monthId < block.timestamp / 30 days   month must have ended
 *   !finalized                            not already done
 *   totalRevenue > 0                      someone subscribed
 *   totalPlays > 0                        <-- reverts forever if never satisfied
 *
 * A month that took revenue but recorded no plays can never be finalized, and
 * its WMON is stuck (only emergencyWithdraw gets it out). Months 682 and 683
 * are already in that state, holding 120 WMON between them.
 *
 * So this keeper does NOT blindly call finalize. It classifies every month in
 * the lookback window and reports stranded ones loudly, so a month that is
 * quietly accruing revenue with zero plays is visible within a day instead of
 * being discovered after it is permanently unrecoverable.
 *
 * owner() is an EOA matching DEPLOYER_PRIVATE_KEY, so it signs directly.
 *
 * Header: x-cron-secret or Authorization: Bearer <secret>
 * Query:  ?dry=1 to classify without sending transactions
 *         ?lookback=N to widen the scan (default 12 months)
 */

const RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";
const SUBSCRIPTION = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as
  | Address
  | undefined;
const OWNER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const CRON_SECRET = process.env.KEEPER_SECRET || process.env.CRON_SECRET;

const DEFAULT_LOOKBACK = 12;
const MAX_LOOKBACK = 60;

const SUBSCRIPTION_ABI = parseAbi([
  "function monthlyStats(uint256 monthId) view returns (uint256 totalRevenue, uint256 totalPlays, uint256 distributedAmount, bool finalized)",
  "function finalizeMonthlyDistribution(uint256 monthId) external",
  "function owner() view returns (address)",
]);

type MonthVerdict =
  | "finalized"
  | "no-revenue"
  | "stranded"
  | "ready"
  | "current";

interface MonthReport {
  monthId: number;
  verdict: MonthVerdict;
  revenueWmon: string;
  plays: number;
  txHash?: string;
  error?: string;
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const authorized =
    !CRON_SECRET ||
    cronSecret === CRON_SECRET ||
    authHeader === `Bearer ${CRON_SECRET}`;

  if (!authorized) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!SUBSCRIPTION || !OWNER_KEY) {
    console.error(
      "[FinalizeKeeper] Missing NEXT_PUBLIC_MUSIC_SUBSCRIPTION or DEPLOYER_PRIVATE_KEY",
    );
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const lookback = Math.min(
    Math.max(
      Number(req.nextUrl.searchParams.get("lookback")) || DEFAULT_LOOKBACK,
      1,
    ),
    MAX_LOOKBACK,
  );

  try {
    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(RPC),
    });
    const account = privateKeyToAccount(
      (OWNER_KEY.startsWith("0x") ? OWNER_KEY : `0x${OWNER_KEY}`) as Hex,
    );
    const walletClient = createWalletClient({
      account,
      chain: activeChain,
      transport: http(RPC),
    });

    // finalizeMonthlyDistribution is onlyOwner — fail loudly rather than
    // burning gas on a guaranteed revert.
    const owner = await publicClient.readContract({
      address: SUBSCRIPTION,
      abi: SUBSCRIPTION_ABI,
      functionName: "owner",
    });
    if (owner.toLowerCase() !== account.address.toLowerCase()) {
      console.error(
        `[FinalizeKeeper] Signer ${account.address} is not owner ${owner}`,
      );
      return NextResponse.json(
        { success: false, error: "Signer is not the contract owner" },
        { status: 500 },
      );
    }

    // Same bucketing the contract uses: 30-day periods since epoch, not calendar
    // months. That is why this runs daily — a monthly schedule would drift off
    // the boundary.
    const block = await publicClient.getBlock();
    const currentMonthId = Number(block.timestamp / (30n * 24n * 60n * 60n));

    const reports: MonthReport[] = [];

    for (let i = 0; i <= lookback; i++) {
      const monthId = currentMonthId - i;
      if (monthId < 0) break;

      const [totalRevenue, totalPlays, , finalized] =
        await publicClient.readContract({
          address: SUBSCRIPTION,
          abi: SUBSCRIPTION_ABI,
          functionName: "monthlyStats",
          args: [BigInt(monthId)],
        });

      const base = {
        monthId,
        revenueWmon: formatEther(totalRevenue),
        plays: Number(totalPlays),
      };

      // The contract requires monthId < current, so the in-flight month is never
      // finalizable. Reported anyway so a month accruing revenue with zero plays
      // is visible BEFORE it ends and becomes unrecoverable.
      if (monthId === currentMonthId) {
        reports.push({ ...base, verdict: "current" });
        if (totalRevenue > 0n && totalPlays === 0n) {
          console.warn(
            `[FinalizeKeeper] WARNING month ${monthId} (in progress) holds ${formatEther(totalRevenue)} WMON with ZERO plays. ` +
              `If it ends this way the revenue is permanently unrecoverable.`,
          );
        }
        continue;
      }

      if (finalized) {
        reports.push({ ...base, verdict: "finalized" });
        continue;
      }
      if (totalRevenue === 0n) {
        reports.push({ ...base, verdict: "no-revenue" });
        continue;
      }
      if (totalPlays === 0n) {
        // Terminal: plays can only be added during the month, which has passed.
        reports.push({ ...base, verdict: "stranded" });
        console.error(
          `[FinalizeKeeper] STRANDED month ${monthId}: ${formatEther(totalRevenue)} WMON with zero plays. ` +
            `finalizeMonthlyDistribution can never succeed for it; only emergencyWithdraw can recover the funds.`,
        );
        continue;
      }

      if (dryRun) {
        reports.push({ ...base, verdict: "ready" });
        continue;
      }

      // Simulate first so a revert costs nothing and surfaces its reason.
      try {
        await publicClient.simulateContract({
          address: SUBSCRIPTION,
          abi: SUBSCRIPTION_ABI,
          functionName: "finalizeMonthlyDistribution",
          args: [BigInt(monthId)],
          account,
        });

        const hash = await walletClient.writeContract({
          address: SUBSCRIPTION,
          abi: SUBSCRIPTION_ABI,
          functionName: "finalizeMonthlyDistribution",
          args: [BigInt(monthId)],
        });
        await publicClient.waitForTransactionReceipt({ hash });

        reports.push({ ...base, verdict: "ready", txHash: hash });
        console.log(
          `[FinalizeKeeper] Finalized month ${monthId} (${formatEther(totalRevenue)} WMON, ${totalPlays} plays) tx=${hash}`,
        );
      } catch (err: any) {
        const message = err?.shortMessage ?? err?.message ?? "unknown error";
        reports.push({ ...base, verdict: "ready", error: message });
        console.error(
          `[FinalizeKeeper] Failed to finalize month ${monthId}:`,
          message,
        );
        // Keep going — one bad month must not block the rest.
      }
    }

    const finalizedNow = reports.filter((r) => r.txHash);
    const failed = reports.filter((r) => r.error);
    const stranded = reports.filter((r) => r.verdict === "stranded");

    return NextResponse.json({
      // Stranded months are a standing condition, not a run failure, so they do
      // not flip success — but they are surfaced at the top level so the caller
      // can alert on them.
      success: failed.length === 0,
      dryRun,
      currentMonthId,
      lookback,
      summary: {
        finalized: finalizedNow.length,
        failed: failed.length,
        stranded: stranded.length,
        strandedWmon: stranded
          .reduce((sum, r) => sum + parseFloat(r.revenueWmon), 0)
          .toFixed(4),
      },
      months: reports.filter((r) => r.verdict !== "no-revenue" || r.plays > 0),
    });
  } catch (error: any) {
    console.error("[FinalizeKeeper] Error:", error?.message ?? error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
