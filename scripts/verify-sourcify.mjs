/**
 * Verify contract on Sourcify (used by Monad Explorer)
 */

import { readFileSync } from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const CONTRACT_ADDRESS = '0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c';
const CHAIN_ID = '10143'; // Monad Testnet
const SOURCE_FILE = 'contracts/EmpowerToursYieldStrategyV2.sol';

// Compiler settings used during deployment
const metadata = {
  language: 'Solidity',
  sources: {
    'contracts/EmpowerToursYieldStrategyV2.sol': {
      content: readFileSync(SOURCE_FILE, 'utf8')
    }
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 10000
    },
    viaIR: true,
    evmVersion: 'paris',
    outputSelection: {
      '*': {
        '*': ['metadata', 'evm.bytecode', 'evm.deployedBytecode']
      }
    }
  }
};

async function verifySourcify() {
  console.log('🔍 Verifying contract on Sourcify...');
  console.log('Contract:', CONTRACT_ADDRESS);
  console.log('Chain ID:', CHAIN_ID);
  console.log('');

  try {
    // Prepare form data
    const formData = new FormData();
    formData.append('address', CONTRACT_ADDRESS);
    formData.append('chain', CHAIN_ID);
    formData.append('files', readFileSync(SOURCE_FILE), {
      filename: SOURCE_FILE,
      contentType: 'text/plain'
    });
    formData.append('files', JSON.stringify(metadata), {
      filename: 'metadata.json',
      contentType: 'application/json'
    });

    // Submit to Sourcify
    console.log('📤 Submitting to Sourcify API...');
    const response = await fetch('https://sourcify.dev/server/verify', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const result = await response.json();
    console.log('');
    console.log('📋 Sourcify Response:', JSON.stringify(result, null, 2));

    if (result.result && result.result[0].status === 'perfect') {
      console.log('');
      console.log('✅ Contract verified successfully on Sourcify!');
      console.log(`🔗 View on Monad Explorer: https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`);
    } else {
      console.log('');
      console.log('⚠️  Verification status:', result.result?.[0]?.status || 'unknown');
      console.log('Note: The contract may still be viewable on the explorer even if verification is partial.');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('');
    console.error('💡 Alternative: Try manual verification at:');
    console.error('   https://testnet.monadexplorer.com/address/' + CONTRACT_ADDRESS);
  }
}

verifySourcify().catch(console.error);
