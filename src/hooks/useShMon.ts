import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';

// shMON ERC4626 Vault - Liquid staking on Monad
const SHMON_ADDRESS = (process.env.NEXT_PUBLIC_SHMON_ADDRESS || '0x3a98250F98Dd388C211206983453837C8365BDc1') as `0x${string}`;

// ERC4626 Vault ABI (shMONAD liquid staking)
const SHMON_ABI = [
  // Read functions
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "name": "convertToShares",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
    "name": "convertToAssets",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAssets",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "address", "name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  // Write functions - deposit MON to get shMON
  {
    "inputs": [
      {"internalType": "uint96", "name": "minShares", "type": "uint96"},
      {"internalType": "address", "name": "receiver", "type": "address"}
    ],
    "name": "deposit",
    "outputs": [{"internalType": "uint96", "name": "shares", "type": "uint96"}],
    "stateMutability": "payable",
    "type": "function"
  },
  // Approve for transfers
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Transfer shMON
  {
    "inputs": [
      {"internalType": "address", "name": "to", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const SHMON_CONTRACT_ADDRESS = SHMON_ADDRESS;

export function useShMon() {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // Get shMON balance for an address
  const useGetShMonBalance = (address: `0x${string}` | undefined) => {
    return useReadContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'balanceOf',
      args: address ? [address] : undefined,
    });
  };

  // Convert MON amount to shMON shares
  const useConvertToShares = (monAmount: string) => {
    const amount = monAmount && parseFloat(monAmount) > 0 ? parseEther(monAmount) : undefined;
    return useReadContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'convertToShares',
      args: amount ? [amount] : undefined,
    });
  };

  // Convert shMON shares to MON amount
  const useConvertToAssets = (shMonAmount: string) => {
    const amount = shMonAmount && parseFloat(shMonAmount) > 0 ? parseEther(shMonAmount) : undefined;
    return useReadContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'convertToAssets',
      args: amount ? [amount] : undefined,
    });
  };

  // Get total assets in vault
  const useGetTotalAssets = () => {
    return useReadContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'totalAssets',
    });
  };

  // Get total shMON supply
  const useGetTotalSupply = () => {
    return useReadContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'totalSupply',
    });
  };

  // Get allowance
  const useGetAllowance = (owner: `0x${string}` | undefined, spender: `0x${string}`) => {
    return useReadContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'allowance',
      args: owner ? [owner, spender] : undefined,
    });
  };

  // Deposit MON to get shMON (payable function)
  const depositMon = (monAmount: string, receiver: `0x${string}`, minShares: bigint = BigInt(0)) => {
    writeContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'deposit',
      args: [minShares, receiver],
      value: parseEther(monAmount),
    });
  };

  // Approve shMON for spending (e.g., lottery contract)
  const approveShMon = (spender: `0x${string}`, amount: string) => {
    writeContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'approve',
      args: [spender, parseEther(amount)],
    });
  };

  // Transfer shMON
  const transferShMon = (to: `0x${string}`, amount: string) => {
    writeContract({
      address: SHMON_ADDRESS,
      abi: SHMON_ABI,
      functionName: 'transfer',
      args: [to, parseEther(amount)],
    });
  };

  return {
    // Contract address
    SHMON_ADDRESS,
    // Read hooks
    useGetShMonBalance,
    useConvertToShares,
    useConvertToAssets,
    useGetTotalAssets,
    useGetTotalSupply,
    useGetAllowance,
    // Write functions
    depositMon,
    approveShMon,
    transferShMon,
    // Transaction state
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
    hash,
  };
}
