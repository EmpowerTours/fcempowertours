import { ethers } from "hardhat";

/**
 * Whitelist Passport NFT in YieldStrategy V5
 *
 * Prerequisites:
 * 1. YieldStrategy V5 must be deployed
 * 2. Set NEXT_PUBLIC_YIELD_STRATEGY in .env
 * 3. Deployer must be the contract owner
 */

async function main() {
  console.log("🔧 Whitelisting Passport NFT in YieldStrategy V5\n");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const YIELD_STRATEGY = process.env.NEXT_PUBLIC_YIELD_STRATEGY;
  const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT || "0x54e935c5f1ec987bb87f36fc046cf13fb393acc8";

  if (!YIELD_STRATEGY) {
    console.error("❌ NEXT_PUBLIC_YIELD_STRATEGY not set in .env");
    process.exit(1);
  }

  console.log("📍 YieldStrategy:", YIELD_STRATEGY);
  console.log("🎫 Passport NFT:", PASSPORT_NFT);
  console.log("");

  // Get contract instance
  const yieldStrategy = await ethers.getContractAt("EmpowerToursYieldStrategyV5", YIELD_STRATEGY);

  // Check if already whitelisted
  console.log("🔍 Checking current whitelist status...");
  const isWhitelisted = await yieldStrategy.acceptedNFTs(PASSPORT_NFT);
  console.log("   Current status:", isWhitelisted ? "✅ Whitelisted" : "❌ Not whitelisted");
  console.log("");

  if (isWhitelisted) {
    console.log("ℹ️  NFT is already whitelisted!");
    return;
  }

  // Verify deployer is owner
  const owner = await yieldStrategy.owner();
  console.log("🔑 Contract owner:", owner);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("❌ Deployer is not the contract owner!");
    console.error("   Only the owner can whitelist NFTs");
    process.exit(1);
  }

  // Whitelist the NFT
  console.log("⏳ Whitelisting Passport NFT...");
  const tx = await yieldStrategy.addAcceptedNFT(PASSPORT_NFT);
  console.log("   Transaction hash:", tx.hash);

  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);
  console.log("");

  // Verify whitelist
  console.log("🔍 Verifying whitelist...");
  const nowWhitelisted = await yieldStrategy.acceptedNFTs(PASSPORT_NFT);
  console.log("   New status:", nowWhitelisted ? "✅ Whitelisted" : "❌ Not whitelisted");
  console.log("");

  if (nowWhitelisted) {
    console.log("🎉 SUCCESS! Passport NFT is now whitelisted");
    console.log("   Users can now stake with their Passport NFTs");
  } else {
    console.error("❌ Whitelist verification failed!");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
