import { run } from "hardhat";

/**
 * Verify YieldStrategy V5 on MonadScan
 *
 * Usage:
 *   npx hardhat run scripts/verify-v5.ts --network monadTestnet
 *
 * Or with specific address:
 *   CONTRACT_ADDRESS=0x... npx hardhat run scripts/verify-v5.ts --network monadTestnet
 */

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_YIELD_STRATEGY;

  if (!contractAddress) {
    console.error("❌ Contract address not provided!");
    console.error("   Set CONTRACT_ADDRESS or NEXT_PUBLIC_YIELD_STRATEGY environment variable");
    process.exit(1);
  }

  console.log("🔍 Verifying YieldStrategy V5 on MonadScan");
  console.log("📍 Contract address:", contractAddress);
  console.log("");

  // Constructor arguments (must match deployment)
  const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN || "0xa123600c82E69cB311B0e068B06Bfa9F787699B7";
  const KINTSU = process.env.NEXT_PUBLIC_KINTSU || "0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626";
  const TOKEN_SWAP = process.env.NEXT_PUBLIC_SWAP || "0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2";
  const DRAGON_ROUTER = process.env.NEXT_PUBLIC_DRAGON_ROUTER || "0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e";
  const KEEPER = process.env.NEXT_PUBLIC_SAFE_ACCOUNT || "";

  console.log("📋 Constructor Arguments:");
  console.log("   TOURS Token:", TOURS_TOKEN);
  console.log("   Kintsu:", KINTSU);
  console.log("   Token Swap:", TOKEN_SWAP);
  console.log("   Dragon Router:", DRAGON_ROUTER);
  console.log("   Keeper:", KEEPER);
  console.log("");

  try {
    console.log("⏳ Submitting verification...");
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [
        TOURS_TOKEN,
        KINTSU,
        TOKEN_SWAP,
        DRAGON_ROUTER,
        KEEPER,
      ],
    });

    console.log("");
    console.log("✅ Contract verified successfully!");
    console.log("🔗 View on MonadScan: https://testnet.monad.xyz/address/" + contractAddress);
    console.log("");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("ℹ️  Contract is already verified!");
      console.log("🔗 View on MonadScan: https://testnet.monad.xyz/address/" + contractAddress);
    } else {
      console.error("❌ Verification failed:");
      console.error(error.message);
      console.log("");
      console.log("💡 Manual verification command:");
      console.log(`   npx hardhat verify --network monadTestnet ${contractAddress} \\`);
      console.log(`     "${TOURS_TOKEN}" \\`);
      console.log(`     "${KINTSU}" \\`);
      console.log(`     "${TOKEN_SWAP}" \\`);
      console.log(`     "${DRAGON_ROUTER}" \\`);
      console.log(`     "${KEEPER}"`);
      process.exit(1);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
