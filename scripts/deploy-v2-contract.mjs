/**
 * Deploy EmpowerToursYieldStrategyV2 contract
 *
 * This deploys the COMPLETE V2 contract with:
 * - Kintsu integration
 * - TokenSwap for TOURS ↔ MON
 * - DragonRouter yield allocation
 * - NFT whitelist with addAcceptedNFT()
 * - Beneficiary parameter for delegated staking
 */

import { createWalletClient, http, parseAbi, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import fs from 'fs';
import solc from 'solc';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
});

// Constructor parameters (checksummed)
const TOURS_TOKEN = getAddress('0xa123600c82E69cB311B0e068B06Bfa9F787699B7');
const KINTSU = getAddress('0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5');
const TOKEN_SWAP = getAddress('0xe004F2eaCd0AD74E14085929337875b20975F0AA');
const DRAGON_ROUTER = getAddress('0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e');
const KEEPER = getAddress('0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9');

const DEPLOYER_PRIVATE_KEY = '0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6';

async function compileContract() {
  console.log('📦 Reading contract source...');
  const contractPath = './contracts/EmpowerToursYieldStrategyV2.sol';
  const source = fs.readFileSync(contractPath, 'utf8');

  console.log('🔧 Compiling contract...');

  // Solidity compiler input
  const input = {
    language: 'Solidity',
    sources: {
      'EmpowerToursYieldStrategyV2.sol': {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };

  // Import callback for OpenZeppelin contracts
  function findImports(path) {
    if (path.startsWith('@openzeppelin/')) {
      const ozPath = path.replace('@openzeppelin/', './node_modules/@openzeppelin/');
      try {
        const contents = fs.readFileSync(ozPath, 'utf8');
        return { contents };
      } catch (error) {
        return { error: 'File not found: ' + ozPath };
      }
    }
    return { error: 'File not found' };
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  // Check for errors
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('❌ Compilation errors:');
      errors.forEach(err => console.error(err.formattedMessage));
      throw new Error('Compilation failed');
    }

    // Show warnings
    const warnings = output.errors.filter(e => e.severity === 'warning');
    if (warnings.length > 0) {
      console.log('⚠️  Compilation warnings:');
      warnings.forEach(warn => console.log(warn.formattedMessage));
    }
  }

  const contract = output.contracts['EmpowerToursYieldStrategyV2.sol']['EmpowerToursYieldStrategyV2'];
  console.log('✅ Contract compiled successfully');

  return {
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object,
  };
}

async function deployContract() {
  try {
    const { abi, bytecode } = await compileContract();

    const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(),
    });

    console.log('');
    console.log('🚀 Deploying EmpowerToursYieldStrategyV2...');
    console.log('Deployer:', account.address);
    console.log('');
    console.log('Constructor Arguments:');
    console.log('  TOURS Token:', TOURS_TOKEN);
    console.log('  Kintsu:', KINTSU);
    console.log('  TokenSwap:', TOKEN_SWAP);
    console.log('  DragonRouter:', DRAGON_ROUTER);
    console.log('  Keeper:', KEEPER);
    console.log('');

    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: [TOURS_TOKEN, KINTSU, TOKEN_SWAP, DRAGON_ROUTER, KEEPER],
    });

    console.log('✅ Deployment transaction sent!');
    console.log('TX hash:', hash);
    console.log('');
    console.log('Waiting for confirmation...');

    const { createPublicClient } = await import('viem');
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('');
      console.log('✅ CONTRACT DEPLOYED SUCCESSFULLY! ✅');
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Contract Address:', receipt.contractAddress);
      console.log('Block Number:', receipt.blockNumber);
      console.log('Gas Used:', receipt.gasUsed.toString());
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('Next steps:');
      console.log('1. Update YIELD_STRATEGY in app/api/execute-delegated/route.ts');
      console.log('2. Update YIELD_STRATEGY in scripts/diagnose-staking.ts');
      console.log('3. Whitelist Passport NFT: 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8');
      console.log('');
      console.log('To whitelist the NFT, run:');
      console.log(`node scripts/whitelist-execute.mjs addAcceptedNFT 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8`);
      console.log('');
    } else {
      console.log('❌ Deployment transaction reverted');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
    if (err.cause) {
      console.error('Cause:', err.cause);
    }
    process.exit(1);
  }
}

deployContract().catch(console.error);
