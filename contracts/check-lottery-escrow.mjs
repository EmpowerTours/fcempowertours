import { ethers } from "ethers";

async function main() {
  const LOTTERY_CONTRACT = "0x89345c2b05446F278b7e5746814feF368D764403";
  const RPC_URL = "https://testnet-rpc.monad.xyz";

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log("\n🎰 Checking Lottery Escrow Details...");
  console.log("Contract:", LOTTERY_CONTRACT);

  const lotteryAbi = [
    "function currentRoundId() view returns (uint256)",
    "function getEscrow(uint256 roundId) view returns (tuple(uint256 roundId, address winner, uint256 monAmount, uint256 shMonAmount, uint256 createdAt, uint256 expiresAt, bool claimed))",
    "function getRound(uint256 roundId) view returns (tuple(uint256 roundId, uint256 startTime, uint256 endTime, uint256 prizePoolMon, uint256 prizePoolShMon, uint256 participantCount, uint8 status, uint256 commitBlock, bytes32 commitHash, address winner, uint256 winnerIndex))",
  ];

  const lottery = new ethers.Contract(LOTTERY_CONTRACT, lotteryAbi, provider);

  // Get current round
  const currentRoundId = await lottery.currentRoundId();
  console.log("\n📊 Current Round ID:", currentRoundId.toString());

  // Check last few rounds for escrows
  console.log("\n💰 Checking recent escrows:");
  for (let i = currentRoundId; i >= 1 && i > currentRoundId - 5n; i--) {
    try {
      const escrow = await lottery.getEscrow(i);
      const round = await lottery.getRound(i);

      console.log(`\n--- Round ${i} ---`);
      console.log("Winner:", escrow.winner);
      console.log("MON Prize:", ethers.formatEther(escrow.monAmount), "MON");
      console.log("shMON Prize:", ethers.formatEther(escrow.shMonAmount), "shMON");
      console.log("Claimed:", escrow.claimed);
      console.log("Expires:", new Date(Number(escrow.expiresAt) * 1000).toISOString());
      console.log("Round Status:", ["Active", "CommitPending", "RevealPending", "Finalized"][round.status]);
      console.log("Participants:", round.participantCount.toString());

      if (!escrow.claimed && escrow.monAmount > 0) {
        console.log("⚠️  UNCLAIMED PRIZE!");
      }
    } catch (error) {
      // Skip rounds without escrows
    }
  }

  // Check contract balance
  const balance = await provider.getBalance(LOTTERY_CONTRACT);
  console.log("\n\n💼 Contract Balance:", ethers.formatEther(balance), "MON");

  console.log("\n🔍 If 'MON failed' error occurs, possible causes:");
  console.log("1. Winner is a Safe contract that cannot receive raw MON transfers");
  console.log("2. Escrow amount exceeds actual contract balance");
  console.log("3. Winner contract has no receive() function");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
