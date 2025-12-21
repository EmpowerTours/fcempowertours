import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';

const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as `0x${string}`;
const AMM_POOL_ADDRESS = process.env.NEXT_PUBLIC_TOURS_WMON_POOL as `0x${string}`;
const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN as `0x${string}`;

// Simplified ABIs with just the functions we need
const WMON_ABI = [
  {
    "inputs": [],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

const AMM_ABI = [
  {
    "inputs": [
      {"internalType": "uint256", "name": "toursIn", "type": "uint256"}
    ],
    "name": "getToursToWMONQuote",
    "outputs": [{"internalType": "uint256", "name": "wmonOut", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "wmonIn", "type": "uint256"}
    ],
    "name": "getWMONToToursQuote",
    "outputs": [{"internalType": "uint256", "name": "toursOut", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getReserves",
    "outputs": [
      {"internalType": "uint256", "name": "_reserveTours", "type": "uint256"},
      {"internalType": "uint256", "name": "_reserveWMON", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getPrice",
    "outputs": [{"internalType": "uint256", "name": "price", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "toursIn", "type": "uint256"},
      {"internalType": "uint256", "name": "minWMONOut", "type": "uint256"}
    ],
    "name": "swapToursForWMON",
    "outputs": [{"internalType": "uint256", "name": "wmonOut", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "wmonIn", "type": "uint256"},
      {"internalType": "uint256", "name": "minToursOut", "type": "uint256"}
    ],
    "name": "swapWMONForTours",
    "outputs": [{"internalType": "uint256", "name": "toursOut", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

const ERC20_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export function useSwap() {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // Read functions
  const useGetToursBalance = (address: `0x${string}` | undefined) => {
    return useReadContract({
      address: TOURS_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: address ? [address] : undefined,
    });
  };

  const useGetWMONBalance = (address: `0x${string}` | undefined) => {
    return useReadContract({
      address: WMON_ADDRESS,
      abi: WMON_ABI,
      functionName: 'balanceOf',
      args: address ? [address] : undefined,
    });
  };

  const useGetToursToWMONQuote = (toursAmount: string) => {
    return useReadContract({
      address: AMM_POOL_ADDRESS,
      abi: AMM_ABI,
      functionName: 'getToursToWMONQuote',
      args: toursAmount ? [parseEther(toursAmount)] : undefined,
    });
  };

  const useGetWMONToToursQuote = (wmonAmount: string) => {
    return useReadContract({
      address: AMM_POOL_ADDRESS,
      abi: AMM_ABI,
      functionName: 'getWMONToToursQuote',
      args: wmonAmount ? [parseEther(wmonAmount)] : undefined,
    });
  };

  const useGetReserves = () => {
    return useReadContract({
      address: AMM_POOL_ADDRESS,
      abi: AMM_ABI,
      functionName: 'getReserves',
    });
  };

  const useGetPrice = () => {
    return useReadContract({
      address: AMM_POOL_ADDRESS,
      abi: AMM_ABI,
      functionName: 'getPrice',
    });
  };

  // Write functions
  const wrapMON = (amount: string) => {
    writeContract({
      address: WMON_ADDRESS,
      abi: WMON_ABI,
      functionName: 'deposit',
      value: parseEther(amount),
    });
  };

  const unwrapWMON = (amount: string) => {
    writeContract({
      address: WMON_ADDRESS,
      abi: WMON_ABI,
      functionName: 'withdraw',
      args: [parseEther(amount)],
    });
  };

  const approveTOURS = (amount: string) => {
    writeContract({
      address: TOURS_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [AMM_POOL_ADDRESS, parseEther(amount)],
    });
  };

  const approveWMON = (amount: string) => {
    writeContract({
      address: WMON_ADDRESS,
      abi: WMON_ABI,
      functionName: 'approve',
      args: [AMM_POOL_ADDRESS, parseEther(amount)],
    });
  };

  const swapToursForWMON = (toursAmount: string, minWMONOut: string) => {
    writeContract({
      address: AMM_POOL_ADDRESS,
      abi: AMM_ABI,
      functionName: 'swapToursForWMON',
      args: [parseEther(toursAmount), parseEther(minWMONOut)],
    });
  };

  const swapWMONForTours = (wmonAmount: string, minToursOut: string) => {
    writeContract({
      address: AMM_POOL_ADDRESS,
      abi: AMM_ABI,
      functionName: 'swapWMONForTours',
      args: [parseEther(wmonAmount), parseEther(minToursOut)],
    });
  };

  return {
    // Read hooks
    useGetToursBalance,
    useGetWMONBalance,
    useGetToursToWMONQuote,
    useGetWMONToToursQuote,
    useGetReserves,
    useGetPrice,
    // Write functions
    wrapMON,
    unwrapWMON,
    approveTOURS,
    approveWMON,
    swapToursForWMON,
    swapWMONForTours,
    // Transaction state
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
    hash,
  };
}
