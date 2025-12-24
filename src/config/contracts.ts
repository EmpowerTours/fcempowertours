import { Address } from 'viem';

// Import ABIs
import CreditScoreCalculatorABI from '../abis/CreditScoreCalculator.json';
import ToursTokenABI from '../abis/ToursToken.json';
import ItineraryNFTABI from '../abis/ItineraryNFT.json';

// Monad Testnet Configuration
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_RPC = 'https://rpc-testnet.monadinfra.com';

// Contract Addresses on Monad Testnet
export const CONTRACTS = {
  CreditScoreCalculator: {
    address: '0x9598397899CCcf9d0CFbDB40dEf1EF34e550c0c5' as Address,
    abi: CreditScoreCalculatorABI,
  },
  ToursToken: {
    address: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7' as Address,
    abi: ToursTokenABI,
  },
  ItineraryNFT: {
    address: '0x49A3fB80008e51750FAd622cA75f551d0C7a1c0A' as Address,
    abi: ItineraryNFTABI,
  },
} as const;

// Type-safe contract configuration
export type ContractName = keyof typeof CONTRACTS;

// Helper function to get contract config
export function getContract(name: ContractName) {
  return CONTRACTS[name];
}

// Export individual contract configs for convenience
export const creditScoreCalculatorConfig = CONTRACTS.CreditScoreCalculator;
export const toursTokenConfig = CONTRACTS.ToursToken;
export const itineraryNFTConfig = CONTRACTS.ItineraryNFT;
