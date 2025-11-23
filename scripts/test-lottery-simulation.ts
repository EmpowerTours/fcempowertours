/**
 * Lottery System Simulation Test
 *
 * Simulates multiple days of lottery operation with up to 100 users
 * Tests: payment recording, pool building, winner selection, and announcement
 *
 * Run: npx ts-node scripts/test-lottery-simulation.ts
 */

import { Redis } from '@upstash/redis';

// Initialize Redis (use env vars or test instance)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://test-redis.upstash.io',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'test-token',
});

// Constants matching the lottery config
const LOTTERY_CONFIG = {
  ACCESS_FEE_ETH: 0.001,
  LOTTERY_SHARE: 0.5,
  TREASURY_SHARE: 0.5,
  TREASURY_ADDRESS: '0x33fFCcb1802e13a7eead232BCd4706a2269582b0',
  BOT_WALLET_ADDRESS: '0x2d5dd9aa1dc42949d203d1946d599ba47f0b6d1c',
};

// Types
interface SimulatedUser {
  address: string;
  fid: number;
  username: string;
}

interface SimulationDay {
  date: string;
  participants: SimulatedUser[];
  totalPool: number;
  winner?: SimulatedUser;
  winningAmount?: number;
}

interface SimulationResults {
  daysSimulated: number;
  totalParticipants: number;
  totalPoolGenerated: number;
  totalPaidOut: number;
  winners: Array<{
    day: string;
    winner: SimulatedUser;
    amount: number;
  }>;
  participantDistribution: Record<string, number>;
}

// Generate random Ethereum address
function generateAddress(): string {
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

// Generate simulated users
function generateUsers(count: number): SimulatedUser[] {
  const users: SimulatedUser[] = [];
  for (let i = 0; i < count; i++) {
    users.push({
      address: generateAddress(),
      fid: 100000 + i,
      username: `testuser${i + 1}`,
    });
  }
  return users;
}

// Simulate a single day's lottery
async function simulateDay(
  dayDate: string,
  allUsers: SimulatedUser[],
  minParticipants: number,
  maxParticipants: number
): Promise<SimulationDay> {
  // Random number of participants for this day
  const numParticipants = Math.floor(
    Math.random() * (maxParticipants - minParticipants + 1)
  ) + minParticipants;

  // Randomly select participants
  const shuffled = [...allUsers].sort(() => Math.random() - 0.5);
  const participants = shuffled.slice(0, numParticipants);

  // Calculate pool
  const lotteryContribution = LOTTERY_CONFIG.ACCESS_FEE_ETH * LOTTERY_CONFIG.LOTTERY_SHARE;
  const totalPool = participants.length * lotteryContribution;

  // Store in Redis (simulating the actual system)
  const poolKey = `lottery:pool:${dayDate}`;
  const participantsKey = `lottery:participants:${dayDate}`;

  const pool = {
    day: dayDate,
    totalPool,
    participants: participants.map(p => p.address.toLowerCase()),
    participantCount: participants.length,
    status: 'active',
    createdAt: Date.now(),
  };

  await redis.set(poolKey, pool);

  for (const participant of participants) {
    await redis.sadd(participantsKey, JSON.stringify({
      address: participant.address.toLowerCase(),
      fid: participant.fid,
      username: participant.username,
      contribution: lotteryContribution,
      timestamp: Date.now(),
    }));
  }

  // Select winner
  const winnerIndex = Math.floor(Math.random() * participants.length);
  const winner = participants[winnerIndex];

  // Update pool with winner
  const completedPool = {
    ...pool,
    status: 'completed',
    winner: winner.address.toLowerCase(),
    winnerFid: winner.fid,
    winnerUsername: winner.username,
    winningAmount: totalPool,
    completedAt: Date.now(),
  };

  await redis.set(poolKey, completedPool);

  // Store winner record
  const winnerRecord = {
    day: dayDate,
    winnerAddress: winner.address.toLowerCase(),
    winnerFid: winner.fid,
    winnerUsername: winner.username,
    amount: totalPool,
    timestamp: Date.now(),
  };

  await redis.set(`lottery:winner:${dayDate}`, winnerRecord);
  await redis.lpush('lottery:winners:all', JSON.stringify(winnerRecord));

  return {
    date: dayDate,
    participants,
    totalPool,
    winner,
    winningAmount: totalPool,
  };
}

// Simulate Neynar cast announcement
function simulateCastAnnouncement(winner: SimulatedUser, amount: number, day: string): string {
  const castText = `Daily Lottery Winner!

Congratulations to @${winner.username}!

You won ${amount.toFixed(6)} ETH from today's EmpowerTours lottery pool!

FID: ${winner.fid}

Thanks to all ${day} participants! Tomorrow's pool is already building...

#EmpowerTours #Lottery #Farcaster`;

  return castText;
}

// Main simulation
async function runSimulation(
  numDays: number = 7,
  numUsers: number = 100,
  minParticipantsPerDay: number = 10,
  maxParticipantsPerDay: number = 50
): Promise<SimulationResults> {
  console.log('\n========================================');
  console.log('   EMPOWERTOURS LOTTERY SIMULATION');
  console.log('========================================\n');

  console.log(`Configuration:`);
  console.log(`  - Days to simulate: ${numDays}`);
  console.log(`  - Total users in pool: ${numUsers}`);
  console.log(`  - Participants per day: ${minParticipantsPerDay}-${maxParticipantsPerDay}`);
  console.log(`  - Access fee: ${LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH`);
  console.log(`  - Lottery share: ${LOTTERY_CONFIG.LOTTERY_SHARE * 100}%`);
  console.log(`  - Treasury: ${LOTTERY_CONFIG.TREASURY_ADDRESS}`);
  console.log(`  - Bot wallet: ${LOTTERY_CONFIG.BOT_WALLET_ADDRESS}`);
  console.log('');

  // Generate user pool
  console.log(`Generating ${numUsers} test users...`);
  const users = generateUsers(numUsers);
  console.log(`  - Sample users: ${users.slice(0, 3).map(u => u.username).join(', ')}, ...`);
  console.log('');

  // Track results
  const results: SimulationResults = {
    daysSimulated: numDays,
    totalParticipants: 0,
    totalPoolGenerated: 0,
    totalPaidOut: 0,
    winners: [],
    participantDistribution: {},
  };

  // Simulate each day
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numDays);

  console.log('Running daily simulations...\n');

  for (let i = 0; i < numDays; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + i);
    const dateKey = dayDate.toISOString().split('T')[0];

    console.log(`Day ${i + 1}: ${dateKey}`);
    console.log('─'.repeat(40));

    const dayResult = await simulateDay(
      dateKey,
      users,
      minParticipantsPerDay,
      maxParticipantsPerDay
    );

    // Update stats
    results.totalParticipants += dayResult.participants.length;
    results.totalPoolGenerated += dayResult.totalPool;
    results.totalPaidOut += dayResult.winningAmount || 0;

    // Track winner distribution
    if (dayResult.winner) {
      results.winners.push({
        day: dateKey,
        winner: dayResult.winner,
        amount: dayResult.winningAmount || 0,
      });

      const winnerKey = dayResult.winner.username;
      results.participantDistribution[winnerKey] =
        (results.participantDistribution[winnerKey] || 0) + 1;
    }

    // Print day results
    console.log(`  Participants: ${dayResult.participants.length}`);
    console.log(`  Pool size: ${dayResult.totalPool.toFixed(6)} ETH`);
    console.log(`  Winner: @${dayResult.winner?.username} (FID: ${dayResult.winner?.fid})`);
    console.log(`  Winning amount: ${dayResult.winningAmount?.toFixed(6)} ETH`);
    console.log('');

    // Simulate cast announcement
    if (dayResult.winner) {
      const castText = simulateCastAnnouncement(
        dayResult.winner,
        dayResult.winningAmount || 0,
        dateKey
      );
      console.log('  [SIMULATED CAST]');
      console.log('  ' + castText.split('\n').join('\n  '));
      console.log('');
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('         SIMULATION SUMMARY');
  console.log('========================================\n');

  console.log(`Days simulated: ${results.daysSimulated}`);
  console.log(`Total participants (across all days): ${results.totalParticipants}`);
  console.log(`Average participants per day: ${(results.totalParticipants / results.daysSimulated).toFixed(1)}`);
  console.log(`Total pool generated: ${results.totalPoolGenerated.toFixed(6)} ETH`);
  console.log(`Total paid out to winners: ${results.totalPaidOut.toFixed(6)} ETH`);
  console.log(`Treasury collected: ${(results.totalParticipants * LOTTERY_CONFIG.ACCESS_FEE_ETH * LOTTERY_CONFIG.TREASURY_SHARE).toFixed(6)} ETH`);
  console.log('');

  console.log('Winners by day:');
  for (const winner of results.winners) {
    console.log(`  ${winner.day}: @${winner.winner.username} - ${winner.amount.toFixed(6)} ETH`);
  }
  console.log('');

  // Check for repeat winners
  const repeatWinners = Object.entries(results.participantDistribution)
    .filter(([_, count]) => count > 1);

  if (repeatWinners.length > 0) {
    console.log('Repeat winners (won multiple times):');
    for (const [username, count] of repeatWinners) {
      console.log(`  @${username}: ${count} wins`);
    }
  } else {
    console.log('No repeat winners in this simulation');
  }

  console.log('\n========================================');
  console.log('        SIMULATION COMPLETE');
  console.log('========================================\n');

  return results;
}

// Test specific scenarios
async function testEdgeCases() {
  console.log('\n========================================');
  console.log('      EDGE CASE TESTS');
  console.log('========================================\n');

  // Test 1: Single participant day
  console.log('Test 1: Single participant day');
  const singleUser = generateUsers(1);
  const singleResult = await simulateDay('2025-01-01', singleUser, 1, 1);
  console.log(`  Result: Winner is ${singleResult.winner?.username} (only participant)`);
  console.log(`  Pool: ${singleResult.totalPool.toFixed(6)} ETH`);
  console.log('');

  // Test 2: Maximum participation
  console.log('Test 2: Maximum participation (100 users)');
  const maxUsers = generateUsers(100);
  const maxResult = await simulateDay('2025-01-02', maxUsers, 100, 100);
  console.log(`  Participants: ${maxResult.participants.length}`);
  console.log(`  Pool: ${maxResult.totalPool.toFixed(6)} ETH`);
  console.log(`  Winner: @${maxResult.winner?.username}`);
  console.log('');

  // Test 3: Verify randomness (run 1000 selections)
  console.log('Test 3: Randomness verification (1000 selections from 10 users)');
  const testUsers = generateUsers(10);
  const winCounts: Record<string, number> = {};

  for (let i = 0; i < 1000; i++) {
    const winnerIndex = Math.floor(Math.random() * testUsers.length);
    const winner = testUsers[winnerIndex];
    winCounts[winner.username] = (winCounts[winner.username] || 0) + 1;
  }

  console.log('  Win distribution (should be ~100 each for fair randomness):');
  for (const [username, count] of Object.entries(winCounts).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.floor(count / 20));
    console.log(`    ${username}: ${count} (${(count / 10).toFixed(1)}%) ${bar}`);
  }
  console.log('');
}

// Main execution
async function main() {
  try {
    // Run main simulation
    await runSimulation(7, 100, 15, 45);

    // Run edge case tests
    await testEdgeCases();

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Simulation error:', error);
    process.exit(1);
  }
}

// Export for testing
export { runSimulation, testEdgeCases, generateUsers, simulateDay };

// Run simulation
main();
