/**
 * Verify contract on Monad Explorer via API
 */

import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const CONTRACT_ADDRESS = '0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c';
const CHAIN_ID = '10143';

// Constructor arguments (encoded)
const CONSTRUCTOR_ARGS = [
  '0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B', // TOURS token
  '0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5', // Kintsu
  '0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2', // TokenSwap
  '0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea', // DragonRouter
  '0x37302543aeF0b06202adcb06Db36daB05F8237E9', // Keeper
];

// Read contract source
const contractSource = readFileSync('contracts/EmpowerToursYieldStrategyV2.sol', 'utf8');

async function verifyContract() {
  console.log('🔍 Verifying contract on Monad Explorer...');
  console.log('Contract:', CONTRACT_ADDRESS);
  console.log('Chain ID:', CHAIN_ID);
  console.log('');

  // Try Blockscout API (which Monad Explorer likely uses)
  const apiUrl = 'https://testnet.monadexplorer.com/api';

  // Encode constructor arguments
  const { encodeAbiParameters, parseAbiParameters, getAddress } = await import('viem');
  const checksummedArgs = CONSTRUCTOR_ARGS.map(addr => getAddress(addr));
  const constructorArgsEncoded = encodeAbiParameters(
    parseAbiParameters('address, address, address, address, address'),
    checksummedArgs
  );

  console.log('📋 Verification Details:');
  console.log('  Compiler: v0.8.20+commit.a1b79de6');
  console.log('  Optimization: Enabled (10000 runs)');
  console.log('  Via IR: true');
  console.log('  Constructor Args:', constructorArgsEncoded.slice(2)); // Remove 0x
  console.log('');

  try {
    // Try Sourcify verification first (Blockscout supports this)
    console.log('📤 Attempting Sourcify verification...');

    const sourcifyPayload = {
      address: CONTRACT_ADDRESS,
      chain: CHAIN_ID,
      files: {
        'EmpowerToursYieldStrategyV2.sol': contractSource,
        'metadata.json': JSON.stringify({
          compiler: {
            version: '0.8.20'
          },
          language: 'Solidity',
          output: {
            abi: [],
            devdoc: { kind: 'dev', methods: {}, version: 1 },
            userdoc: { kind: 'user', methods: {}, version: 1 }
          },
          settings: {
            compilationTarget: {
              'contracts/EmpowerToursYieldStrategyV2.sol': 'EmpowerToursYieldStrategyV2'
            },
            evmVersion: 'paris',
            libraries: {},
            metadata: {
              bytecodeHash: 'ipfs'
            },
            optimizer: {
              enabled: true,
              runs: 10000
            },
            viaIR: true,
            remappings: []
          },
          sources: {
            'contracts/EmpowerToursYieldStrategyV2.sol': {
              keccak256: '',
              urls: []
            }
          },
          version: 1
        })
      }
    };

    const response = await fetch(`${apiUrl}/v1/sourcify/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sourcifyPayload),
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log('');
      console.log('✅ Contract verified successfully!');
      console.log(`🔗 View on Monad Explorer: https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`);
    } else {
      console.log('');
      console.log('⚠️  Verification response:', response.status, response.statusText);
      console.log('');
      console.log('💡 Manual verification steps:');
      console.log('   1. Visit: https://testnet.monadexplorer.com/address/' + CONTRACT_ADDRESS);
      console.log('   2. Click "Verify & Publish" or "Code" tab');
      console.log('   3. Select compiler version: 0.8.20');
      console.log('   4. Enable optimization: Yes (10000 runs)');
      console.log('   5. Enable "Via IR": Yes');
      console.log('   6. Paste contract source from contracts/EmpowerToursYieldStrategyV2.sol');
      console.log('   7. Constructor arguments (ABI-encoded):');
      console.log('      ' + constructorArgsEncoded.slice(2));
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('');
    console.error('💡 Manual verification required:');
    console.error('   Visit: https://testnet.monadexplorer.com/address/' + CONTRACT_ADDRESS);
    console.error('   Constructor arguments (ABI-encoded):');
    console.error('   ' + constructorArgsEncoded.slice(2));
  }
}

verifyContract().catch(console.error);
