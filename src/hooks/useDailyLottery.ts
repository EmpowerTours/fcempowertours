import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';

// DailyPassLotterySecure contract on Monad testnet
const LOTTERY_ADDRESS = (process.env.NEXT_PUBLIC_LOTTERY_ADDRESS || '0xf0ADd68cC2145B7b97a41f280E079db8A49eB0fD') as `0x${string}`;
const SHMON_ADDRESS = (process.env.NEXT_PUBLIC_SHMON_ADDRESS || '0x3a98250F98Dd388C211206983453837C8365BDc1') as `0x${string}`;

// DailyPassLotterySecure ABI
const LOTTERY_ABI = [
  // Constants
  {
    "inputs": [],
    "name": "ENTRY_FEE",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PLATFORM_FEE_BPS",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "CALLER_REWARD",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  // Read functions
  {
    "inputs": [],
    "name": "currentRoundId",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCurrentRound",
    "outputs": [{
      "components": [
        {"internalType": "uint256", "name": "roundId", "type": "uint256"},
        {"internalType": "uint256", "name": "startTime", "type": "uint256"},
        {"internalType": "uint256", "name": "endTime", "type": "uint256"},
        {"internalType": "uint256", "name": "prizePoolMon", "type": "uint256"},
        {"internalType": "uint256", "name": "prizePoolShMon", "type": "uint256"},
        {"internalType": "uint256", "name": "participantCount", "type": "uint256"},
        {"internalType": "enum DailyPassLotterySecure.RoundStatus", "name": "status", "type": "uint8"},
        {"internalType": "uint256", "name": "commitBlock", "type": "uint256"},
        {"internalType": "bytes32", "name": "commitHash", "type": "bytes32"},
        {"internalType": "address", "name": "winner", "type": "address"},
        {"internalType": "uint256", "name": "winnerEntryIndex", "type": "uint256"}
      ],
      "internalType": "struct DailyPassLotterySecure.DailyRound",
      "name": "",
      "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "hasEnteredToday",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTimeRemaining",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStats",
    "outputs": [
      {"internalType": "uint256", "name": "_currentRoundId", "type": "uint256"},
      {"internalType": "uint256", "name": "_currentPrizePool", "type": "uint256"},
      {"internalType": "uint256", "name": "_currentParticipants", "type": "uint256"},
      {"internalType": "uint256", "name": "_totalPrizesPaid", "type": "uint256"},
      {"internalType": "uint256", "name": "_totalParticipants", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getShMonEntryFee",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "canCommit",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "canReveal",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "getRoundParticipants",
    "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "getUserPasses",
    "outputs": [{
      "components": [
        {"internalType": "uint256", "name": "roundId", "type": "uint256"},
        {"internalType": "address", "name": "holder", "type": "address"},
        {"internalType": "uint256", "name": "entryTime", "type": "uint256"},
        {"internalType": "bool", "name": "paidWithShMon", "type": "bool"},
        {"internalType": "uint256", "name": "entryIndex", "type": "uint256"}
      ],
      "internalType": "struct DailyPassLotterySecure.DailyPass[]",
      "name": "",
      "type": "tuple[]"
    }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "escrows",
    "outputs": [
      {"internalType": "uint256", "name": "roundId", "type": "uint256"},
      {"internalType": "address", "name": "winner", "type": "address"},
      {"internalType": "uint256", "name": "monAmount", "type": "uint256"},
      {"internalType": "uint256", "name": "shMonAmount", "type": "uint256"},
      {"internalType": "uint256", "name": "createdAt", "type": "uint256"},
      {"internalType": "uint256", "name": "expiresAt", "type": "uint256"},
      {"internalType": "bool", "name": "claimed", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Write functions
  {
    "inputs": [],
    "name": "enterWithMon",
    "outputs": [{"internalType": "uint256", "name": "entryIndex", "type": "uint256"}],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "shMonAmount", "type": "uint256"}],
    "name": "enterWithShMon",
    "outputs": [{"internalType": "uint256", "name": "entryIndex", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "commitRandomness",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "revealWinner",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "claimPrize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const LOTTERY_CONTRACT_ADDRESS = LOTTERY_ADDRESS;

export function useDailyLottery() {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // Get current round ID
  const useGetCurrentRoundId = () => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'currentRoundId',
    });
  };

  // Get current round details
  const useGetCurrentRound = () => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getCurrentRound',
    });
  };

  // Check if user has entered today
  const useHasEnteredToday = (address: `0x${string}` | undefined) => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'hasEnteredToday',
      args: address ? [address] : undefined,
    });
  };

  // Get time remaining in current round
  const useGetTimeRemaining = () => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getTimeRemaining',
    });
  };

  // Get overall stats
  const useGetStats = () => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getStats',
    });
  };

  // Get shMON entry fee equivalent
  const useGetShMonEntryFee = () => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getShMonEntryFee',
    });
  };

  // Check if round can be committed
  const useCanCommit = (roundId: bigint | undefined) => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'canCommit',
      args: roundId !== undefined ? [roundId] : undefined,
    });
  };

  // Check if round can be revealed
  const useCanReveal = (roundId: bigint | undefined) => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'canReveal',
      args: roundId !== undefined ? [roundId] : undefined,
    });
  };

  // Get user's passes
  const useGetUserPasses = (address: `0x${string}` | undefined) => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getUserPasses',
      args: address ? [address] : undefined,
    });
  };

  // Get escrow for a round
  const useGetEscrow = (roundId: bigint | undefined) => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'escrows',
      args: roundId !== undefined ? [roundId] : undefined,
    });
  };

  // Enter lottery with MON (1 MON)
  const enterWithMon = () => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'enterWithMon',
      value: parseEther('1'), // 1 MON entry fee
    });
  };

  // Enter lottery with shMON
  const enterWithShMon = (shMonAmount: string) => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'enterWithShMon',
      args: [parseEther(shMonAmount)],
    });
  };

  // Commit randomness (anyone can call, gets 0.01 MON reward)
  const commitRandomness = (roundId: bigint) => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'commitRandomness',
      args: [roundId],
    });
  };

  // Reveal winner (anyone can call, gets 0.01 MON reward)
  const revealWinner = (roundId: bigint) => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'revealWinner',
      args: [roundId],
    });
  };

  // Claim prize (winner only)
  const claimPrize = (roundId: bigint) => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'claimPrize',
      args: [roundId],
    });
  };

  return {
    // Contract addresses
    LOTTERY_ADDRESS,
    SHMON_ADDRESS,
    // Read hooks
    useGetCurrentRoundId,
    useGetCurrentRound,
    useHasEnteredToday,
    useGetTimeRemaining,
    useGetStats,
    useGetShMonEntryFee,
    useCanCommit,
    useCanReveal,
    useGetUserPasses,
    useGetEscrow,
    // Write functions
    enterWithMon,
    enterWithShMon,
    commitRandomness,
    revealWinner,
    claimPrize,
    // Transaction state
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
    hash,
  };
}
