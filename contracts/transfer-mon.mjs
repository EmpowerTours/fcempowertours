import { ethers } from "ethers";

async function main() {
  const TREASURY_PRIVATE_KEY = "a1915c7fe2290e098a897faedcd20afff7110433b1b8cf7bebc311a7d0b21979";
  const RECIPIENT_ADDRESS = "0xe67e13d545c76c2b4e28dfe27ad827e1fc18e8d9";
  const RPC_URL = "https://testnet-rpc.monad.xyz";

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const treasuryWallet = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);

  console.log("\n📍 Addresses:");
  console.log("Treasury:", treasuryWallet.address);
  console.log("Recipient:", RECIPIENT_ADDRESS);

  // Check current balance
  console.log("\n💰 Checking balance...");
  const balance = await provider.getBalance(treasuryWallet.address);
  console.log("Treasury Balance:", ethers.formatEther(balance), "MON");

  if (balance === 0n) {
    console.error("❌ Treasury has 0 balance!");
    return;
  }

  // Reserve 0.1 MON for gas
  const gasReserve = ethers.parseEther("0.1");
  const amountToSend = balance - gasReserve;

  if (amountToSend <= 0n) {
    console.error("❌ Insufficient balance to cover gas fees!");
    console.log("Need at least 0.1 MON for gas, but have:", ethers.formatEther(balance), "MON");
    return;
  }

  console.log("\n📤 Transfer Details:");
  console.log("Amount to send:", ethers.formatEther(amountToSend), "MON");
  console.log("Gas reserve:", ethers.formatEther(gasReserve), "MON");

  // Send transaction
  console.log("\n🚀 Sending transaction...");
  try {
    const tx = await treasuryWallet.sendTransaction({
      to: RECIPIENT_ADDRESS,
      value: amountToSend,
      gasLimit: 21000n,
    });

    console.log("✅ Transaction sent!");
    console.log("Hash:", tx.hash);
    console.log("\n⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("\n🎉 Transaction confirmed!");
    console.log("Block:", receipt?.blockNumber);
    console.log("Gas used:", receipt?.gasUsed.toString());

    // Check final balances
    const finalTreasuryBalance = await provider.getBalance(treasuryWallet.address);
    const recipientBalance = await provider.getBalance(RECIPIENT_ADDRESS);

    console.log("\n📊 Final Balances:");
    console.log("Treasury:", ethers.formatEther(finalTreasuryBalance), "MON");
    console.log("Recipient:", ethers.formatEther(recipientBalance), "MON");

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
