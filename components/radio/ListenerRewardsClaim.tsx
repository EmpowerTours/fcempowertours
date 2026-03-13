'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, parseAbi, type Address } from 'viem';

/**
 * ListenerRewardsClaim
 *
 * Shows active radio listeners their WMON earnings from the 20% DAO reserve
 * and allows them to claim via the ListenerRewardPool contract.
 */

const POOL_ADDRESS = process.env.NEXT_PUBLIC_LISTENER_REWARD_POOL as Address;

const POOL_ABI = parseAbi([
  'function batchClaimRewards(uint256[] calldata monthIds) external',
  'function claimReward(uint256 monthId) external',
]);

interface MonthData {
  monthId: number;
  points: number;
  estimatedPayout: string;
  claimed: boolean;
  poolTotal: string;
  totalListeners: number;
  finalized: boolean;
}

interface EarningsData {
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

export default function ListenerRewardsClaim() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMonths, setShowMonths] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);

  const { writeContract, data: txHash, isPending: txPending } = useWriteContract();
  const { data: receipt, isLoading: receiptLoading } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const fetchEarnings = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/listener-earnings?address=${address}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Failed to load earnings');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      fetchEarnings();
    }
  }, [isConnected, address, fetchEarnings]);

  // Refresh after successful claim
  useEffect(() => {
    if (receipt) {
      setClaimSuccess(true);
      fetchEarnings();
    }
  }, [receipt, fetchEarnings]);

  const unclaimedMonths = data?.wmon.months.filter(m => m.finalized && !m.claimed && m.points > 0) || [];
  const claimableAmount = parseFloat(data?.wmon.totalClaimable || '0');
  const hasClaimable = unclaimedMonths.length > 0 && claimableAmount > 0;

  const handleClaim = () => {
    if (!POOL_ADDRESS || !hasClaimable) return;

    const monthIds = unclaimedMonths.map(m => BigInt(m.monthId));

    if (monthIds.length === 1) {
      writeContract({
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: 'claimReward',
        args: [monthIds[0]],
      });
    } else {
      writeContract({
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: 'batchClaimRewards',
        args: [monthIds],
      });
    }
    setClaimSuccess(false);
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
        <p style={{ color: '#ff6b6b' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Listener WMON Rewards</h3>
      <p style={styles.subtitle}>Earn WMON from the 20% DAO reserve by listening to Live Radio</p>

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
            {parseFloat(data?.wmon.totalClaimed || '0').toFixed(4)}
          </span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Pending TOURS</span>
          <span style={styles.statValueCyan}>
            {data?.tours.pendingRewards?.toFixed(1) || '0'} TOURS
          </span>
        </div>
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
          <span style={styles.statLabel}>DAO Reserve</span>
          <span style={styles.statValue}>
            {parseFloat(data?.wmon.currentReserveBalance || '0').toFixed(2)} WMON
          </span>
        </div>
      </div>

      {/* Claim button */}
      {hasClaimable && (
        <button
          onClick={handleClaim}
          disabled={txPending || receiptLoading}
          style={{
            ...styles.claimButton,
            opacity: txPending || receiptLoading ? 0.6 : 1,
          }}
        >
          {txPending
            ? 'Confirm in wallet...'
            : receiptLoading
            ? 'Claiming...'
            : `Claim ${claimableAmount.toFixed(4)} WMON`}
        </button>
      )}

      {claimSuccess && (
        <p style={styles.success}>
          WMON claimed successfully!
        </p>
      )}

      {/* Monthly breakdown toggle */}
      {data?.wmon.months && data.wmon.months.length > 0 && (
        <>
          <button
            onClick={() => setShowMonths(!showMonths)}
            style={styles.toggleButton}
          >
            {showMonths ? 'Hide' : 'Show'} Monthly Breakdown ({data.wmon.months.length})
          </button>

          {showMonths && (
            <div style={styles.monthsContainer}>
              {data.wmon.months.map((month) => (
                <div key={month.monthId} style={styles.monthRow}>
                  <div>
                    <span style={styles.monthLabel}>Month {month.monthId}</span>
                    <span style={styles.muted}> &middot; {month.points} listens &middot; {month.totalListeners} listeners</span>
                  </div>
                  <div>
                    <span style={month.claimed ? styles.muted : styles.statValueAmber}>
                      {parseFloat(month.estimatedPayout).toFixed(4)} WMON
                    </span>
                    {month.claimed && <span style={styles.claimedBadge}>Claimed</span>}
                    {!month.claimed && month.finalized && <span style={styles.claimableBadge}>Claimable</span>}
                    {!month.finalized && <span style={styles.pendingBadge}>Pending</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Info footer */}
      <p style={styles.footer}>
        20% of all subscription revenue goes to active listeners. Your share is proportional to songs heard.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'rgba(18, 18, 26, 0.95)',
    border: '1px solid rgba(255, 171, 64, 0.15)',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffab40',
    margin: '0 0 4px 0',
  },
  subtitle: {
    fontSize: '13px',
    color: '#8a8693',
    margin: '0 0 16px 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#5a5567',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#e8e6e3',
  },
  statValueAmber: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffab40',
  },
  statValueCyan: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#00e5ff',
  },
  claimButton: {
    width: '100%',
    padding: '12px',
    background: 'linear-gradient(135deg, #ffab40, #ff8f00)',
    color: '#0a0a0f',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: '12px',
  },
  success: {
    color: '#4caf50',
    fontSize: '13px',
    textAlign: 'center' as const,
    marginBottom: '12px',
  },
  toggleButton: {
    background: 'none',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#8a8693',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
    width: '100%',
    marginBottom: '8px',
  },
  monthsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  monthRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'rgba(26, 26, 40, 0.8)',
    borderRadius: '6px',
    fontSize: '13px',
  },
  monthLabel: {
    color: '#e8e6e3',
    fontWeight: 500,
  },
  muted: {
    color: '#5a5567',
    fontSize: '12px',
  },
  claimedBadge: {
    marginLeft: '8px',
    padding: '2px 6px',
    background: 'rgba(76, 175, 80, 0.15)',
    color: '#4caf50',
    borderRadius: '4px',
    fontSize: '11px',
  },
  claimableBadge: {
    marginLeft: '8px',
    padding: '2px 6px',
    background: 'rgba(255, 171, 64, 0.15)',
    color: '#ffab40',
    borderRadius: '4px',
    fontSize: '11px',
  },
  pendingBadge: {
    marginLeft: '8px',
    padding: '2px 6px',
    background: 'rgba(138, 134, 147, 0.15)',
    color: '#8a8693',
    borderRadius: '4px',
    fontSize: '11px',
  },
  footer: {
    fontSize: '11px',
    color: '#5a5567',
    textAlign: 'center' as const,
    marginTop: '12px',
    lineHeight: 1.5,
  },
};
