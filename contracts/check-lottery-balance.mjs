import { ethers } from "ethers";

async function main() {
  const LOTTERY_CONTRACT = "0x89345c2b05446F278b7e5746814feF368D764403";
  const RPC_URL = "https://testnet-rpc.monad.xyz";

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log("\n🎰 Checking Lottery Contract Balance...");
  console.log("Contract:", LOTTERY_CONTRACT);

  const balance = await provider.getBalance(LOTTERY_CONTRACT);
  console.log("\n💰 Balance:", ethers.formatEther(balance), "MON");

  if (balance === 0n) {
    console.log("\n⚠️  WARNING: Lottery contract has 0 MON!");
    console.log("This means either:");
    console.log("1. Entry fees were not sent to the contract");
    console.log("2. The contract transferred MON elsewhere");
    console.log("3. Entries were made with a different token (WMON/SHMON?)");
  } else {
    console.log("\n✅ Contract has MON - should be able to pay winners");
  }

  // Also check what the lottery is configured to use
  const lotteryAbi = [
    "function entryFeeMon() view returns (uint256)",
    "function entryFeeShMon() view returns (uint256)",
    "function monToken() view returns (address)",
    "function shMonToken() view returns (address)",
  ];

  try {
    const lottery = new ethers.Contract(LOTTERY_CONTRACT, lotteryAbi, provider);

    console.log("\n📋 Lottery Configuration:");
    const monFee = await lottery.entryFeeMon();
    const shMonFee = await lottery.entryFeeShMon();

    console.log("Entry Fee (MON):", ethers.formatEther(monFee), "MON");
    console.log("Entry Fee (SHMON):", ethers.formatEther(shMonFee), "SHMON");

    const monToken = await lottery.monToken();
    const shMonToken = await lottery.shMonToken();

    console.log("\nToken Addresses:");
    console.log("MON Token:", monToken);
    console.log("SHMON Token:", shMonToken);

  } catch (error) {
    console.log("\n⚠️  Could not read lottery config:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
