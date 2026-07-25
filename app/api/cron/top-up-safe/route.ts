import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "@/app/chains";

/**
 * Treasury Safe Gas Keeper
 *
 * The platform Safe (also MusicSubscriptionV5.treasury()) receives its income in
 * WMON — from LiveRadio queue payments and, once monthly distribution can run, the
 * 10% TREASURY_PERCENTAGE cut. But Pimlico sponsorship needs NATIVE MON, and
 * lib/pimlico-safe-aa.ts refuses to build a UserOperation below 3 MON.
 *
 * So the Safe can hold thousands of WMON and still fail every transaction.
 *
 * This keeper unwraps WMON -> native MON whenever the native balance drops below
 * TARGET_MIN, topping back up to TARGET.
 *
 * It deliberately does NOT go through Pimlico: that is the exact path that fails
 * when the Safe is empty. Instead the owner EOA signs and submits a Safe
 * execTransaction directly, paying gas itself. That means this keeper still works
 * when the Safe has 0 native MON — no manual bootstrap needed, ever.
 *
 * Safe is 1-of-1 (owner = DEPLOYER_PRIVATE_KEY), so we use the Safe pre-validated
 * signature format {r: owner, s: 0, v: 1}, which is valid when msg.sender is the owner.
 *
 * Header: x-cron-secret or Authorization: Bearer <secret>
 */

const RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";
const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as
  | Address
  | undefined;
const WMON_ADDRESS = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address;
const OWNER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const CRON_SECRET = process.env.KEEPER_SECRET || process.env.CRON_SECRET;

/** Top up when the Safe's native balance drops below this. */
const TARGET_MIN = parseEther("10");
/** Unwrap up to this much, so we sit well clear of the 3 MON floor. */
const TARGET = parseEther("25");
/** Owner EOA pays gas for this keeper; warn when it gets thin. */
const OWNER_MIN = parseEther("0.5");
/** Refill the owner EOA from the Safe when it drops below OWNER_MIN. */
const OWNER_REFILL = parseEther("2");

const WMON_ABI = parseAbi([
  "function withdraw(uint256 wad) external",
  "function balanceOf(address) view returns (uint256)",
]);

const SAFE_ABI = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) external payable returns (bool)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

/**
 * Safe pre-validated signature: valid only when msg.sender is the owner.
 * Layout is r = owner left-padded to 32 bytes, s = 0, v = 1.
 */
function prevalidatedSignature(owner: Address): Hex {
  return `0x${owner.slice(2).toLowerCase().padStart(64, "0")}${"0".repeat(64)}01` as Hex;
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

  if (!SAFE_ADDRESS || !OWNER_KEY) {
    console.error(
      "[SafeKeeper] Missing NEXT_PUBLIC_SAFE_ACCOUNT or DEPLOYER_PRIVATE_KEY",
    );
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

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

    // The owner EOA pays gas for everything below, so verify it is actually an owner.
    const owners = await publicClient.readContract({
      address: SAFE_ADDRESS,
      abi: SAFE_ABI,
      functionName: "getOwners",
    });
    if (
      !owners
        .map((o) => o.toLowerCase())
        .includes(account.address.toLowerCase())
    ) {
      console.error(
        "[SafeKeeper] Signer is not a Safe owner:",
        account.address,
      );
      return NextResponse.json(
        { success: false, error: "Signer is not a Safe owner" },
        { status: 500 },
      );
    }

    const [safeNative, safeWmon, ownerNative] = await Promise.all([
      publicClient.getBalance({ address: SAFE_ADDRESS }),
      publicClient.readContract({
        address: WMON_ADDRESS,
        abi: WMON_ABI,
        functionName: "balanceOf",
        args: [SAFE_ADDRESS],
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    const state = {
      safe: SAFE_ADDRESS,
      safeNativeMon: formatEther(safeNative),
      safeWmon: formatEther(safeWmon),
      ownerNativeMon: formatEther(ownerNative),
    };

    const actions: string[] = [];
    const txs: Record<string, string> = {};

    // ?dry=1 reports what it *would* do without sending anything. Use this the
    // first time, and any time you change the thresholds.
    const dryRun = req.nextUrl.searchParams.get("dry") === "1";

    // ---- 1. Unwrap WMON -> native MON if the Safe is running low ----------------
    if (safeNative < TARGET_MIN) {
      const deficit = TARGET - safeNative;
      const amount = deficit < safeWmon ? deficit : safeWmon;

      if (amount === 0n) {
        actions.push("safe below threshold but holds no WMON to unwrap");
        console.warn("[SafeKeeper] Safe low on MON and has no WMON:", state);
      } else {
        if (amount < deficit) {
          actions.push(
            `partial top-up: wanted ${formatEther(deficit)} MON, only ${formatEther(safeWmon)} WMON available`,
          );
        }

        const withdrawData = encodeFunctionData({
          abi: WMON_ABI,
          functionName: "withdraw",
          args: [amount],
        });

        if (dryRun) {
          actions.push(`[dry] would unwrap ${formatEther(amount)} WMON -> MON`);
          return NextResponse.json({
            success: true,
            dryRun: true,
            before: state,
            actions,
          });
        }

        // Safe calls WMON.withdraw(amount); the unwrapped MON lands in the Safe.
        const hash = await walletClient.writeContract({
          address: SAFE_ADDRESS,
          abi: SAFE_ABI,
          functionName: "execTransaction",
          args: [
            WMON_ADDRESS,
            0n,
            withdrawData,
            0,
            0n,
            0n,
            0n,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            prevalidatedSignature(account.address),
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash });

        txs.unwrap = hash;
        actions.push(`unwrapped ${formatEther(amount)} WMON -> MON`);
        console.log(
          `[SafeKeeper] Unwrapped ${formatEther(amount)} WMON, tx=${hash}`,
        );
      }
    }

    // ---- 2. Keep the owner EOA able to pay gas for future runs ------------------
    if (ownerNative < OWNER_MIN) {
      const safeNow = await publicClient.getBalance({ address: SAFE_ADDRESS });
      if (dryRun) {
        actions.push(
          `[dry] would refill owner EOA with ${formatEther(OWNER_REFILL)} MON`,
        );
      } else if (safeNow > OWNER_REFILL + parseEther("3")) {
        const hash = await walletClient.writeContract({
          address: SAFE_ADDRESS,
          abi: SAFE_ABI,
          functionName: "execTransaction",
          args: [
            account.address,
            OWNER_REFILL,
            "0x",
            0,
            0n,
            0n,
            0n,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            prevalidatedSignature(account.address),
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash });

        txs.ownerRefill = hash;
        actions.push(
          `refilled owner EOA with ${formatEther(OWNER_REFILL)} MON`,
        );
        console.log(`[SafeKeeper] Refilled owner EOA, tx=${hash}`);
      } else {
        actions.push("owner EOA low but Safe cannot spare a refill");
        console.warn(
          "[SafeKeeper] Owner EOA low, Safe too thin to refill:",
          state,
        );
      }
    }

    if (actions.length === 0) {
      actions.push("no action needed");
    }

    const after = await publicClient.getBalance({ address: SAFE_ADDRESS });

    return NextResponse.json({
      success: true,
      before: state,
      after: { safeNativeMon: formatEther(after) },
      thresholds: {
        topUpBelow: formatEther(TARGET_MIN),
        topUpTo: formatEther(TARGET),
        pimlicoFloor: "3.0",
      },
      actions,
      txs,
    });
  } catch (error: any) {
    console.error("[SafeKeeper] Error:", error?.message ?? error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
