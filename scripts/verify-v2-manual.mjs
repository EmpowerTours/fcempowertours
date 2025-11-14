/**
 * Manual verification helper for V2 contract (ALREADY DEPLOYED)
 *
 * Contract: 0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c
 *
 * PROBLEM: Source has pragma ^0.8.24 but was compiled with 0.8.20
 * SOLUTION: Use V3 source (which has pragma 0.8.20) OR manually edit during verification
 */

const CONTRACT_ADDRESS = '0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c';

// These are the ACTUAL constructor args used when deploying V2
const TOURS_TOKEN = '0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B';
const KINTSU = '0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5';
const TOKEN_SWAP = '0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2';
const DRAGON_ROUTER = '0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea';
const KEEPER = '0x37302543aeF0b06202adcb06Db36daB05F8237E9'; // NOTE: Different from deploy script!

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 V2 Contract Verification Info (ALREADY DEPLOYED)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Contract Address: ' + CONTRACT_ADDRESS);
console.log('Network: Monad Testnet (10143)');
console.log('');
console.log('⚠️  PRAGMA MISMATCH ISSUE:');
console.log('   - V2 source file has: pragma solidity ^0.8.24');
console.log('   - But compiled with: v0.8.20+commit.a1b79de6');
console.log('');
console.log('🔧 VERIFICATION OPTIONS:');
console.log('');
console.log('Option 1: Use V3 source file (RECOMMENDED)');
console.log('   - File: contracts/EmpowerToursYieldStrategyV3.sol');
console.log('   - Contract name: EmpowerToursYieldStrategyV3');
console.log('   - Has correct pragma: ^0.8.20');
console.log('');
console.log('Option 2: Manually edit during web verification');
console.log('   - Use V2 source but change pragma from ^0.8.24 to ^0.8.20');
console.log('   - Change contract name from V2 to V3 is optional');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Compilation Settings');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Compiler: v0.8.20+commit.a1b79de6');
console.log('Optimization: Enabled');
console.log('Runs: 10000');
console.log('Via IR: YES (CRITICAL!)');
console.log('EVM Version: paris');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔐 Constructor Arguments (ABI-encoded)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Encode constructor args
const { encodeAbiParameters, parseAbiParameters, getAddress } = await import('viem');
const checksummedArgs = [
  getAddress(TOURS_TOKEN),
  getAddress(KINTSU),
  getAddress(TOKEN_SWAP),
  getAddress(DRAGON_ROUTER),
  getAddress(KEEPER),
];
const encoded = encodeAbiParameters(
  parseAbiParameters('address, address, address, address, address'),
  checksummedArgs
);

console.log(encoded.slice(2)); // Remove 0x
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📍 Constructor Arguments (Decoded)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('1. TOURS Token:  ' + TOURS_TOKEN);
console.log('2. Kintsu:       ' + KINTSU);
console.log('3. TokenSwap:    ' + TOKEN_SWAP);
console.log('4. DragonRouter: ' + DRAGON_ROUTER);
console.log('5. Keeper:       ' + KEEPER);
console.log('');
console.log('⚠️  NOTE: KEEPER address differs from deploy script!');
console.log('   Deploy script has: 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9');
console.log('   Actually deployed: ' + KEEPER);
console.log('   See KEEPER_ADDRESS_INFO.md for details');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🌐 Manual Verification URL');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('https://testnet.monadexplorer.com/address/' + CONTRACT_ADDRESS);
console.log('');
