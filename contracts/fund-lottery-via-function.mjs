import { ethers } from "ethers";

async function main() {
  const WALLET_PRIVATE_KEY = "054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6";
  const LOTTERY_CONTRACT = "0x89345c2b05446F278b7e5746814feF368D764403";
  const RPC_URL = "https://testnet-rpc.monad.xyz";

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

  console.log("\n📍 Wallet:", wallet.address);

  const lotteryAbi = [
    "function owner() view returns (address)",
    "function fundRewards() payable",
  ];

  const lottery = new ethers.Contract(LOTTERY_CONTRACT, lotteryAbi, wallet);

  // Check owner
  const owner = await lottery.owner();
  console.log("Lottery Owner:", owner);
  console.log("Our Wallet:", wallet.address);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log("\n⚠️  We are not the owner! Cannot call fundRewards()");
    console.log("Trying direct transfer with higher gas limit instead...");

    const shortfall = ethers.parseEther("0.02");
    const tx = await wallet.sendTransaction({
      to: LOTTERY_CONTRACT,
      value: shortfall,
      gasLimit: 100000n, // Higher gas limit
    });

    console.log("✅ Transaction sent:", tx.hash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("🎉 Transaction confirmed!");
    console.log("Block:", receipt?.blockNumber);

    const finalLotteryBalance = await provider.getBalance(LOTTERY_CONTRACT);
    console.log("\n💰 Lottery Balance:", ethers.formatEther(finalLotteryBalance), "MON");

  } else {
    console.log("\n✅ We are the owner! Using fundRewards() function...");

    const shortfall = ethers.parseEther("0.02");
    const tx = await lottery.fundRewards({ value: shortfall });

    console.log("✅ Transaction sent:", tx.hash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("🎉 Transaction confirmed!");
    console.log("Block:", receipt?.blockNumber);

    const finalLotteryBalance = await provider.getBalance(LOTTERY_CONTRACT);
    console.log("\n💰 Lottery Balance:", ethers.formatEther(finalLotteryBalance), "MON");
  }
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
