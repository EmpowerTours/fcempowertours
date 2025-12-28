import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address, parseAbi } from 'viem';

const FAUCET_ADDRESS = process.env.NEXT_PUBLIC_WMON_FAUCET as Address;

const FAUCET_ABI = parseAbi([
  'function claim(uint256 fid) external',
  'function canClaim(address user, uint256 fid) external view returns (bool canClaim_, uint256 walletCooldown, uint256 fidCooldown)',
  'function claimAmount() external view returns (uint256)',
  'function faucetBalance() external view returns (uint256)',
  'function lastClaimByWallet(address) external view returns (uint256)',
  'function lastClaimByFid(uint256) external view returns (uint256)',
]);

export function useFaucet() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Check if user can claim
  const useCanClaim = (userAddress: Address | undefined, fid: number | undefined) => {
    return useReadContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: 'canClaim',
      args: userAddress && fid ? [userAddress, BigInt(fid)] : undefined,
      query: {
        enabled: !!userAddress && !!fid && !!FAUCET_ADDRESS,
      },
    });
  };

  // Get faucet balance
  const useFaucetBalance = () => {
    return useReadContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: 'faucetBalance',
      query: {
        enabled: !!FAUCET_ADDRESS,
      },
    });
  };

  // Get claim amount
  const useClaimAmount = () => {
    return useReadContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: 'claimAmount',
      query: {
        enabled: !!FAUCET_ADDRESS,
      },
    });
  };

  // Claim from faucet
  const claim = (fid: number) => {
    if (!FAUCET_ADDRESS) {
      console.error('Faucet address not configured');
      return;
    }

    writeContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: 'claim',
      args: [BigInt(fid)],
    });
  };

  return {
    claim,
    useCanClaim,
    useFaucetBalance,
    useClaimAmount,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash,
  };
}
