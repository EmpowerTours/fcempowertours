import { ethers } from "hardhat";

async function main() {
  const TREASURY_PRIVATE_KEY = "0xa1915c7fe2290e098a897faedcd20afff7110433b1b8cf7bebc311a7d0b21979";
  const RECIPIENT_ADDRESS = "0xe67e13d545c76c2b4e28dfe27ad827e1fc18e8d9";

  // Connect to Monad testnet
  const provider = new ethers.JsonRpcProvider("https://testnet.monad.xyz");
  const treasuryWallet = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);

  console.log("Treasury Address:", treasuryWallet.address);
  console.log("Recipient Address:", RECIPIENT_ADDRESS);

  // Check current balance
  const balance = await provider.getBalance(treasuryWallet.address);
  console.log("\nTreasury Balance:", ethers.formatEther(balance), "MON");

  // Get gas price and estimate gas
  const feeData = await provider.getFeeData();
  console.log("\nGas Price:", ethers.formatUnits(feeData.gasPrice || 0n, "gwei"), "gwei");

  // Reserve some MON for gas (0.1 MON should be more than enough)
  const gasReserve = ethers.parseEther("0.1");
  const amountToSend = balance - gasReserve;

  if (amountToSend <= 0n) {
    console.error("\nInsufficient balance to cover gas fees!");
    return;
  }

  console.log("\nAmount to send:", ethers.formatEther(amountToSend), "MON");
  console.log("Gas reserve:", ethers.formatEther(gasReserve), "MON");

  // Send transaction
  console.log("\nSending transaction...");
  const tx = await treasuryWallet.sendTransaction({
    to: RECIPIENT_ADDRESS,
    value: amountToSend,
    gasLimit: 21000n, // Standard ETH transfer
  });

  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("\n✅ Transaction confirmed!");
  console.log("Block number:", receipt?.blockNumber);
  console.log("Gas used:", receipt?.gasUsed.toString());

  // Check final balances
  const finalTreasuryBalance = await provider.getBalance(treasuryWallet.address);
  const recipientBalance = await provider.getBalance(RECIPIENT_ADDRESS);

  console.log("\n📊 Final Balances:");
  console.log("Treasury:", ethers.formatEther(finalTreasuryBalance), "MON");
  console.log("Recipient:", ethers.formatEther(recipientBalance), "MON");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
