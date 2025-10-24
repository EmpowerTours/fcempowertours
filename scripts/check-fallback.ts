import { config } from 'dotenv';
config({ path: '.env.local' });

import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};

const SAFE_ADDRESS = '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20' as `0x${string}`;
const SAFE_4337_MODULE = '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226' as `0x${string}`;

const privateKey = process.env.SAFE_OWNER_PRIVATE_KEY!.startsWith('0x')
  ? process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`
  : `0x${process.env.SAFE_OWNER_PRIVATE_KEY}` as `0x${string}`;

const account = privateKeyToAccount(privateKey);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz'),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz'),
});

async function checkAndFixFallbackHandler() {
  console.log('🔍 Checking Safe fallback handler...');
  console.log('Safe Address:', SAFE_ADDRESS);
  console.log('');

  // Check current fallback handler using storage slot
  // For Safe v1.4.1, fallback handler is at storage slot:
  // keccak256("fallback_manager.handler.address")
  const FALLBACK_HANDLER_STORAGE_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
  
  try {
    const storageValue = await publicClient.getStorageAt({
      address: SAFE_ADDRESS,
      slot: FALLBACK_HANDLER_STORAGE_SLOT as `0x${string}`,
    });
    
    console.log('📦 Current fallback handler (raw):', storageValue);
    
    // Convert storage value to address (last 20 bytes)
    const currentHandler = storageValue 
      ? ('0x' + storageValue.slice(-40)) as `0x${string}`
      : '0x0000000000000000000000000000000000000000';
    
    console.log('📍 Current fallback handler:', currentHandler);
    console.log('🎯 Expected (4337 Module):', SAFE_4337_MODULE);
    console.log('');

    if (currentHandler.toLowerCase() === SAFE_4337_MODULE.toLowerCase()) {
      console.log('✅ Fallback handler is correctly set to 4337 module');
      return;
    }

    if (currentHandler === '0x0000000000000000000000000000000000000000') {
      console.log('⚠️  Fallback handler is not set (zero address)');
    } else {
      console.log('⚠️  Fallback handler is set to wrong address');
    }

    console.log('');
    console.log('🔧 Setting fallback handler to 4337 module...');

    // Encode setFallbackHandler call
    const setFallbackHandlerData = encodeFunctionData({
      abi: parseAbi(['function setFallbackHandler(address handler) external']),
      functionName: 'setFallbackHandler',
      args: [SAFE_4337_MODULE],
    });

    // Execute via Safe's execTransaction
    const execTransactionData = encodeFunctionData({
      abi: parseAbi([
        'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes signatures) external payable returns (bool success)'
      ]),
      functionName: 'execTransaction',
      args: [
        SAFE_ADDRESS, // to: self (Safe contract)
        0n, // value
        setFallbackHandlerData, // data: setFallbackHandler call
        0, // operation: 0 = CALL
        0n, // safeTxGas
        0n, // baseGas
        0n, // gasPrice
        '0x0000000000000000000000000000000000000000' as `0x${string}`, // gasToken
        '0x0000000000000000000000000000000000000000' as `0x${string}`, // refundReceiver
        '0x000000000000000000000000' + account.address.slice(2) + '0000000000000000000000000000000000000000000000000000000000000000' + '01' as `0x${string}`, // signature (owner sig with v=1 for approved hash)
      ],
    });

    console.log('📝 Transaction data prepared');
    console.log('');

    // Send transaction
    const hash = await walletClient.sendTransaction({
      to: SAFE_ADDRESS,
      data: execTransactionData,
      gas: 500000n,
    });

    console.log('✅ Transaction sent:', hash);
    console.log('🔗 Explorer:', `https://testnet.monadexplorer.com/tx/${hash}`);
    console.log('');
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ Fallback handler updated successfully!');
      console.log('📍 Block:', receipt.blockNumber);
      
      // Verify
      const newStorageValue = await publicClient.getStorageAt({
        address: SAFE_ADDRESS,
        slot: FALLBACK_HANDLER_STORAGE_SLOT as `0x${string}`,
      });
      const newHandler = ('0x' + newStorageValue!.slice(-40)) as `0x${string}`;
      console.log('');
      console.log('🎉 New fallback handler:', newHandler);
    } else {
      console.log('❌ Transaction failed');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
    process.exit(1);
  }
}

checkAndFixFallbackHandler();
