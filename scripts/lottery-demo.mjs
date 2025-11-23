/**
 * Lottery System Demo - Standalone simulation
 * Run: node scripts/lottery-demo.mjs
 */

// Configuration
const LOTTERY_CONFIG = {
  ACCESS_FEE_ETH: 0.001,
  LOTTERY_SHARE: 0.5,
  TREASURY_SHARE: 0.5,
  TREASURY_ADDRESS: '0x33fFCcb1802e13a7eead232BCd4706a2269582b0',
  BOT_WALLET_ADDRESS: '0x2d5dd9aa1dc42949d203d1946d599ba47f0b6d1c',
};

// In-memory storage for simulation
const storage = {
  pools: {},
  winners: [],
};

// Generate random Ethereum address
function generateAddress() {
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

// Generate simulated users
function generateUsers(count) {
  const users = [];
  for (let i = 0; i < count; i++) {
    users.push({
      address: generateAddress(),
      fid: 100000 + i,
      username: `user${i + 1}`,
    });
  }
  return users;
}

// Simulate a day's lottery
function simulateDay(dayDate, allUsers, minParticipants, maxParticipants) {
  const numParticipants = Math.floor(
    Math.random() * (maxParticipants - minParticipants + 1)
  ) + minParticipants;

  const shuffled = [...allUsers].sort(() => Math.random() - 0.5);
  const participants = shuffled.slice(0, numParticipants);

  const lotteryContribution = LOTTERY_CONFIG.ACCESS_FEE_ETH * LOTTERY_CONFIG.LOTTERY_SHARE;
  const totalPool = participants.length * lotteryContribution;

  // Select random winner
  const winnerIndex = Math.floor(Math.random() * participants.length);
  const winner = participants[winnerIndex];

  // Store results
  storage.pools[dayDate] = {
    day: dayDate,
    totalPool,
    participantCount: participants.length,
    winner: winner.address,
    winnerUsername: winner.username,
    winnerFid: winner.fid,
  };

  storage.winners.push({
    day: dayDate,
    winner,
    amount: totalPool,
  });

  return { participants, totalPool, winner, winningAmount: totalPool };
}

// Generate cast announcement text
function generateCastText(winner, amount, day, participantCount) {
  return `🎉 Daily Lottery Winner!

Congratulations to @${winner.username}!

💰 You won ${amount.toFixed(6)} ETH from the EmpowerTours lottery pool!

📊 Stats for ${day}:
• Participants: ${participantCount}
• Pool size: ${amount.toFixed(6)} ETH

🎰 FID: ${winner.fid}

Thanks to all participants! Tomorrow's pool is building...

#EmpowerTours #Lottery #Farcaster`;
}

// Main simulation
function runSimulation(numDays = 7, numUsers = 100, minPart = 15, maxPart = 45) {
  console.log('\n' + '='.repeat(50));
  console.log('   EMPOWERTOURS DAILY LOTTERY SIMULATION');
  console.log('='.repeat(50) + '\n');

  console.log('📋 Configuration:');
  console.log(`   • Days to simulate: ${numDays}`);
  console.log(`   • User pool size: ${numUsers}`);
  console.log(`   • Participants/day: ${minPart}-${maxPart}`);
  console.log(`   • Access fee: ${LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH`);
  console.log(`   • Lottery share: ${LOTTERY_CONFIG.LOTTERY_SHARE * 100}%`);
  console.log(`   • Treasury: ${LOTTERY_CONFIG.TREASURY_ADDRESS.slice(0, 10)}...`);
  console.log(`   • Bot wallet: ${LOTTERY_CONFIG.BOT_WALLET_ADDRESS.slice(0, 10)}...`);
  console.log('');

  // Generate users
  console.log(`👥 Generating ${numUsers} test users...`);
  const users = generateUsers(numUsers);
  console.log('');

  // Track totals
  let totalParticipants = 0;
  let totalPool = 0;

  // Simulate each day
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numDays);

  console.log('📅 DAILY LOTTERY RESULTS\n');

  for (let i = 0; i < numDays; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + i);
    const dateKey = dayDate.toISOString().split('T')[0];

    const result = simulateDay(dateKey, users, minPart, maxPart);
    totalParticipants += result.participants.length;
    totalPool += result.totalPool;

    console.log(`📆 ${dateKey}`);
    console.log('─'.repeat(40));
    console.log(`   👥 Participants: ${result.participants.length}`);
    console.log(`   💰 Pool: ${result.totalPool.toFixed(6)} ETH`);
    console.log(`   🏆 Winner: @${result.winner.username} (FID: ${result.winner.fid})`);
    console.log(`   💵 Winnings: ${result.winningAmount.toFixed(6)} ETH`);
    console.log('');

    // Show simulated cast
    console.log('   📢 [SIMULATED NEYNAR CAST]');
    const castText = generateCastText(
      result.winner,
      result.winningAmount,
      dateKey,
      result.participants.length
    );
    castText.split('\n').forEach(line => console.log('   │ ' + line));
    console.log('');
  }

  // Summary
  const treasuryTotal = totalParticipants * LOTTERY_CONFIG.ACCESS_FEE_ETH * LOTTERY_CONFIG.TREASURY_SHARE;

  console.log('='.repeat(50));
  console.log('               📊 SIMULATION SUMMARY');
  console.log('='.repeat(50) + '\n');

  console.log(`   Days simulated:      ${numDays}`);
  console.log(`   Total entries:       ${totalParticipants}`);
  console.log(`   Avg entries/day:     ${(totalParticipants / numDays).toFixed(1)}`);
  console.log(`   Total pool:          ${totalPool.toFixed(6)} ETH`);
  console.log(`   Paid to winners:     ${totalPool.toFixed(6)} ETH`);
  console.log(`   Treasury collected:  ${treasuryTotal.toFixed(6)} ETH`);
  console.log('');

  // List all winners
  console.log('🏆 ALL WINNERS:');
  console.log('─'.repeat(50));
  storage.winners.forEach(w => {
    console.log(`   ${w.day}: @${w.winner.username} won ${w.amount.toFixed(6)} ETH`);
  });
  console.log('');

  // Check for repeat winners
  const winCounts = {};
  storage.winners.forEach(w => {
    winCounts[w.winner.username] = (winCounts[w.winner.username] || 0) + 1;
  });

  const repeats = Object.entries(winCounts).filter(([_, count]) => count > 1);
  if (repeats.length > 0) {
    console.log('🎯 REPEAT WINNERS:');
    repeats.forEach(([name, count]) => {
      console.log(`   @${name}: ${count} wins`);
    });
  } else {
    console.log('ℹ️  No repeat winners in this simulation');
  }

  console.log('\n' + '='.repeat(50));
  console.log('           ✅ SIMULATION COMPLETE');
  console.log('='.repeat(50) + '\n');

  return {
    totalParticipants,
    totalPool,
    treasuryTotal,
    winners: storage.winners,
  };
}

// Test randomness
function testRandomness() {
  console.log('\n' + '='.repeat(50));
  console.log('           🎲 RANDOMNESS TEST');
  console.log('='.repeat(50) + '\n');

  const testUsers = generateUsers(10);
  const winCounts = {};

  console.log('Running 1000 lottery drawings with 10 participants...\n');

  for (let i = 0; i < 1000; i++) {
    const winnerIndex = Math.floor(Math.random() * testUsers.length);
    const winner = testUsers[winnerIndex];
    winCounts[winner.username] = (winCounts[winner.username] || 0) + 1;
  }

  console.log('Win distribution (expected ~100 each for fair randomness):');
  console.log('─'.repeat(50));

  Object.entries(winCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      const pct = (count / 10).toFixed(1);
      const bar = '█'.repeat(Math.floor(count / 25));
      console.log(`   ${name.padEnd(10)} ${String(count).padStart(4)} (${pct}%) ${bar}`);
    });

  console.log('\n✅ Randomness test complete\n');
}

// Run
console.log('\n🚀 Starting EmpowerTours Lottery Simulation...\n');
runSimulation(7, 100, 20, 50);
testRandomness();
