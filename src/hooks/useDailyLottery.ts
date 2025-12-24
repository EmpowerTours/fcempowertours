import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';

// DailyPassLotteryWMON contract on Monad testnet
const LOTTERY_ADDRESS = (process.env.NEXT_PUBLIC_DAILY_PASS_LOTTERY || '0xEFB7d472A717bDb9aEF4308d891eA8eE70C21a4F') as `0x${string}`;
const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541') as `0x${string}`;

// DailyPassLotteryWMON ABI (Pyth Entropy randomness)
const LOTTERY_ABI = [
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
        {"internalType": "uint256", "name": "prizePoolWmon", "type": "uint256"},
        {"internalType": "uint256", "name": "participantCount", "type": "uint256"},
        {"internalType": "enum DailyPassLotteryWMON.RoundStatus", "name": "status", "type": "uint8"},
        {"internalType": "uint64", "name": "entropySequenceNumber", "type": "uint64"},
        {"internalType": "bytes32", "name": "randomValue", "type": "bytes32"},
        {"internalType": "uint256", "name": "randomnessRequestedAt", "type": "uint256"},
        {"internalType": "address", "name": "winner", "type": "address"},
        {"internalType": "uint256", "name": "winnerIndex", "type": "uint256"},
        {"internalType": "uint256", "name": "callerRewardsToursPaid", "type": "uint256"}
      ],
      "internalType": "struct DailyPassLotteryWMON.DailyRound",
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
      {"internalType": "uint256", "name": "_prizePoolWmon", "type": "uint256"},
      {"internalType": "uint256", "name": "_participants", "type": "uint256"},
      {"internalType": "uint256", "name": "_totalPaid", "type": "uint256"},
      {"internalType": "uint256", "name": "_totalParticipants", "type": "uint256"},
      {"internalType": "enum DailyPassLotteryWMON.RoundStatus", "name": "_status", "type": "uint8"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getEntropyFee",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "roundId", "type": "uint256"}],
    "name": "canRequestRandomness",
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
        {"internalType": "uint256", "name": "userFid", "type": "uint256"},
        {"internalType": "address", "name": "beneficiary", "type": "address"},
        {"internalType": "uint256", "name": "entryTime", "type": "uint256"},
        {"internalType": "uint256", "name": "entryIndex", "type": "uint256"}
      ],
      "internalType": "struct DailyPassLotteryWMON.DailyPass[]",
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
      {"internalType": "uint256", "name": "wmonAmount", "type": "uint256"},
      {"internalType": "uint256", "name": "createdAt", "type": "uint256"},
      {"internalType": "uint256", "name": "expiresAt", "type": "uint256"},
      {"internalType": "bool", "name": "claimed", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ENTRY_FEE",
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
  // Write functions
  {
    "inputs": [{"internalType": "uint256", "name": "userFid", "type": "uint256"}],
    "name": "enterWithWmon",
    "outputs": [{"internalType": "uint256", "name": "entryIndex", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "userFid", "type": "uint256"},
      {"internalType": "address", "name": "beneficiary", "type": "address"}
    ],
    "name": "enterWithWmonFor",
    "outputs": [{"internalType": "uint256", "name": "entryIndex", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "roundId", "type": "uint256"},
      {"internalType": "bytes32", "name": "userRandomNumber", "type": "bytes32"}
    ],
    "name": "requestRandomness",
    "outputs": [],
    "stateMutability": "payable",
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

  // Get entropy fee for randomness request
  const useGetEntropyFee = () => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'getEntropyFee',
    });
  };

  // Check if round can request randomness
  const useCanRequestRandomness = (roundId: bigint | undefined) => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'canRequestRandomness',
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

  // Get entry fee
  const useGetEntryFee = () => {
    return useReadContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'ENTRY_FEE',
    });
  };

  // Enter lottery with WMON
  const enterWithWmon = (userFid: bigint) => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'enterWithWmon',
      args: [userFid],
    });
  };

  // Enter lottery with WMON for someone else
  const enterWithWmonFor = (userFid: bigint, beneficiary: `0x${string}`) => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'enterWithWmonFor',
      args: [userFid, beneficiary],
    });
  };

  // Request randomness (anyone can call, pays entropy fee)
  const requestRandomness = (roundId: bigint, userRandomNumber: `0x${string}`, entropyFee: bigint) => {
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: 'requestRandomness',
      args: [roundId, userRandomNumber],
      value: entropyFee,
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
    WMON_ADDRESS,
    // Read hooks
    useGetCurrentRoundId,
    useGetCurrentRound,
    useHasEnteredToday,
    useGetTimeRemaining,
    useGetStats,
    useGetEntropyFee,
    useCanRequestRandomness,
    useGetUserPasses,
    useGetEscrow,
    useGetEntryFee,
    // Write functions
    enterWithWmon,
    enterWithWmonFor,
    requestRandomness,
    claimPrize,
    // Transaction state
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
    hash,
  };
}
