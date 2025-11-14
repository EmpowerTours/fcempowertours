import { createPublicClient, http, Address, parseAbi, Hex, encodeFunctionData, parseEther, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
    public: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' },
  },
  testnet: true,
});

// Load environment variables
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;
const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as Address;
const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;
const SAFE_OWNER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`;

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

async function diagnose() {
  console.log('🔍 DIAGNOSING USEROPERATION SIMULATION FAILURE\n');
  console.log('=' .repeat(60));

  // 1. Check if Safe account exists
  console.log('\n1️⃣ Checking Safe Account:', SAFE_ACCOUNT);
  try {
    const code = await client.getCode({ address: SAFE_ACCOUNT });
    if (!code || code === '0x') {
      console.log('❌ CRITICAL: Safe account has no code - NOT DEPLOYED!');
      console.log('   This is likely the main issue. The Safe account must be deployed first.');
      return;
    } else {
      console.log('✅ Safe account is deployed (has code)');
      console.log('   Code length:', code.length, 'bytes');
    }
  } catch (e: any) {
    console.log('❌ Error checking Safe account:', e.message);
    return;
  }

  // 2. Check Safe balance
  console.log('\n2️⃣ Checking Safe Balances:');
  try {
    const monBalance = await client.getBalance({ address: SAFE_ACCOUNT });
    console.log('   MON balance:', Number(monBalance) / 1e18, 'MON');

    if (monBalance < parseEther('0.001')) {
      console.log('   ⚠️ WARNING: MON balance is low, might not have enough for gas');
    }

    const toursBalance = await client.readContract({
      address: TOURS_TOKEN,
      abi: parseAbi(['function balanceOf(address) external view returns (uint256)']),
      functionName: 'balanceOf',
      args: [SAFE_ACCOUNT],
    });
    console.log('   TOURS balance:', Number(toursBalance) / 1e18, 'TOURS');

    if (toursBalance < parseEther('10')) {
      console.log('   ⚠️ WARNING: TOURS balance is low, need at least 10 TOURS to mint');
    }
  } catch (e: any) {
    console.log('   ❌ Error checking balances:', e.message);
  }

  // 3. Check if EntryPoint exists
  console.log('\n3️⃣ Checking EntryPoint:', ENTRYPOINT_ADDRESS);
  try {
    const code = await client.getCode({ address: ENTRYPOINT_ADDRESS });
    if (!code || code === '0x') {
      console.log('   ❌ CRITICAL: EntryPoint has no code - NOT DEPLOYED!');
    } else {
      console.log('   ✅ EntryPoint is deployed');
    }
  } catch (e: any) {
    console.log('   ❌ Error checking EntryPoint:', e.message);
  }

  // 4. Check if TOURS token exists
  console.log('\n4️⃣ Checking TOURS Token:', TOURS_TOKEN);
  try {
    const code = await client.getCode({ address: TOURS_TOKEN });
    if (!code || code === '0x') {
      console.log('   ❌ CRITICAL: TOURS token has no code - NOT DEPLOYED!');
    } else {
      console.log('   ✅ TOURS token is deployed');
    }
  } catch (e: any) {
    console.log('   ❌ Error checking TOURS token:', e.message);
  }

  // 5. Check if Passport NFT exists
  console.log('\n5️⃣ Checking Passport NFT:', PASSPORT_NFT);
  try {
    const code = await client.getCode({ address: PASSPORT_NFT });
    if (!code || code === '0x') {
      console.log('   ❌ CRITICAL: Passport NFT has no code - NOT DEPLOYED!');
    } else {
      console.log('   ✅ Passport NFT is deployed');
    }
  } catch (e: any) {
    console.log('   ❌ Error checking Passport NFT:', e.message);
  }

  // 6. Check Safe modules
  console.log('\n6️⃣ Checking Safe Modules:');
  try {
    const modulesAbi = parseAbi([
      'function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] array, address next)',
    ]);
    const [modules] = await client.readContract({
      address: SAFE_ACCOUNT,
      abi: modulesAbi,
      functionName: 'getModulesPaginated',
      args: ['0x0000000000000000000000000000000000000001' as Address, 10n],
    });
    console.log('   Enabled modules:', modules);
    if (modules.length === 0) {
      console.log('   ⚠️ WARNING: No modules enabled on Safe');
    }
  } catch (e: any) {
    console.log('   ❌ Error checking modules:', e.message);
  }

  // 7. Check Safe fallback handler
  console.log('\n7️⃣ Checking Safe Fallback Handler:');
  try {
    const FALLBACK_HANDLER_STORAGE_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
    const storageValue = await client.getStorageAt({
      address: SAFE_ACCOUNT,
      slot: FALLBACK_HANDLER_STORAGE_SLOT as `0x${string}`,
    });
    const fallbackHandler = storageValue
      ? ('0x' + storageValue.slice(-40)) as `0x${string}`
      : '0x0000000000000000000000000000000000000000';
    console.log('   Fallback handler:', fallbackHandler);

    if (fallbackHandler === '0x0000000000000000000000000000000000000000') {
      console.log('   ❌ CRITICAL: No fallback handler set! This is required for ERC-4337');
      console.log('   The Safe needs a fallback handler to support ERC-4337 operations');
    } else {
      // Check if fallback handler is deployed
      const handlerCode = await client.getCode({ address: fallbackHandler as Address });
      if (!handlerCode || handlerCode === '0x') {
        console.log('   ❌ CRITICAL: Fallback handler has no code - NOT DEPLOYED!');
      } else {
        console.log('   ✅ Fallback handler is deployed');
      }
    }
  } catch (e: any) {
    console.log('   ❌ Error checking fallback handler:', e.message);
  }

  // 8. Try to simulate the actual operation
  console.log('\n8️⃣ Simulating the actual operation:');
  try {
    const userAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address; // Example user
    const MINT_PRICE = parseEther('10');

    console.log('   Testing approve operation...');
    try {
      await client.simulateContract({
        address: TOURS_TOKEN,
        abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
        functionName: 'approve',
        args: [PASSPORT_NFT, MINT_PRICE],
        account: SAFE_ACCOUNT,
      });
      console.log('   ✅ Approve simulation succeeded');
    } catch (approveErr: any) {
      console.log('   ❌ Approve simulation failed:', approveErr.shortMessage || approveErr.message);
    }

    console.log('   Testing mint operation...');
    try {
      await client.simulateContract({
        address: PASSPORT_NFT,
        abi: parseAbi([
          'function mint(address to, string countryCode, string countryName, string region, string continent, string uri) external returns (uint256)'
        ]),
        functionName: 'mint',
        args: [
          userAddress,
          'MX',
          'Mexico',
          'Americas',
          'North America',
          '',
        ],
        account: SAFE_ACCOUNT,
      });
      console.log('   ✅ Mint simulation succeeded');
    } catch (mintErr: any) {
      console.log('   ❌ Mint simulation failed:', mintErr.shortMessage || mintErr.message);
      console.log('   Details:', mintErr.details);
    }
  } catch (e: any) {
    console.log('   ❌ Error during simulation:', e.message);
  }

  // 9. Check Safe version
  console.log('\n9️⃣ Checking Safe Version:');
  try {
    const versionAbi = parseAbi(['function VERSION() external view returns (string)']);
    const version = await client.readContract({
      address: SAFE_ACCOUNT,
      abi: versionAbi,
      functionName: 'VERSION',
    });
    console.log('   Safe version:', version);
  } catch (e: any) {
    console.log('   ⚠️ Could not read Safe version:', e.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 DIAGNOSIS COMPLETE\n');
}

diagnose().catch(console.error);
