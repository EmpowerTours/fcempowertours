import { Address } from 'viem';

// Import ABIs
import YieldStrategyABI from '../abis/YieldStrategy.json';
import PassportNFTv2ABI from '../abis/PassportNFTv2.json';
import DragonRouterABI from '../abis/DragonRouter.json';
import DemandSignalEngineABI from '../abis/DemandSignalEngine.json';
import SmartEventManifestABI from '../abis/SmartEventManifest.json';
import TandaYieldGroupABI from '../abis/TandaYieldGroup.json';
import CreditScoreCalculatorABI from '../abis/CreditScoreCalculator.json';
import ToursTokenABI from '../abis/ToursToken.json';

// Monad Testnet Configuration
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';

// Contract Addresses on Monad Testnet
export const CONTRACTS = {
  YieldStrategy: {
    address: '0x8D3d70a5F4eeaE446A70F6f38aBd2adf7c667866' as Address,
    abi: YieldStrategyABI,
  },
  PassportNFTv2: {
    address: '0x04a8983587B79cd0a4927AE71040caf3baA613f1' as Address,
    abi: PassportNFTv2ABI,
  },
  DragonRouter: {
    address: '0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e' as Address,
    abi: DragonRouterABI,
  },
  DemandSignalEngine: {
    address: '0xC2Eb75ddf31cd481765D550A91C5A63363B36817' as Address,
    abi: DemandSignalEngineABI,
  },
  SmartEventManifest: {
    address: '0x5cfe8379058cA460aA60ef15051Be57dab4A651C' as Address,
    abi: SmartEventManifestABI,
  },
  TandaYieldGroup: {
    address: '0xE0983Cd98f5852AD6BF56648B4724979B75E9fC8' as Address,
    abi: TandaYieldGroupABI,
  },
  CreditScoreCalculator: {
    address: '0x9598397899CCcf9d0CFbDB40dEf1EF34e550c0c5' as Address,
    abi: CreditScoreCalculatorABI,
  },
  ToursToken: {
    address: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7' as Address,
    abi: ToursTokenABI,
  },
} as const;

// Type-safe contract configuration
export type ContractName = keyof typeof CONTRACTS;

// Helper function to get contract config
export function getContract(name: ContractName) {
  return CONTRACTS[name];
}

// Export individual contract configs for convenience
export const yieldStrategyConfig = CONTRACTS.YieldStrategy;
export const passportNFTv2Config = CONTRACTS.PassportNFTv2;
export const dragonRouterConfig = CONTRACTS.DragonRouter;
export const demandSignalEngineConfig = CONTRACTS.DemandSignalEngine;
export const smartEventManifestConfig = CONTRACTS.SmartEventManifest;
export const tandaYieldGroupConfig = CONTRACTS.TandaYieldGroup;
export const creditScoreCalculatorConfig = CONTRACTS.CreditScoreCalculator;
export const toursTokenConfig = CONTRACTS.ToursToken;

// Verification status (✅ = verified on Monad testnet)
export const VERIFICATION_STATUS = {
  YieldStrategy: '0x8D3d70a5F4eeaE446A70F6f38aBd2adf7c667866',
  PassportNFTv2: '0x04a8983587B79cd0a4927AE71040caf3baA613f1',
  DragonRouter: '0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e',
  DemandSignalEngine: '✅ 0xC2Eb75ddf31cd481765D550A91C5A63363B36817',
  SmartEventManifest: '✅ 0x5cfe8379058cA460aA60ef15051Be57dab4A651C',
  TandaYieldGroup: '✅ 0xE0983Cd98f5852AD6BF56648B4724979B75E9fC8',
  CreditScoreCalculator: '✅ 0x9598397899CCcf9d0CFbDB40dEf1EF34e550c0c5',
  ToursToken: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7',
} as const;
