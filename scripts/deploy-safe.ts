import { config } from 'dotenv';
config({ path: '.env.local' });

import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' } },
};

// ✅ VALIDATION: Check env var exists
const SAFE_OWNER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY;

if (!SAFE_OWNER_PRIVATE_KEY) {
  console.error('❌ SAFE_OWNER_PRIVATE_KEY not found in .env.local');
  console.error('Please add this to .env.local:');
  console.error('SAFE_OWNER_PRIVATE_KEY="0x..."');
  process.exit(1);
}

// ✅ VALIDATION: Ensure it starts with 0x
const privateKey = SAFE_OWNER_PRIVATE_KEY.startsWith('0x') 
  ? SAFE_OWNER_PRIVATE_KEY as `0x${string}`
  : `0x${SAFE_OWNER_PRIVATE_KEY}` as `0x${string}`;

console.log('🔑 Using private key:', privateKey.slice(0, 10) + '...');

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
});

const SAFE_PROXY_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67' as `0x${string}`;
const SAFE_L2_MASTER_COPY = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762' as `0x${string}`;
const SAFE_MODULE_SETUP = '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47' as `0x${string}`;
const SAFE_4337_MODULE_V0_3_0 = '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226' as `0x${string}`;
const SALT_NONCE = 0n;

const account = privateKeyToAccount(privateKey);
console.log('👤 Deployer address:', account.address);

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
});

async function deploySafe() {
  try {
    console.log('\n📝 Step 1: Encoding module setup...');
    
    // Encode enableModules data
    const enableModulesData = encodeFunctionData({
      abi: parseAbi(['function enableModules(address[] modules) external']),
      functionName: 'enableModules',
      args: [[SAFE_4337_MODULE_V0_3_0]],
    });

    console.log('✅ Module setup data:', enableModulesData.slice(0, 20) + '...');

    console.log('\n📝 Step 2: Encoding Safe initializer...');
    
    // Encode initializer for setup
    const initializer = encodeFunctionData({
      abi: parseAbi([
        'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
      ]),
      functionName: 'setup',
      args: [
        [account.address], // Owners
        1n, // Threshold
        SAFE_MODULE_SETUP, // To: module setup
        enableModulesData, // Data: enable 4337 module
        SAFE_4337_MODULE_V0_3_0, // Fallback handler: 4337 module
        '0x0000000000000000000000000000000000000000' as `0x${string}`, // Payment token
        0n, // Payment
        '0x0000000000000000000000000000000000000000' as `0x${string}`, // Payment receiver
      ],
    });

    console.log('✅ Initializer:', initializer.slice(0, 20) + '...');

    console.log('\n📝 Step 3: Simulating deployment...');
    
    // Deploy proxy
    const { request } = await publicClient.simulateContract({
      account,
      address: SAFE_PROXY_FACTORY,
      abi: parseAbi(['function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) external returns (address proxy)']),
      functionName: 'createProxyWithNonce',
      args: [SAFE_L2_MASTER_COPY, initializer, SALT_NONCE],
    });

    console.log('✅ Simulation successful');

    console.log('\n📝 Step 4: Deploying Safe...');
    
    const txHash = await walletClient.writeContract(request);
    console.log('📤 Safe deployment tx:', txHash);

    console.log('\n⏳ Step 5: Waiting for confirmation...');
    
    // Get new Safe address from receipt (ProxyCreation event)
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    
    console.log('✅ Transaction confirmed in block:', receipt.blockNumber);

    const proxyLog = receipt.logs.find(log => 
      log.address.toLowerCase() === SAFE_PROXY_FACTORY.toLowerCase()
    );

    if (proxyLog) {
      const decoded = decodeEventLog({
        abi: parseAbi(['event ProxyCreation(address indexed proxy, address singleton)']),
        data: proxyLog.data,
        topics: proxyLog.topics,
      });
      
      const newSafeAddress = decoded.args.proxy;
      
      console.log('\n🎉 SUCCESS! New SafeL2 deployed:');
      console.log('📍 Address:', newSafeAddress);
      console.log('👤 Owner:', account.address);
      console.log('🔧 Module enabled:', SAFE_4337_MODULE_V0_3_0);
      console.log('🔗 Explorer:', `https://testnet.monadexplorer.com/address/${newSafeAddress}`);
      
      console.log('\n📝 Update your .env.local:');
      console.log(`NEXT_PUBLIC_SAFE_ACCOUNT="${newSafeAddress}"`);
      console.log(`NEXT_PUBLIC_ENTRYPOINT_ADDRESS="0x0000000071727De22E5E9d8BAf0edAc6f37da032"`);
      
      console.log('\n💰 Fund the Safe with MON:');
      console.log(`Send ~1 MON to: ${newSafeAddress}`);
      
    } else {
      console.log('❌ No ProxyCreation log found in receipt');
      console.log('Receipt logs:', receipt.logs.length);
    }
  } catch (error: any) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    if (error.details) {
      console.error('Details:', error.details);
    }
    process.exit(1);
  }
}

deploySafe();
