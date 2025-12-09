import { ethers } from "ethers";

async function main() {
  const OWNER_PRIVATE_KEY = "054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6";
  const LOTTERY_CONTRACT = "0x89345c2b05446F278b7e5746814feF368D764403";
  const RPC_URL = "https://testnet-rpc.monad.xyz";

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);

  console.log("\n📍 Owner:", owner.address);

  const lotteryAbi = [
    "function currentRoundId() view returns (uint256)",
    "function getRound(uint256 roundId) view returns (tuple(uint256 roundId, uint256 startTime, uint256 endTime, uint256 prizePoolMon, uint256 prizePoolShMon, uint256 participantCount, uint8 status, uint256 commitBlock, bytes32 commitHash, address winner, uint256 winnerIndex))",
    "function forceNewRound()",
  ];

  const lottery = new ethers.Contract(LOTTERY_CONTRACT, lotteryAbi, owner);

  // Check current round
  const currentRoundId = await lottery.currentRoundId();
  console.log("\n📊 Current Round ID:", currentRoundId.toString());

  const currentRound = await lottery.getRound(currentRoundId);
  const statusNum = Number(currentRound.status);
  console.log("Current Round Status:", ["Active", "CommitPending", "RevealPending", "Finalized"][statusNum]);
  console.log("Status Number:", statusNum);
  console.log("Participants:", currentRound.participantCount.toString());

  if (statusNum !== 3) { // Not Finalized
    console.log("\n⚠️  Current round is not finalized yet");
    console.log("Status:", ["Active", "CommitPending", "RevealPending", "Finalized"][currentRound.status]);
    return;
  }

  console.log("\n✅ Round is finalized, starting new round...");

  const tx = await lottery.forceNewRound();
  console.log("Transaction sent:", tx.hash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("🎉 Transaction confirmed!");
  console.log("Block:", receipt?.blockNumber);

  // Check new round
  const newRoundId = await lottery.currentRoundId();
  const newRound = await lottery.getRound(newRoundId);

  console.log("\n🎰 New Round Started!");
  console.log("Round ID:", newRoundId.toString());
  console.log("Status:", ["Active", "CommitPending", "RevealPending", "Finalized"][newRound.status]);
  console.log("Start Time:", new Date(Number(newRound.startTime) * 1000).toISOString());
  console.log("End Time:", new Date(Number(newRound.endTime) * 1000).toISOString());
}

main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error.message);
    process.exit(1);
  });
