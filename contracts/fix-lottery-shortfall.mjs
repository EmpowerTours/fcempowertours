import { ethers } from "ethers";

async function main() {
  const WALLET_PRIVATE_KEY = "054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6";
  const LOTTERY_CONTRACT = "0x89345c2b05446F278b7e5746814feF368D764403";
  const RPC_URL = "https://testnet-rpc.monad.xyz";

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

  console.log("\n📍 Addresses:");
  console.log("Wallet:", wallet.address);
  console.log("Lottery Contract:", LOTTERY_CONTRACT);

  // Check current balances
  console.log("\n💰 Current Balances:");
  const walletBalance = await provider.getBalance(wallet.address);
  const lotteryBalance = await provider.getBalance(LOTTERY_CONTRACT);

  console.log("Wallet:", ethers.formatEther(walletBalance), "MON");
  console.log("Lottery:", ethers.formatEther(lotteryBalance), "MON");

  // Amount needed to fix shortfall
  const shortfall = ethers.parseEther("0.02"); // 0.02 MON to cover caller rewards

  if (walletBalance < shortfall) {
    console.error("\n❌ Wallet has insufficient balance!");
    console.log("Need:", ethers.formatEther(shortfall), "MON");
    console.log("Have:", ethers.formatEther(walletBalance), "MON");
    return;
  }

  console.log("\n📤 Transfer Details:");
  console.log("Amount:", ethers.formatEther(shortfall), "MON");
  console.log("Purpose: Cover caller reward shortfall (2 x 0.01 MON)");
  console.log("\nThis will allow the winner to claim their 1.8 MON prize");

  // Send transaction
  console.log("\n🚀 Sending transaction...");
  try {
    const tx = await wallet.sendTransaction({
      to: LOTTERY_CONTRACT,
      value: shortfall,
      gasLimit: 21000n,
    });

    console.log("✅ Transaction sent!");
    console.log("Hash:", tx.hash);
    console.log("\n⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("\n🎉 Transaction confirmed!");
    console.log("Block:", receipt?.blockNumber);

    // Check final balances
    const finalWalletBalance = await provider.getBalance(wallet.address);
    const finalLotteryBalance = await provider.getBalance(LOTTERY_CONTRACT);

    console.log("\n📊 Final Balances:");
    console.log("Wallet:", ethers.formatEther(finalWalletBalance), "MON");
    console.log("Lottery:", ethers.formatEther(finalLotteryBalance), "MON");

    if (finalLotteryBalance >= ethers.parseEther("1.8")) {
      console.log("\n✅ Lottery now has enough MON to pay the winner!");
    } else {
      console.log("\n⚠️  Lottery still short:", ethers.formatEther(ethers.parseEther("1.8") - finalLotteryBalance), "MON");
    }

  } catch (error) {
    console.error("\n❌ Transaction failed:", error.message);
    throw error;
  }
}

main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error);
    process.exit(1);
  });
