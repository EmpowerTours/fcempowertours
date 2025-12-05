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
const DEPLOYER_ADDRESS = '0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const TOKEN_ABI = parseAbi([
  'function balanceOf(address) external view returns (uint256)',
]);

const SWAP_ABI = parseAbi([
  'function exchangeRate() external view returns (uint256)',
  'function owner() external view returns (address)',
]);

async function checkBalances() {
  console.log('\n========================================');
  console.log('   SWAP BALANCE DIAGNOSTICS');
  console.log('========================================\n');

  // Check deployer's MON balance
  const deployerMON = await publicClient.getBalance({
    address: DEPLOYER_ADDRESS as `0x${string}`,
  });
  console.log('Deployer (0xe67...8D9):');
  console.log(`   MON Balance: ${formatEther(deployerMON)} MON`);

  // Check deployer's TOURS balance
  const deployerTOURS = await publicClient.readContract({
    address: TOURS_TOKEN as `0x${string}`,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: [DEPLOYER_ADDRESS as `0x${string}`],
  });
  console.log(`   TOURS Balance: ${formatEther(deployerTOURS)} TOURS\n`);

  // Check TokenSwap contract balances
  const swapMON = await publicClient.getBalance({
    address: TOKEN_SWAP_ADDRESS as `0x${string}`,
  });
  console.log('TokenSwap Contract (0xe00...0AA):');
  console.log(`   MON Balance: ${formatEther(swapMON)} MON`);

  const swapTOURS = await publicClient.readContract({
    address: TOURS_TOKEN as `0x${string}`,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: [TOKEN_SWAP_ADDRESS as `0x${string}`],
  });
  console.log(`   TOURS Balance: ${formatEther(swapTOURS)} TOURS\n`);

  // Check exchange rate
  const exchangeRate = await publicClient.readContract({
    address: TOKEN_SWAP_ADDRESS as `0x${string}`,
    abi: SWAP_ABI,
    functionName: 'exchangeRate',
  });
  console.log(`Exchange Rate: 1 MON = ${formatEther(exchangeRate)} TOURS\n`);

  // Calculate what a 1 MON swap would require
  const oneMON = 10n**18n;
  const toursNeeded = (oneMON * exchangeRate) / 10n**18n;
  console.log(`For 1 MON swap, contract needs: ${formatEther(toursNeeded)} TOURS`);
  console.log(`Contract currently has: ${formatEther(swapTOURS)} TOURS`);

  if (swapTOURS < toursNeeded) {
    console.log(`❌ INSUFFICIENT: Need ${formatEther(toursNeeded - swapTOURS)} more TOURS\n`);
  } else {
    console.log(`✅ SUFFICIENT: Can handle the swap\n`);
  }

  // Check contract owner
  const owner = await publicClient.readContract({
    address: TOKEN_SWAP_ADDRESS as `0x${string}`,
    abi: SWAP_ABI,
    functionName: 'owner',
  });
  console.log(`Contract Owner: ${owner}\n`);

  // Check if deployer has enough MON to pay gas
  if (deployerMON < 10n**18n) {
    console.log('⚠️  WARNING: Deployer has less than 1 MON for gas fees\n');
  }

  // Summary
  console.log('========================================');
  console.log('   DIAGNOSIS');
  console.log('========================================\n');

  if (swapTOURS < toursNeeded) {
    console.log('❌ PROBLEM: TokenSwap contract needs more TOURS tokens');
    console.log(`   Current: ${formatEther(swapTOURS)} TOURS`);
    console.log(`   Needed for 1 MON swap: ${formatEther(toursNeeded)} TOURS`);
    console.log(`   Shortfall: ${formatEther(toursNeeded - swapTOURS)} TOURS\n`);
    console.log('SOLUTION:');
    console.log(`   Contract owner (${owner}) needs to call:`);
    console.log(`   TokenSwap.fundContract() with at least ${formatEther(toursNeeded - swapTOURS)} TOURS\n`);
  } else {
    console.log('✅ TokenSwap contract has sufficient TOURS');
    console.log('⚠️  Error might be caused by something else (gas, revert logic, etc.)\n');
  }
}

checkBalances()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
