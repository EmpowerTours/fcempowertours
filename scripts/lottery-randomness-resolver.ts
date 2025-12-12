/**
 * Off-chain randomness resolver for DailyPassLotteryV4
 *
 * Listens for RandomnessRequested events and resolves them using Switchboard Crossbar
 *
 * Usage:
 *   npx tsx scripts/lottery-randomness-resolver.ts
 */

import { ethers } from 'ethers';
import { CrossbarClient } from '@switchboard-xyz/common';

// Network configuration
const MONAD_TESTNET = {
  chainId: 10143,
  rpcUrl: process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  lottery: process.env.NEXT_PUBLIC_LOTTERY_ADDRESS || '',
  blockExplorer: 'https://testnet.monadexplorer.com',
};

// Lottery ABI (just the functions we need)
const LOTTERY_ABI = [
  'event RandomnessRequested(uint256 indexed roundId, bytes32 indexed randomnessId, address indexed caller, uint256 reward)',
  'function getRound(uint256 roundId) view returns (tuple(uint256 roundId, uint256 startTime, uint256 endTime, uint256 prizePoolMon, uint256 prizePoolShMon, uint256 participantCount, uint8 status, bytes32 randomnessId, uint256 randomValue, uint256 randomnessRequestedAt, address winner, uint256 winnerIndex, uint256 callerRewardsPaid))',
  'function resolveRandomness(uint256 roundId, bytes calldata encodedRandomness) external',
  'function canResolveRandomness(uint256 roundId) view returns (bool)',
];

async function main() {
  console.log('🎰 Lottery Randomness Resolver Starting...\n');

  if (!MONAD_TESTNET.lottery) {
    throw new Error('NEXT_PUBLIC_LOTTERY_ADDRESS not set');
  }

  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider(MONAD_TESTNET.rpcUrl);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const lottery = new ethers.Contract(MONAD_TESTNET.lottery, LOTTERY_ABI, wallet);

  console.log('📍 Network: Monad Testnet');
  console.log('🎰 Lottery:', MONAD_TESTNET.lottery);
  console.log('👤 Resolver:', wallet.address);
  console.log('💰 Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'MON\n');

  // Initialize Crossbar client
  const crossbar = new CrossbarClient('https://crossbar.switchboard.xyz');

  // Listen for RandomnessRequested events
  console.log('👂 Listening for RandomnessRequested events...\n');

  lottery.on('RandomnessRequested', async (roundId, randomnessId, caller, reward, event) => {
    console.log(`\n🎲 Randomness Requested!`);
    console.log(`   Round ID: ${roundId}`);
    console.log(`   Randomness ID: ${randomnessId}`);
    console.log(`   Requested by: ${caller}`);
    console.log(`   Caller reward: ${ethers.formatEther(reward)} MON`);

    try {
      // Get round data
      const round = await lottery.getRound(roundId);
      console.log(`   Participants: ${round.participantCount}`);
      console.log(`   Prize Pool: ${ethers.formatEther(round.prizePoolMon)} MON`);

      // Wait for settlement delay + buffer
      const settlementTime = Number(round.randomnessRequestedAt) + 5; // 5 second delay
      const now = Math.floor(Date.now() / 1000);
      const waitTime = Math.max(0, settlementTime - now + 10); // +10s buffer for clock skew

      if (waitTime > 0) {
        console.log(`\n⏳ Waiting ${waitTime} seconds for settlement delay...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      }

      // Check if ready
      const canResolve = await lottery.canResolveRandomness(roundId);
      if (!canResolve) {
        console.log(`⚠️  Randomness not ready yet, will retry...`);
        // Retry after a delay
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      // Fetch randomness reveal from Crossbar
      console.log(`\n📡 Fetching randomness from Crossbar...`);

      const { encoded: encodedRandomness, response: crossbarResponse } = await crossbar.resolveEVMRandomness({
        chainId: MONAD_TESTNET.chainId,
        randomnessId,
        timestamp: Number(round.randomnessRequestedAt),
        minStalenessSeconds: 5,
        oracle: '0x0000000000000000000000000000000000000000', // Will be filled by Crossbar
      });

      console.log(`✅ Randomness received from Crossbar`);
      console.log(`   Preview value: ${crossbarResponse.value}`);
      console.log(`   Winner index will be: ${BigInt(crossbarResponse.value) % BigInt(round.participantCount)}`);

      // Resolve randomness on-chain
      console.log(`\n📤 Resolving randomness on-chain...`);

      const tx = await lottery.resolveRandomness(roundId, encodedRandomness);
      console.log(`   TX submitted: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`✅ Randomness resolved in block ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed}`);
      console.log(`   TX: ${MONAD_TESTNET.blockExplorer}/tx/${tx.hash}`);

      // Get final round data
      const finalRound = await lottery.getRound(roundId);
      console.log(`\n🏆 Winner Selected!`);
      console.log(`   Winner: ${finalRound.winner}`);
      console.log(`   Winner index: ${finalRound.winnerIndex}`);
      console.log(`   Random value: ${finalRound.randomValue}`);
      console.log(`   Caller reward earned: 0.01 MON`);

    } catch (error: any) {
      console.error(`\n❌ Error resolving randomness for round ${roundId}:`, error.message);
      if (error.data) {
        console.error(`   Error data:`, error.data);
      }
    }
  });

  // Check for any pending rounds that need resolution
  console.log('🔍 Checking for pending rounds...\n');

  try {
    const currentRound = await lottery.getCurrentRound();
    const currentRoundId = Number(currentRound.roundId);

    // Check last 5 rounds
    for (let i = Math.max(1, currentRoundId - 5); i <= currentRoundId; i++) {
      const canResolve = await lottery.canResolveRandomness(i);

      if (canResolve) {
        console.log(`\n⚡ Found pending round ${i}, resolving...`);

        const round = await lottery.getRound(i);

        // Fetch and resolve
        const { encoded: encodedRandomness } = await crossbar.resolveEVMRandomness({
          chainId: MONAD_TESTNET.chainId,
          randomnessId: round.randomnessId,
          timestamp: Number(round.randomnessRequestedAt),
          minStalenessSeconds: 5,
          oracle: '0x0000000000000000000000000000000000000000',
        });

        const tx = await lottery.resolveRandomness(i, encodedRandomness);
        await tx.wait();

        console.log(`✅ Resolved pending round ${i}: ${MONAD_TESTNET.blockExplorer}/tx/${tx.hash}`);
      }
    }
  } catch (error) {
    console.log('No pending rounds found');
  }

  console.log('\n✅ Randomness resolver is running...');
  console.log('💡 Press Ctrl+C to stop\n');

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down randomness resolver...');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
