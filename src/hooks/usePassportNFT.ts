import { useReadContract } from 'wagmi';
import { Address } from 'viem';

// PassportNFT contract address from environment
const PASSPORT_NFT_ADDRESS = (process.env.NEXT_PUBLIC_PASSPORT_NFT ||
  process.env.NEXT_PUBLIC_PASSPORT ||
  '0xCDdE80E0cf16b31e7Ad7D83dD012d33b328f9E4f') as Address;

// Minimal ABI for passport checks
const PASSPORT_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'country', type: 'string' }],
    name: 'hasPassport',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getPassportData',
    outputs: [{ type: 'tuple', components: [
      { name: 'countryCode', type: 'string' },
      { name: 'countryName', type: 'string' },
      { name: 'region', type: 'string' },
      { name: 'continent', type: 'string' },
      { name: 'verified', type: 'bool' },
    ]}],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const passportConfig = {
  address: PASSPORT_NFT_ADDRESS,
  abi: PASSPORT_ABI,
};

export function usePassportNFT() {
  // Read functions
  const useGetPassportData = (tokenId: bigint) => {
    return useReadContract({
      ...passportConfig,
      functionName: 'getPassportData',
      args: [tokenId],
    });
  };

  const useHasPassport = (user: Address, country: string) => {
    return useReadContract({
      ...passportConfig,
      functionName: 'hasPassport',
      args: [user, country],
    });
  };

  const useBalanceOf = (owner: Address) => {
    return useReadContract({
      ...passportConfig,
      functionName: 'balanceOf',
      args: [owner],
    });
  };

  const useTokenURI = (tokenId: bigint) => {
    return useReadContract({
      ...passportConfig,
      functionName: 'tokenURI',
      args: [tokenId],
    });
  };

  return {
    // Read hooks
    useGetPassportData,
    useHasPassport,
    useBalanceOf,
    useTokenURI,
  };
}
