import { Address } from 'viem';

// Import ABIs
import YieldStrategyABI from '../abis/YieldStrategy.json';
import PassportNFTv3ABI from '../abis/PassportNFTv3.json';
import DragonRouterABI from '../abis/DragonRouter.json';
import DemandSignalEngineABI from '../abis/DemandSignalEngine.json';
import SmartEventManifestABI from '../abis/SmartEventManifest.json';
import TandaYieldGroupABI from '../abis/TandaYieldGroup.json';
import CreditScoreCalculatorABI from '../abis/CreditScoreCalculator.json';
import ToursTokenABI from '../abis/ToursToken.json';

// Mini-app Contract ABIs
import ActionBasedDemandSignalABI from '../abis/ActionBasedDemandSignal.json';
import ItineraryNFTABI from '../abis/ItineraryNFT.json';
import MusicBeatMatchABI from '../abis/MusicBeatMatch.json';
import CountryCollectorABI from '../abis/CountryCollector.json';
import TandaPoolABI from '../abis/TandaPool.json';

// Monad Testnet Configuration
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';

// Contract Addresses on Monad Testnet
export const CONTRACTS = {
  YieldStrategy: {
    address: '0x37aC86916Ae673bDFCc9c712057092E57b270f5f' as Address,
    abi: YieldStrategyABI,
  },
  PassportNFTv3: {
    address: '0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163' as Address,
    abi: PassportNFTv3ABI,
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
  // Mini-app Contracts
  ActionBasedDemandSignal: {
    address: '0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E' as Address,
    abi: ActionBasedDemandSignalABI,
  },
  ItineraryNFT: {
    address: '0x5B61286AC88688fe8930711fAa5b1155e98daFe8' as Address,
    abi: ItineraryNFTABI,
  },
  MusicBeatMatch: {
    address: '0xee83AC7E916f4feBDb7297363B47eE370FE2EC87' as Address,
    abi: MusicBeatMatchABI,
  },
  CountryCollector: {
    address: '0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200' as Address,
    abi: CountryCollectorABI,
  },
  TandaPool: {
    address: '0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B' as Address,
    abi: TandaPoolABI,
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
export const passportNFTv3Config = CONTRACTS.PassportNFTv3;
export const dragonRouterConfig = CONTRACTS.DragonRouter;
export const demandSignalEngineConfig = CONTRACTS.DemandSignalEngine;
export const smartEventManifestConfig = CONTRACTS.SmartEventManifest;
export const tandaYieldGroupConfig = CONTRACTS.TandaYieldGroup;
export const creditScoreCalculatorConfig = CONTRACTS.CreditScoreCalculator;
export const toursTokenConfig = CONTRACTS.ToursToken;

// Mini-app contract configs
export const actionBasedDemandSignalConfig = CONTRACTS.ActionBasedDemandSignal;
export const itineraryNFTConfig = CONTRACTS.ItineraryNFT;
export const musicBeatMatchConfig = CONTRACTS.MusicBeatMatch;
export const countryCollectorConfig = CONTRACTS.CountryCollector;
export const tandaPoolConfig = CONTRACTS.TandaPool;

// Verification status (✅ = verified on Monad testnet)
export const VERIFICATION_STATUS = {
  YieldStrategy: '✅ 0x37aC86916Ae673bDFCc9c712057092E57b270f5f',
  PassportNFTv3: '✅ 0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163',
  DragonRouter: '0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e',
  DemandSignalEngine: '✅ 0xC2Eb75ddf31cd481765D550A91C5A63363B36817',
  SmartEventManifest: '✅ 0x5cfe8379058cA460aA60ef15051Be57dab4A651C',
  TandaYieldGroup: '✅ 0xE0983Cd98f5852AD6BF56648B4724979B75E9fC8',
  CreditScoreCalculator: '✅ 0x9598397899CCcf9d0CFbDB40dEf1EF34e550c0c5',
  ToursToken: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7',
  // Mini-app Contracts
  ActionBasedDemandSignal: '✅ 0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E',
  ItineraryNFT: '✅ 0x5B61286AC88688fe8930711fAa5b1155e98daFe8',
  MusicBeatMatch: '✅ 0xee83AC7E916f4feBDb7297363B47eE370FE2EC87',
  CountryCollector: '✅ 0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200',
  TandaPool: '✅ 0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B',
} as const;
