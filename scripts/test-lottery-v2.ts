import { createPublicClient, http, formatEther, defineChain, getAddress } from 'viem';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadscan.com' },
  },
  testnet: true,
});

// NEW V2 CONTRACT
const LOTTERY_ADDRESS = '0x7d237b3f18C110dE61DE95037C8bdBDb9C863164';
const PLATFORM_SAFE = '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20';
const PLATFORM_WALLET = '0x33fFCcb1802e13a7eead232BCd4706a2269582b0';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const LOTTERY_ABI = [
  {
    name: 'getCurrentRound',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'roundId', type: 'uint256' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'prizePoolMon', type: 'uint256' },
        { name: 'prizePoolShMon', type: 'uint256' },
        { name: 'participantCount', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'commitBlock', type: 'uint256' },
        { name: 'commitHash', type: 'bytes32' },
        { name: 'winner', type: 'address' },
        { name: 'winnerIndex', type: 'uint256' },
      ]
    }]
  },
  {
    name: 'getStats',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'currentRoundId', type: 'uint256' },
      { name: 'totalMonCollected', type: 'uint256' },
      { name: 'totalShMonCollected', type: 'uint256' },
      { name: 'totalMonPrizes', type: 'uint256' },
      { name: 'totalShMonPrizes', type: 'uint256' },
      { name: 'totalParticipants', type: 'uint256' },
    ]
  },
  {
    name: 'hasEnteredRound',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'roundId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'platformSafe',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    name: 'platformWallet',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
] as const;

const STATUS_NAMES = ['Active', 'CommitPending', 'RevealPending', 'Finalized'];

async function testLotteryV2() {
  console.log('\n========================================');
  console.log('   LOTTERY V2 TEST - DELEGATION MODE');
  console.log('========================================\n');
  console.log(`Contract: ${LOTTERY_ADDRESS}`);
  console.log(`Monad Testnet Explorer: https://testnet.monadscan.com/address/${LOTTERY_ADDRESS}\n`);

  try {
    // 1. Check platform addresses are configured correctly
    console.log('1. Checking Platform Configuration...');
    const platformSafe = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'platformSafe',
    });

    const platformWallet = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'platformWallet',
    });

    const platformSafeMatch = platformSafe.toLowerCase() === PLATFORM_SAFE.toLowerCase();
    const platformWalletMatch = platformWallet.toLowerCase() === PLATFORM_WALLET.toLowerCase();

    console.log(`   Platform Safe: ${platformSafe} ${platformSafeMatch ? '✅' : '❌'}`);
    console.log(`   Platform Wallet: ${platformWallet} ${platformWalletMatch ? '✅' : '❌'}`);

    if (!platformSafeMatch || !platformWalletMatch) {
      console.log('\n❌ Platform addresses do not match expected values!');
      return;
    }

    // 2. Get current round info
    console.log('\n2. Checking Current Round...');
    const round = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'getCurrentRound',
    });

    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = Number(round.endTime) - now;

    console.log(`   Round ID: ${round.roundId}`);
    console.log(`   Status: ${STATUS_NAMES[round.status]} (${round.status})`);
    console.log(`   Start: ${new Date(Number(round.startTime) * 1000).toLocaleString()}`);
    console.log(`   End: ${new Date(Number(round.endTime) * 1000).toLocaleString()}`);

    if (timeRemaining > 0) {
      const hours = Math.floor(timeRemaining / 3600);
      const minutes = Math.floor((timeRemaining % 3600) / 60);
      console.log(`   Time Remaining: ${hours}h ${minutes}m`);
    } else {
      console.log(`   Time Remaining: ENDED (${Math.abs(Math.floor(timeRemaining / 60))} minutes ago)`);
    }

    console.log(`   Prize Pool (MON): ${formatEther(round.prizePoolMon)} MON`);
    console.log(`   Prize Pool (shMON): ${formatEther(round.prizePoolShMon)} shMON`);
    console.log(`   Participants: ${round.participantCount}`);

    const isActive = round.status === 0;
    console.log(`   ${isActive ? '✅ Round is ACTIVE' : `❌ Round is ${STATUS_NAMES[round.status]}`}`);

    // 3. Get overall stats
    console.log('\n3. Overall Contract Stats...');
    const stats = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'getStats',
    });

    console.log(`   Current Round ID: ${stats[0]}`);
    console.log(`   Total MON Collected: ${formatEther(stats[1])} MON`);
    console.log(`   Total shMON Collected: ${formatEther(stats[2])} shMON`);
    console.log(`   Total MON Prizes: ${formatEther(stats[3])} MON`);
    console.log(`   Total shMON Prizes: ${formatEther(stats[4])} shMON`);
    console.log(`   Total Participants (all time): ${stats[5]}`);

    // 4. Test delegation tracking with sample addresses
    console.log('\n4. Testing Delegation Entry Tracking...');
    const testUsers = [
      getAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1'), // Random test address
      getAddress('0x1234567890123456789012345678901234567890'), // Another test address
      getAddress(PLATFORM_SAFE), // Platform Safe itself
    ];

    for (const user of testUsers) {
      const hasEntered = await publicClient.readContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_ABI,
        functionName: 'hasEnteredRound',
        args: [round.roundId, user as `0x${string}`],
      });
      console.log(`   ${user}: ${hasEntered ? 'Has entered ✅' : 'Not entered ⭕'}`);
    }

    // 5. Check balances for fee distribution
    console.log('\n5. Platform Balances (for fee verification)...');
    const platformSafeBalance = await publicClient.getBalance({
      address: PLATFORM_SAFE as `0x${string}`,
    });
    const platformWalletBalance = await publicClient.getBalance({
      address: PLATFORM_WALLET as `0x${string}`,
    });

    console.log(`   Platform Safe: ${formatEther(platformSafeBalance)} MON`);
    console.log(`   Platform Wallet: ${formatEther(platformWalletBalance)} MON`);

    // Summary
    console.log('\n========================================');
    console.log('   SUMMARY');
    console.log('========================================');

    const allChecks = [
      { name: 'Platform addresses configured', status: platformSafeMatch && platformWalletMatch },
      { name: 'Round is active', status: isActive },
      { name: 'Contract deployed successfully', status: true },
    ];

    allChecks.forEach(check => {
      console.log(`${check.status ? '✅' : '❌'} ${check.name}`);
    });

    console.log('\n📋 NEXT STEPS:');
    console.log('   1. Test lottery entry through app using Platform Safe delegation');
    console.log('   2. Verify enterWithMonFor works with different beneficiaries');
    console.log('   3. Confirm fee split: 5% Platform Safe + 5% Platform Wallet + 90% Prize Pool');
    console.log('   4. Test round rotation after 24 hours\n');

    return {
      success: allChecks.every(c => c.status),
      round: {
        id: round.roundId,
        status: STATUS_NAMES[round.status],
        isActive,
        participants: Number(round.participantCount),
        prizePool: formatEther(round.prizePoolMon),
      }
    };

  } catch (error) {
    console.error('\n❌ Error testing lottery:', error);
    throw error;
  }
}

testLotteryV2()
  .then((result) => {
    if (result?.success) {
      console.log('✅ All basic checks passed!');
      process.exit(0);
    } else {
      console.log('⚠️  Some checks failed - review output above');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
