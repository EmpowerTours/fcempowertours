/**
 * Verify EmpowerToursYieldStrategyV3 on Monadscan
 * Contract: 0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086
 */

import { encodeAbiParameters, parseAbiParameters, getAddress } from 'viem';
import fs from 'fs';

const CONTRACT_ADDRESS = '0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086';
const API_KEY = 'FQSX86QUTQYPUNG1WJTYBNC665XPTRYD6J';

// Constructor arguments (checksummed)
const TOURS_TOKEN = getAddress('0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B');
const KINTSU = getAddress('0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5');
const TOKEN_SWAP = getAddress('0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2');
const DRAGON_ROUTER = getAddress('0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea');
const KEEPER = getAddress('0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 V3 Contract Verification for Monadscan');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Contract Address:', CONTRACT_ADDRESS);
console.log('Network: Monad Testnet (10143)');
console.log('');

// Encode constructor arguments
const checksummedArgs = [TOURS_TOKEN, KINTSU, TOKEN_SWAP, DRAGON_ROUTER, KEEPER];
const encoded = encodeAbiParameters(
  parseAbiParameters('address, address, address, address, address'),
  checksummedArgs
);

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
console.log(encoded.slice(2)); // Remove 0x prefix
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📍 Constructor Arguments (Decoded)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('1. TOURS Token:  ', TOURS_TOKEN);
console.log('2. Kintsu:       ', KINTSU);
console.log('3. TokenSwap:    ', TOKEN_SWAP);
console.log('4. DragonRouter: ', DRAGON_ROUTER);
console.log('5. Keeper:       ', KEEPER);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🌐 Manual Verification');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Visit: https://testnet.monadexplorer.com/address/' + CONTRACT_ADDRESS);
console.log('');
console.log('Steps:');
console.log('1. Click "Verify & Publish" or "Code" tab');
console.log('2. Select "Solidity (Single file)"');
console.log('3. Enter compiler: v0.8.20+commit.a1b79de6');
console.log('4. Enable optimization: Yes, 10000 runs');
console.log('5. Enable Via IR: Yes');
console.log('6. Paste contract source from: contracts/EmpowerToursYieldStrategyV3.sol');
console.log('7. Paste constructor arguments (encoded, shown above)');
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📦 Preparing Flattened Contract...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Read the contract source
const contractSource = fs.readFileSync('./contracts/EmpowerToursYieldStrategyV3.sol', 'utf8');

// Read OpenZeppelin dependencies
const ozContracts = [
  '@openzeppelin/contracts/access/Ownable.sol',
  '@openzeppelin/contracts/token/ERC721/IERC721.sol',
  '@openzeppelin/contracts/token/ERC20/IERC20.sol',
  '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol',
  '@openzeppelin/contracts/utils/ReentrancyGuard.sol',
  '@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol',
  '@openzeppelin/contracts/utils/Address.sol',
  '@openzeppelin/contracts/utils/Context.sol',
];

console.log('Reading OpenZeppelin dependencies...');
let flattenedContract = '// SPDX-License-Identifier: MIT\n';
flattenedContract += '// Flattened from: contracts/EmpowerToursYieldStrategyV3.sol\n';
flattenedContract += '// OpenZeppelin Contracts included inline\n\n';
flattenedContract += 'pragma solidity ^0.8.20;\n\n';

// Add OpenZeppelin contracts inline
const ozFiles = {
  'Context.sol': './node_modules/@openzeppelin/contracts/utils/Context.sol',
  'Ownable.sol': './node_modules/@openzeppelin/contracts/access/Ownable.sol',
  'IERC721.sol': './node_modules/@openzeppelin/contracts/token/ERC721/IERC721.sol',
  'IERC165.sol': './node_modules/@openzeppelin/contracts/utils/introspection/IERC165.sol',
  'IERC20.sol': './node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol',
  'SafeERC20.sol': './node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol',
  'IERC20Permit.sol': './node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol',
  'Address.sol': './node_modules/@openzeppelin/contracts/utils/Address.sol',
  'ReentrancyGuard.sol': './node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol',
};

// Simple flattening - read each OZ contract and strip imports/pragmas
for (const [name, path] of Object.entries(ozFiles)) {
  try {
    let content = fs.readFileSync(path, 'utf8');
    // Remove SPDX and pragma
    content = content.replace(/\/\/ SPDX-License-Identifier:.*\n/g, '');
    content = content.replace(/pragma solidity.*;\n/g, '');
    // Remove imports
    content = content.replace(/import\s+.*;\n/g, '');
    flattenedContract += `// File: ${name}\n${content}\n\n`;
  } catch (err) {
    console.log(`  ⚠️  Could not read ${name}: ${err.message}`);
  }
}

// Add main contract (strip imports/pragma)
let mainContract = contractSource;
mainContract = mainContract.replace(/\/\/ SPDX-License-Identifier:.*\n/g, '');
mainContract = mainContract.replace(/pragma solidity.*;\n/g, '');
mainContract = mainContract.replace(/import\s+.*;\n/g, '');
flattenedContract += '// File: EmpowerToursYieldStrategyV3.sol\n' + mainContract;

// Write flattened contract
fs.writeFileSync('./contracts/EmpowerToursYieldStrategyV3.flattened.sol', flattenedContract);
console.log('✅ Flattened contract saved to: contracts/EmpowerToursYieldStrategyV3.flattened.sol');
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Verification Info Ready');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Use the flattened contract for easier verification:');
console.log('  contracts/EmpowerToursYieldStrategyV3.flattened.sol');
console.log('');
console.log('Or verify manually at:');
console.log('  https://testnet.monadexplorer.com/address/' + CONTRACT_ADDRESS);
console.log('');
