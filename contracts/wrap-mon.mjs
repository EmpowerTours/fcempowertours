import { ethers } from "ethers";

async function main() {
  const PRIVATE_KEY = "054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6";
  const WMON_ADDRESS = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";
  const RPC_URL = "https://testnet-rpc.monad.xyz";
  const AMOUNT_TO_WRAP = "1"; // 1 MON

  console.log("🔗 Connecting to Monad Testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("\n📍 Wallet Address:", wallet.address);

  // Check MON balance
  const monBalance = await provider.getBalance(wallet.address);
  console.log("💰 MON Balance:", ethers.formatEther(monBalance), "MON");

  // WMON contract ABI (standard WETH interface)
  const wmonAbi = [
    "function deposit() payable",
    "function withdraw(uint256 amount)",
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
  ];

  const wmonContract = new ethers.Contract(WMON_ADDRESS, wmonAbi, wallet);

  // Check current WMON balance
  const wmonBalanceBefore = await wmonContract.balanceOf(wallet.address);
  console.log("💎 WMON Balance (before):", ethers.formatEther(wmonBalanceBefore), "WMON");

  const amountWei = ethers.parseEther(AMOUNT_TO_WRAP);

  if (monBalance < amountWei) {
    console.error("\n❌ Insufficient MON balance!");
    console.log("Need:", AMOUNT_TO_WRAP, "MON");
    console.log("Have:", ethers.formatEther(monBalance), "MON");
    return;
  }

  console.log("\n🔄 Wrapping", AMOUNT_TO_WRAP, "MON to WMON...");

  try {
    const tx = await wmonContract.deposit({ value: amountWei });
    console.log("✅ Transaction sent!");
    console.log("Hash:", tx.hash);
    console.log("\n⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("\n🎉 Wrap successful!");
    console.log("Block:", receipt?.blockNumber);
    console.log("Gas used:", receipt?.gasUsed.toString());

    // Check final balances
    const monBalanceAfter = await provider.getBalance(wallet.address);
    const wmonBalanceAfter = await wmonContract.balanceOf(wallet.address);

    console.log("\n📊 Final Balances:");
    console.log("💰 MON:", ethers.formatEther(monBalanceAfter), "MON");
    console.log("💎 WMON:", ethers.formatEther(wmonBalanceAfter), "WMON");
    console.log("\n✨ Successfully wrapped", AMOUNT_TO_WRAP, "MON into WMON!");

  } catch (error) {
    console.error("\n❌ Wrap failed:", error.message);

    // Try to get more details
    if (error.data) {
      console.error("Error data:", error.data);
    }
    throw error;
  }
}

main()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error);
    process.exit(1);
  });
