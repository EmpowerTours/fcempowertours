import { ethers } from "ethers";

async function main() {
  const LOTTERY_CONTRACT = "0x89345c2b05446F278b7e5746814feF368D764403";
  const RPC_URL = "https://testnet-rpc.monad.xyz";

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const lotteryAbi = [
    "function getEscrow(uint256 roundId) view returns (tuple(uint256 roundId, address winner, uint256 monAmount, uint256 shMonAmount, uint256 createdAt, uint256 expiresAt, bool claimed))",
    "function claimPrize(uint256 roundId)",
  ];

  const lottery = new ethers.Contract(LOTTERY_CONTRACT, lotteryAbi, provider);

  // Check escrow for round 1
  console.log("\n📊 Checking Round 1 Escrow:");
  const escrow = await lottery.getEscrow(1);

  console.log("Winner:", escrow.winner);
  console.log("MON Prize:", ethers.formatEther(escrow.monAmount), "MON");
  console.log("shMON Prize:", ethers.formatEther(escrow.shMonAmount), "shMON");
  console.log("Claimed:", escrow.claimed);
  console.log("Expires:", new Date(Number(escrow.expiresAt) * 1000).toISOString());

  if (escrow.claimed) {
    console.log("\n✅ Prize already claimed!");
    return;
  }

  // Check contract balance
  const contractBalance = await provider.getBalance(LOTTERY_CONTRACT);
  console.log("\n💰 Contract Balance:", ethers.formatEther(contractBalance), "MON");

  if (contractBalance < escrow.monAmount) {
    console.log("\n⚠️  WARNING: Contract doesn't have enough MON!");
    console.log("Needs:", ethers.formatEther(escrow.monAmount), "MON");
    console.log("Has:", ethers.formatEther(contractBalance), "MON");
    console.log("Shortfall:", ethers.formatEther(escrow.monAmount - contractBalance), "MON");
    return;
  }

  console.log("\n✅ Contract has sufficient balance to pay winner");
  console.log("\n🎯 Winner can now call claimPrize(1) to claim their", ethers.formatEther(escrow.monAmount), "MON prize");
  console.log("\nTo claim, the winner needs to call:");
  console.log(`lottery.claimPrize(1) from address ${escrow.winner}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
