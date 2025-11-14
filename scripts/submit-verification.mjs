/**
 * Submit contract verification to Monadscan API
 * Using Etherscan-compatible API
 */

import fs from 'fs';

const CONTRACT_ADDRESS = '0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086';
const API_KEY = 'FQSX86QUTQYPUNG1WJTYBNC665XPTRYD6J';
const CHAIN_ID = '10143';

// Read the flattened contract source
const sourceCode = fs.readFileSync('./contracts/EmpowerToursYieldStrategyV3.flattened.sol', 'utf8');

// Constructor arguments (ABI-encoded, without 0x prefix)
const constructorArgs = '00000000000000000000000096ad3dea5d1a4d3db4e8bb7e86f0e47f02e1c48b000000000000000000000000e1d2439b75fb9746e7bc6cb777ae10aa7f7ef9c500000000000000000000000066090c97f4f57c8f3cb5bec90ab35f8fa68de1e2000000000000000000000000c57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea000000000000000000000000e67e13d545c76c2b4e28dfe27ad827e1fc18e8d9';

// Prepare verification payload
const payload = {
  apikey: API_KEY,
  module: 'contract',
  action: 'verifysourcecode',
  contractaddress: CONTRACT_ADDRESS,
  sourceCode: sourceCode,
  codeformat: 'solidity-single-file',
  contractname: 'EmpowerToursYieldStrategyV3',
  compilerversion: 'v0.8.20+commit.a1b79de6',
  optimizationUsed: '1',
  runs: '10000',
  constructorArguements: constructorArgs, // Note: Etherscan API uses this spelling
  evmversion: 'paris',
  licenseType: '3', // MIT License
  viaIR: '1', // Via IR enabled
};

console.log('🚀 Submitting contract verification to Monadscan API...');
console.log('');
console.log('Contract:', CONTRACT_ADDRESS);
console.log('Network: Monad Testnet');
console.log('');

// Try multiple API endpoints
const apiEndpoints = [
  'https://testnet.monadexplorer.com/api',
  'https://api-testnet.monadexplorer.com',
  'https://testnet-api.monadexplorer.com',
];

async function tryVerification(endpoint) {
  try {
    console.log(`Trying endpoint: ${endpoint}`);

    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      formData.append(key, value);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const text = await response.text();
    console.log(`Response (${response.status}):`, text);

    if (response.ok) {
      try {
        const data = JSON.parse(text);
        return { success: true, data, endpoint };
      } catch {
        return { success: true, data: text, endpoint };
      }
    }

    return { success: false, error: text, endpoint };
  } catch (err) {
    console.log(`Error: ${err.message}`);
    return { success: false, error: err.message, endpoint };
  }
}

// Try all endpoints
for (const endpoint of apiEndpoints) {
  const result = await tryVerification(endpoint);

  if (result.success) {
    console.log('');
    console.log('✅ Verification submitted successfully!');
    console.log('Endpoint:', result.endpoint);
    console.log('Response:', result.data);

    if (result.data.result) {
      console.log('');
      console.log('GUID:', result.data.result);
      console.log('');
      console.log('Check status with:');
      console.log(`curl "${result.endpoint}?module=contract&action=checkverifystatus&guid=${result.data.result}&apikey=${API_KEY}"`);
    }

    process.exit(0);
  }

  console.log('');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚠️  API Verification Failed - Use Manual Verification');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Visit: https://testnet.monadexplorer.com/address/' + CONTRACT_ADDRESS);
console.log('');
console.log('Manual Verification Info:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Compiler: v0.8.20+commit.a1b79de6');
console.log('Optimization: Enabled (10000 runs)');
console.log('Via IR: Yes');
console.log('EVM Version: paris');
console.log('License: MIT');
console.log('');
console.log('Contract Source:');
console.log('  Use: contracts/EmpowerToursYieldStrategyV3.flattened.sol');
console.log('');
console.log('Constructor Arguments (ABI-encoded):');
console.log(constructorArgs);
console.log('');
