'use client';

import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { Address } from 'viem';

const LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_LOTTERY_ADDRESS as Address;

const LOTTERY_ABI = [
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'commitRandomness',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'revealWinner',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'canCommit',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'canReveal',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'currentRoundId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'getRound',
    outputs: [{
      components: [
        { name: 'roundId', type: 'uint256' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'prizePoolMon', type: 'uint256' },
        { name: 'prizePoolShMon', type: 'uint256' },
        { name: 'participantCount', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'commitBlock', type: 'uint256' },
        { name: 'commitHash', type: 'bytes32' },
        { name: 'winner', type: 'address' },
        { name: 'winnerIndex', type: 'uint256' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function FinalizeLotteryButton() {
  const publicClient = usePublicClient();
  const [pendingRound, setPendingRound] = useState<number | null>(null);
  const [canCommitRound, setCanCommitRound] = useState(false);
  const [canRevealRound, setCanRevealRound] = useState(false);
  const [checking, setChecking] = useState(false);

  const { writeContract: commit, data: commitHash } = useWriteContract();
  const { writeContract: reveal, data: revealHash } = useWriteContract();

  const { isSuccess: commitSuccess } = useWaitForTransactionReceipt({ hash: commitHash });
  const { isSuccess: revealSuccess } = useWaitForTransactionReceipt({ hash: revealHash });

  // Check for pending rounds
  const checkPendingRounds = async () => {
    if (!publicClient) return;

    try {
      setChecking(true);

      // Get current round ID
      const currentRoundId = await publicClient.readContract({
        address: LOTTERY_ADDRESS,
        abi: LOTTERY_ABI,
        functionName: 'currentRoundId',
      });

      // Check last 3 rounds for pending finalization
      for (let i = Number(currentRoundId); i > Math.max(0, Number(currentRoundId) - 3); i--) {
        const round = await publicClient.readContract({
          address: LOTTERY_ADDRESS,
          abi: LOTTERY_ABI,
          functionName: 'getRound',
          args: [BigInt(i)],
        });

        // Status: 0=Active, 1=CommitPending, 2=RevealPending, 3=Finalized
        if (round.status === 1 || round.status === 2) {
          setPendingRound(i);

          // Check if we can commit
          const canCommit = await publicClient.readContract({
            address: LOTTERY_ADDRESS,
            abi: LOTTERY_ABI,
            functionName: 'canCommit',
            args: [BigInt(i)],
          });

          // Check if we can reveal
          const canReveal = await publicClient.readContract({
            address: LOTTERY_ADDRESS,
            abi: LOTTERY_ABI,
            functionName: 'canReveal',
            args: [BigInt(i)],
          });

          setCanCommitRound(canCommit);
          setCanRevealRound(canReveal);
          break;
        }
      }
    } catch (error) {
      console.error('Error checking pending rounds:', error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkPendingRounds();
    // Check every 30 seconds
    const interval = setInterval(checkPendingRounds, 30000);
    return () => clearInterval(interval);
  }, [publicClient]);

  // Recheck after successful transactions
  useEffect(() => {
    if (commitSuccess || revealSuccess) {
      setTimeout(checkPendingRounds, 2000);
    }
  }, [commitSuccess, revealSuccess]);

  const handleCommit = () => {
    if (!pendingRound) return;

    commit({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'commitRandomness',
      args: [BigInt(pendingRound)],
    });
  };

  const handleReveal = () => {
    if (!pendingRound) return;

    reveal({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'revealWinner',
      args: [BigInt(pendingRound)],
    });
  };

  if (!pendingRound || (!canCommitRound && !canRevealRound)) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-xl p-6 mb-6 shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            🎰 Earn 0.01 MON Reward!
          </h3>
          <p className="text-yellow-100 text-sm mb-4">
            {canCommitRound && 'Yesterday\'s lottery needs finalization. Be the first to commit and earn a reward!'}
            {canRevealRound && 'Lottery is ready to reveal the winner. Earn 0.01 MON by revealing!'}
          </p>

          <div className="flex gap-3">
            {canCommitRound && (
              <button
                onClick={handleCommit}
                disabled={checking}
                className="bg-white text-orange-600 font-bold px-6 py-3 rounded-lg hover:bg-yellow-50 transition disabled:opacity-50"
              >
                {checking ? 'Checking...' : '1️⃣ Commit Randomness (+0.01 MON)'}
              </button>
            )}

            {canRevealRound && (
              <button
                onClick={handleReveal}
                disabled={checking}
                className="bg-white text-orange-600 font-bold px-6 py-3 rounded-lg hover:bg-yellow-50 transition disabled:opacity-50"
              >
                {checking ? 'Checking...' : '2️⃣ Reveal Winner (+0.01 MON)'}
              </button>
            )}
          </div>

          <p className="text-xs text-yellow-200 mt-3">
            Round #{pendingRound} • Anyone can finalize • First come, first served
          </p>
        </div>

        <div className="text-4xl">💰</div>
      </div>
    </div>
  );
}
