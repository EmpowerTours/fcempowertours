import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { passportNFTv2Config } from '../config/contracts';

export function usePassportNFT() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetPassportData = (tokenId: bigint) => {
    return useReadContract({
      ...passportNFTv2Config,
      functionName: 'getPassportData',
      args: [tokenId],
    });
  };

  const useHasPassport = (user: Address, country: string) => {
    return useReadContract({
      ...passportNFTv2Config,
      functionName: 'hasPassport',
      args: [user, country],
    });
  };

  const useBalanceOf = (owner: Address) => {
    return useReadContract({
      ...passportNFTv2Config,
      functionName: 'balanceOf',
      args: [owner],
    });
  };

  const useMintPrice = () => {
    return useReadContract({
      ...passportNFTv2Config,
      functionName: 'MINT_PRICE',
    });
  };

  const useTokenURI = (tokenId: bigint) => {
    return useReadContract({
      ...passportNFTv2Config,
      functionName: 'tokenURI',
      args: [tokenId],
    });
  };

  // Write functions
  const mint = (
    to: Address,
    name: string,
    country: string,
    pfp: string,
    bio: string,
    metadataUri: string
  ) => {
    writeContract({
      ...passportNFTv2Config,
      functionName: 'mint',
      args: [to, name, country, pfp, bio, metadataUri],
    });
  };

  return {
    // Read hooks
    useGetPassportData,
    useHasPassport,
    useBalanceOf,
    useMintPrice,
    useTokenURI,

    // Write functions
    mint,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
