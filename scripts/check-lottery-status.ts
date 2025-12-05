/**
 * Check DailyPassLotterySecure contract status
 * Run: npx ts-node scripts/check-lottery-status.ts
 */

import { createPublicClient, http, formatEther, defineChain } from 'viem';

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
    default: { name: 'Monad Explorer', url: 'https://testnet.monadscan.com' },
  },
  testnet: true,
});

const LOTTERY_ADDRESS = '0x9abf78d2d6C1C6C1A58EDF1a6bF8b8E63b25A2CE';

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
      { name: '_currentRoundId', type: 'uint256' },
      { name: '_prizePoolMon', type: 'uint256' },
      { name: '_prizePoolShMon', type: 'uint256' },
      { name: '_participants', type: 'uint256' },
      { name: '_totalPaid', type: 'uint256' },
      { name: '_totalParticipants', type: 'uint256' },
      { name: '_status', type: 'uint8' },
    ]
  }
] as const;

const STATUS_NAMES = ['Active', 'CommitPending', 'RevealPending', 'Finalized'];

async function checkLotteryStatus() {
  console.log('\n========================================');
  console.log('   LOTTERY STATUS CHECK');
  console.log('========================================\n');
  console.log(`Lottery contract: ${LOTTERY_ADDRESS}\n`);

  try {
    // Get current round
    const round = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'getCurrentRound',
    });

    // Get stats
    const stats = await publicClient.readContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_ABI,
      functionName: 'getStats',
    });

    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = Number(round.endTime) - now;

    console.log('Current Round:');
    console.log(`  Round ID: ${round.roundId}`);
    console.log(`  Status: ${STATUS_NAMES[round.status]} (${round.status})`);
    console.log(`  Start time: ${new Date(Number(round.startTime) * 1000).toISOString()}`);
    console.log(`  End time: ${new Date(Number(round.endTime) * 1000).toISOString()}`);
    console.log(`  Time remaining: ${timeRemaining > 0 ? `${Math.floor(timeRemaining / 3600)}h ${Math.floor((timeRemaining % 3600) / 60)}m` : 'ENDED'}`);
    console.log(`  Prize pool (MON): ${formatEther(round.prizePoolMon)} MON`);
    console.log(`  Prize pool (shMON): ${formatEther(round.prizePoolShMon)} shMON`);
    console.log(`  Participants: ${round.participantCount}`);

    if (round.status !== 0) {
      console.log(`\n⚠️  Round is NOT Active!`);
      console.log(`  Current status: ${STATUS_NAMES[round.status]}`);

      if (round.commitBlock > 0n) {
        console.log(`  Commit block: ${round.commitBlock}`);
      }

      if (round.winner !== '0x0000000000000000000000000000000000000000') {
        console.log(`  Winner: ${round.winner}`);
        console.log(`  Winner index: ${round.winnerIndex}`);
      }
    }

    console.log('\nOverall Stats:');
    console.log(`  Total participants (all time): ${stats[5]}`);
    console.log(`  Total prizes paid: ${formatEther(stats[4])} MON`);

    console.log('\n========================================');

    return {
      roundId: round.roundId,
      status: round.status,
      isActive: round.status === 0,
      timeRemaining,
      participants: round.participantCount,
    };

  } catch (error) {
    console.error('Error checking lottery status:', error);
    throw error;
  }
}

checkLotteryStatus()
  .then((result) => {
    if (result.isActive) {
      console.log('\n✅ Lottery is ACTIVE and accepting entries');
    } else {
      console.log(`\n❌ Lottery is NOT active (status: ${STATUS_NAMES[result.status]})`);
    }
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
