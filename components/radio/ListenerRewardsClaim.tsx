"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeFunctionData, parseAbi, type Address } from "viem";

/** Monad mainnet, chain 143 — the chain ListenerRewardPool is deployed on. */
const MONAD_CHAIN_ID_HEX = "0x8f";

/**
 * ListenerRewardsClaim
 *
 * Shows active radio listeners their WMON earnings from the 20% DAO reserve
 * and allows them to claim via the ListenerRewardPool contract.
 */

const POOL_ADDRESS = process.env.NEXT_PUBLIC_LISTENER_REWARD_POOL as Address;

const POOL_ABI = parseAbi([
  "function batchClaimRewards(uint256[] calldata monthIds) external",
  "function claimReward(uint256 monthId) external",
]);

interface MonthData {
  monthId: number;
  points: number;
  estimatedPayout: string;
  claimed: boolean;
  poolTotal: string;
  totalListeners: number;
  finalized: boolean;
  /** Verified claim receipt, when one has been recorded. */
  txHash: string | null;
}

interface PendingData {
  accruing: boolean;
  monthId: number;
  myPoints: number;
  totalPoints: number;
  expectedPoolWMON: string;
  estimatedWMON: string;
  monthRevenueWMON: string;
  note: string;
}

interface EarningsData {
  pending?: PendingData;
  tours: {
    pendingRewards: number;
    totalRewardsEarned: number;
    firstListenerBonuses: number;
  };
  wmon: {
    totalClaimable: string;
    totalClaimed: string;
    currentReserveBalance: string;
    months: MonthData[];
  };
  activity: {
    totalSongsListened: number;
    currentStreak: number;
    longestStreak: number;
    lastListenDay: number;
    voiceNotesSubmitted: number;
    voiceNotesPlayed: number;
  };
}

interface ListenerRewardsClaimProps {
  /**
   * Wallet address to show earnings for. The Farcaster mini app authenticates
   * through useFarcasterContext, not wagmi, so useAccount() reports disconnected
   * there and the panel used to say "Connect wallet" to users who were connected.
   * Callers on that surface pass the address in; the standalone web app, which
   * does connect through RainbowKit, can omit it and fall back to wagmi.
   */
  address?: Address;
}

export default function ListenerRewardsClaim({
  address: addressProp,
}: ListenerRewardsClaimProps = {}) {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const address = addressProp ?? wagmiAddress;
  const isConnected = Boolean(address);

  /**
   * Claims MUST be signed by the listener's own wallet.
   *
   * ListenerRewardPool.batchClaimRewards credits `msg.sender` and has no
   * claimFor(address) variant, while the distribution cron allocates points to
   * WALLET addresses. Routing the claim through the bot-owned Safe therefore made
   * msg.sender the Safe, which holds zero points, and every claim reverted with
   * "No rewards to claim" — verified on-chain 2026-08-09 (wallet 0x33ffccb1 had
   * 1345 points / 60 WMON while its Safe had 0).
   *
   * The Farcaster wallet is now a wagmi connector (see StandaloneProviders), so
   * the mini app can sign directly and the delegated route is gone.
   */
  const canSign = wagmiConnected && Boolean(wagmiAddress);
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMonths, setShowMonths] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  // Delegated claims resolve over HTTP, so they need their own pending flag —
  // wagmi's txPending/receiptLoading only track the standalone signing path.
  const [claiming, setClaiming] = useState(false);

  const {
    writeContract,
    data: txHash,
    isPending: txPending,
  } = useWriteContract();
  const { data: receipt, isLoading: receiptLoading } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  const fetchEarnings = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/listener-earnings?address=${address}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to load earnings");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      fetchEarnings();
    }
  }, [isConnected, address, fetchEarnings]);

  /**
   * Record the claim transaction so the month can link to MonadScan later.
   *
   * The server re-derives everything from the receipt, so sending the hash is
   * enough — and a failure here must never look like a failed claim, since the
   * payout has already settled on-chain by this point.
   */
  const recordClaimTx = useCallback(async (hash: string) => {
    try {
      await fetch("/api/listener-claim-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash }),
      });
    } catch (e: any) {
      console.warn("[ListenerRewards] could not record claim tx:", e?.message);
    }
  }, []);

  // Refresh after successful claim
  useEffect(() => {
    if (receipt) {
      setClaimSuccess(true);
      // Wait for the receipt, not just submission — only mined claims get linked.
      if (txHash) {
        recordClaimTx(txHash).finally(() => fetchEarnings());
      } else {
        fetchEarnings();
      }
    }
  }, [receipt, txHash, recordClaimTx, fetchEarnings]);

  const unclaimedMonths =
    data?.wmon.months.filter(
      (m) => m.finalized && !m.claimed && m.points > 0,
    ) || [];
  const claimableAmount = parseFloat(data?.wmon.totalClaimable || "0");
  const hasClaimable = unclaimedMonths.length > 0 && claimableAmount > 0;

  const handleClaim = async () => {
    if (!POOL_ADDRESS || !hasClaimable) return;
    setClaimSuccess(false);
    setError("");

    const monthIds = unclaimedMonths.map((m) => m.monthId);

    const monthIdsForTx = monthIds.map((id) => BigInt(id));

    // ---- Mini app: sign with the Farcaster wallet via the SDK's EIP-1193
    // provider. wagmi has no connector for it, and the Safe cannot claim on a
    // listener's behalf, so this is the only route where msg.sender is correct.
    if (!canSign) {
      setClaiming(true);
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const provider = await sdk.wallet.getEthereumProvider();
        if (!provider) throw new Error("No Farcaster wallet available");

        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        const from = accounts?.[0];
        if (!from) throw new Error("Farcaster wallet returned no account");

        if (address && from.toLowerCase() !== address.toLowerCase()) {
          throw new Error(
            `Rewards belong to ${address.slice(0, 6)}…${address.slice(-4)} but the signed-in wallet is ${from.slice(0, 6)}…${from.slice(-4)}.`,
          );
        }

        // The pool is on Monad mainnet; ask the host to switch if it isn't.
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: MONAD_CHAIN_ID_HEX }],
          });
        } catch {
          // Already on Monad, or the host doesn't support switching.
        }

        const data =
          monthIdsForTx.length === 1
            ? encodeFunctionData({
                abi: POOL_ABI,
                functionName: "claimReward",
                args: [monthIdsForTx[0]],
              })
            : encodeFunctionData({
                abi: POOL_ABI,
                functionName: "batchClaimRewards",
                args: [monthIdsForTx],
              });

        const sentHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [{ from: from as Address, to: POOL_ADDRESS, data }],
        })) as string;

        setClaimSuccess(true);
        if (sentHash) await recordClaimTx(sentHash);
        await fetchEarnings();
      } catch (e: any) {
        const msg = e?.message || "Claim failed";
        setError(
          /No rewards to claim/i.test(msg)
            ? "This wallet has no unclaimed rewards for those months."
            : msg.split("\n")[0],
        );
      } finally {
        setClaiming(false);
      }
      return;
    }

    if (
      wagmiAddress &&
      address &&
      wagmiAddress.toLowerCase() !== address.toLowerCase()
    ) {
      setError(
        `Rewards belong to ${address.slice(0, 6)}…${address.slice(-4)} but ${wagmiAddress.slice(0, 6)}…${wagmiAddress.slice(-4)} is connected. Switch wallets to claim.`,
      );
      return;
    }

    const monthIdsBigInt = monthIds.map((id) => BigInt(id));
    const onError = (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      // Surface the reason instead of letting an unhandled throw blank the page.
      setError(
        /No rewards to claim/i.test(msg)
          ? "This wallet has no unclaimed rewards for those months."
          : msg.split("\n")[0] || "Claim failed",
      );
    };

    if (monthIdsBigInt.length === 1) {
      writeContract(
        {
          address: POOL_ADDRESS,
          abi: POOL_ABI,
          functionName: "claimReward",
          args: [monthIdsBigInt[0]],
        },
        { onError },
      );
    } else {
      writeContract(
        {
          address: POOL_ADDRESS,
          abi: POOL_ABI,
          functionName: "batchClaimRewards",
          args: [monthIdsBigInt],
        },
        { onError },
      );
    }
  };

  if (!isConnected) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Listener WMON Rewards</h3>
        <p style={styles.muted}>Connect wallet to view your radio earnings</p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Listener WMON Rewards</h3>
        <p style={styles.muted}>Loading earnings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Listener WMON Rewards</h3>
        <p style={{ color: "#ff6b6b" }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Listener WMON Rewards</h3>
      <p style={styles.subtitle}>
        Earn WMON from the 20% DAO reserve by listening to Live Radio
      </p>

      {/* Accruing state for the OPEN month.
          Without this the card shows a bare "0.0000 WMON" all month — the
          on-chain reserve is only credited when the month is finalized — and
          every listener reads that as broken rather than pending. */}
      {data?.pending?.accruing && (
        <div style={styles.pendingBox}>
          <div style={styles.pendingRow}>
            <span style={styles.pendingLabel}>
              Accruing · month {data.pending.monthId}
            </span>
            <span style={styles.pendingAmount}>
              ~{parseFloat(data.pending.estimatedWMON).toFixed(4)} WMON
            </span>
          </div>
          <p style={styles.pendingDetail}>
            {data.pending.myPoints} of {data.pending.totalPoints} listen points
            · pool ~{parseFloat(data.pending.expectedPoolWMON).toFixed(2)} WMON
            (20% of {parseFloat(data.pending.monthRevenueWMON).toFixed(0)} WMON
            revenue so far)
          </p>
          <p style={styles.pendingNote}>{data.pending.note}</p>
        </div>
      )}

      {/* Stats grid */}
      <div style={styles.grid}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Claimable WMON</span>
          <span style={styles.statValueAmber}>
            {claimableAmount.toFixed(4)} WMON
          </span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Claimed WMON</span>
          <span style={styles.statValue}>
            {parseFloat(data?.wmon.totalClaimed || "0").toFixed(4)}
          </span>
        </div>
        {/* "Pending TOURS" removed on 2026-09-03. The reward manager holds
            1,000,000 TOURS but authorizedDistributors(V6) is false on chain,
            so claimToursReward reverts -- this counted up a balance the
            contract will not pay. The listener reward that IS real settles in
            WMON, and is shown above. */}
        <div style={styles.stat}>
          <span style={styles.statLabel}>Songs Listened</span>
          <span style={styles.statValue}>
            {data?.activity.totalSongsListened || 0}
          </span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Current Streak</span>
          <span style={styles.statValue}>
            {data?.activity.currentStreak || 0} days
          </span>
        </div>
        <div style={styles.stat}>
          {/* While a month is open the on-chain reserve reads 0, so show the
              pool this month is on track to fund instead of a misleading zero. */}
          <span style={styles.statLabel}>
            {data?.pending?.accruing ? "Pool (est.)" : "DAO Reserve"}
          </span>
          <span style={styles.statValue}>
            {parseFloat(
              data?.pending?.accruing
                ? data.pending.expectedPoolWMON
                : data?.wmon.currentReserveBalance || "0",
            ).toFixed(2)}{" "}
            WMON
          </span>
        </div>
      </div>

      {/* Claim button */}
      {hasClaimable && (
        <button
          onClick={handleClaim}
          disabled={txPending || receiptLoading || claiming}
          style={{
            ...styles.claimButton,
            opacity: txPending || receiptLoading || claiming ? 0.6 : 1,
          }}
        >
          {claiming
            ? "Claiming..."
            : txPending
              ? "Confirm in wallet..."
              : receiptLoading
                ? "Claiming..."
                : `Claim ${claimableAmount.toFixed(4)} WMON`}
        </button>
      )}

      {claimSuccess && <p style={styles.success}>WMON claimed successfully!</p>}

      {/* Monthly breakdown toggle */}
      {data?.wmon.months && data.wmon.months.length > 0 && (
        <>
          <button
            onClick={() => setShowMonths(!showMonths)}
            style={styles.toggleButton}
          >
            {showMonths ? "Hide" : "Show"} Monthly Breakdown (
            {data.wmon.months.length})
          </button>

          {showMonths && (
            <div style={styles.monthsContainer}>
              {data.wmon.months.map((month) => (
                <div key={month.monthId} style={styles.monthRow}>
                  <div>
                    <span style={styles.monthLabel}>Month {month.monthId}</span>
                    <span style={styles.muted}>
                      {" "}
                      &middot; {month.points} listens &middot;{" "}
                      {month.totalListeners} listeners
                    </span>
                  </div>
                  <div>
                    <span
                      style={
                        month.claimed ? styles.muted : styles.statValueAmber
                      }
                    >
                      {parseFloat(month.estimatedPayout).toFixed(4)} WMON
                    </span>
                    {month.claimed &&
                      (month.txHash ? (
                        <a
                          href={`https://monadscan.com/tx/${month.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.claimedBadgeLink}
                          title="View the claim transaction on MonadScan"
                        >
                          Claimed ↗
                        </a>
                      ) : (
                        // No verified receipt stored for this claim, so there is
                        // nothing honest to link to.
                        <span style={styles.claimedBadge}>Claimed</span>
                      ))}
                    {!month.claimed && month.finalized && (
                      <span style={styles.claimableBadge}>Claimable</span>
                    )}
                    {!month.finalized && (
                      <span style={styles.pendingBadge}>Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Info footer */}
      <p style={styles.footer}>
        20% of all subscription revenue goes to active listeners. Your share is
        proportional to songs heard.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "rgba(18, 18, 26, 0.95)",
    border: "1px solid rgba(255, 171, 64, 0.15)",
    borderRadius: "12px",
    padding: "20px",
    marginTop: "16px",
  },
  title: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#ffab40",
    margin: "0 0 4px 0",
  },
  subtitle: {
    fontSize: "13px",
    color: "#8a8693",
    margin: "0 0 16px 0",
  },
  pendingBox: {
    background: "rgba(56,189,248,0.08)",
    border: "1px solid rgba(56,189,248,0.28)",
    borderRadius: "10px",
    padding: "12px",
    marginBottom: "16px",
  },
  pendingRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
  },
  pendingLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#7dd3fc",
    fontWeight: 600,
  },
  pendingAmount: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#38bdf8",
  },
  pendingDetail: {
    fontSize: "12px",
    color: "#cbd5e1",
    margin: "8px 0 0 0",
  },
  pendingNote: {
    fontSize: "11px",
    color: "#8a8693",
    margin: "6px 0 0 0",
    lineHeight: 1.4,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px",
    marginBottom: "16px",
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statLabel: {
    fontSize: "11px",
    color: "#5a5567",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  statValue: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#e8e6e3",
  },
  statValueAmber: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#ffab40",
  },
  statValueCyan: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#00e5ff",
  },
  claimButton: {
    width: "100%",
    padding: "12px",
    background: "linear-gradient(135deg, #ffab40, #ff8f00)",
    color: "#0a0a0f",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    marginBottom: "12px",
  },
  success: {
    color: "#4caf50",
    fontSize: "13px",
    textAlign: "center" as const,
    marginBottom: "12px",
  },
  toggleButton: {
    background: "none",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#8a8693",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
    width: "100%",
    marginBottom: "8px",
  },
  monthsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "12px",
  },
  monthRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    background: "rgba(26, 26, 40, 0.8)",
    borderRadius: "6px",
    fontSize: "13px",
  },
  monthLabel: {
    color: "#e8e6e3",
    fontWeight: 500,
  },
  muted: {
    color: "#5a5567",
    fontSize: "12px",
  },
  claimedBadge: {
    marginLeft: "8px",
    padding: "2px 6px",
    background: "rgba(76, 175, 80, 0.15)",
    color: "#4caf50",
    borderRadius: "4px",
    fontSize: "11px",
  },
  claimedBadgeLink: {
    marginLeft: "8px",
    padding: "2px 6px",
    background: "rgba(76, 175, 80, 0.15)",
    color: "#4caf50",
    borderRadius: "4px",
    fontSize: "11px",
    textDecoration: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  claimableBadge: {
    marginLeft: "8px",
    padding: "2px 6px",
    background: "rgba(255, 171, 64, 0.15)",
    color: "#ffab40",
    borderRadius: "4px",
    fontSize: "11px",
  },
  pendingBadge: {
    marginLeft: "8px",
    padding: "2px 6px",
    background: "rgba(138, 134, 147, 0.15)",
    color: "#8a8693",
    borderRadius: "4px",
    fontSize: "11px",
  },
  footer: {
    fontSize: "11px",
    color: "#5a5567",
    textAlign: "center" as const,
    marginTop: "12px",
    lineHeight: 1.5,
  },
};
