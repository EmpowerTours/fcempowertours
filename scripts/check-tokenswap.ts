import { createPublicClient, http, formatEther, defineChain, parseAbi } from 'viem';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  testnet: true,
});

const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA';
const TOURS_TOKEN = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const SWAP_ABI = parseAbi([
  'function owner() external view returns (address)',
  'function paused() external view returns (bool)',
  'function swapMonForTours() external payable',
  'function withdrawTours(uint256 amount) external',
  'function getExchangeRate() external view returns (uint256)',
]);

const TOKEN_ABI = parseAbi([
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
]);

async function checkTokenSwap() {
  console.log('\n========================================');
  console.log('   TOKEN SWAP CONTRACT DIAGNOSTICS');
  console.log('========================================\n');
  console.log(`TokenSwap: ${TOKEN_SWAP_ADDRESS}`);
  console.log(`TOURS Token: ${TOURS_TOKEN}\n`);

  try {
    // Check if contract is deployed
    const code = await publicClient.getCode({ address: TOKEN_SWAP_ADDRESS as `0x${string}` });
    if (!code || code === '0x') {
      console.error('❌ TokenSwap contract is NOT deployed!');
      return;
    }
    console.log('✅ Contract is deployed\n');

    // Check owner
    try {
      const owner = await publicClient.readContract({
        address: TOKEN_SWAP_ADDRESS as `0x${string}`,
        abi: SWAP_ABI,
        functionName: 'owner',
      });
      console.log(`Owner: ${owner}`);
    } catch (e: any) {
      console.log('⚠️  Could not read owner (contract might not have this function)');
    }

    // Check paused status
    try {
      const paused = await publicClient.readContract({
        address: TOKEN_SWAP_ADDRESS as `0x${string}`,
        abi: SWAP_ABI,
        functionName: 'paused',
      });
      console.log(`Paused: ${paused ? '❌ YES - Contract is paused!' : '✅ NO'}`);
    } catch (e: any) {
      console.log('⚠️  Could not read paused status');
    }

    // Check exchange rate
    try {
      const rate = await publicClient.readContract({
        address: TOKEN_SWAP_ADDRESS as `0x${string}`,
        abi: SWAP_ABI,
        functionName: 'getExchangeRate',
      });
      console.log(`Exchange Rate: 1 MON = ${rate} TOURS\n`);
    } catch (e: any) {
      console.log('⚠️  Could not read exchange rate\n');
    }

    // Check TOURS balance in swap contract
    console.log('TOURS Token Balance in Swap Contract:');
    const toursBalance = await publicClient.readContract({
      address: TOURS_TOKEN as `0x${string}`,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [TOKEN_SWAP_ADDRESS as `0x${string}`],
    });
    console.log(`   Balance: ${formatEther(toursBalance)} TOURS`);

    if (toursBalance === 0n) {
      console.log('   ❌ CRITICAL: Swap contract has ZERO TOURS tokens!');
      console.log('   The contract cannot fulfill swap requests.\n');
    } else if (toursBalance < 100n * 10n**18n) {
      console.log('   ⚠️  WARNING: Low balance (< 100 TOURS)\n');
    } else {
      console.log('   ✅ Sufficient balance for swaps\n');
    }

    // Check MON balance
    const monBalance = await publicClient.getBalance({
      address: TOKEN_SWAP_ADDRESS as `0x${string}`,
    });
    console.log(`MON Balance: ${formatEther(monBalance)} MON\n`);

    // Test swap simulation
    console.log('Testing swap simulation (1 MON)...');
    try {
      await publicClient.simulateContract({
        address: TOKEN_SWAP_ADDRESS as `0x${string}`,
        abi: SWAP_ABI,
        functionName: 'swapMonForTours',
        value: 10n**18n, // 1 MON
        account: '0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9' as `0x${string}`,
      });
      console.log('✅ Swap simulation succeeded\n');
    } catch (simErr: any) {
      console.error('❌ Swap simulation FAILED:');
      console.error(`   ${simErr.shortMessage || simErr.message}\n`);

      if (simErr.message.includes('insufficient')) {
        console.error('   Likely cause: Contract has insufficient TOURS tokens');
      }
    }

    // Summary
    console.log('========================================');
    console.log('   DIAGNOSIS');
    console.log('========================================\n');

    if (toursBalance === 0n) {
      console.log('❌ PROBLEM IDENTIFIED: Swap contract has no TOURS tokens!\n');
      console.log('SOLUTION:');
      console.log('   1. Fund the swap contract with TOURS tokens');
      console.log(`   2. Send TOURS to: ${TOKEN_SWAP_ADDRESS}`);
      console.log('   3. Recommended amount: 10,000+ TOURS for reliable operation\n');
      console.log('Example funding transaction:');
      console.log(`   TOURS.transfer("${TOKEN_SWAP_ADDRESS}", parseEther("10000"))\n`);
    }

  } catch (error: any) {
    console.error('\n❌ Error checking TokenSwap:', error.message);
    throw error;
  }
}

checkTokenSwap()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
