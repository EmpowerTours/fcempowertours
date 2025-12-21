import { ethers } from "hardhat";

/**
 * Deploy YieldStrategy V5 to Monad Testnet
 *
 * Prerequisites:
 * 1. Set PRIVATE_KEY in .env file (deployer private key)
 * 2. Set NEXT_PUBLIC_MONAD_RPC in .env file
 * 3. Fund deployer address with MON tokens
 *
 * After deployment:
 * 1. Save the deployed address
 * 2. Verify on MonadScan using: npx hardhat verify --network monadTestnet <address> <constructor-args>
 * 3. Update .env.local with NEXT_PUBLIC_YIELD_STRATEGY=<address>
 * 4. Whitelist Passport NFT: npx hardhat run scripts/whitelist-nft.ts
 */

async function main() {
  console.log("🚀 Deploying YieldStrategy V5 to Monad Testnet\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deployer address:", deployer.address);

  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "MON\n");

  if (balance < ethers.parseEther("0.1")) {
    console.error("❌ Insufficient MON balance! Need at least 0.1 MON for deployment.");
    console.error("   Send MON to:", deployer.address);
    process.exit(1);
  }

  // Contract addresses (from environment or defaults)
  const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN || "0xa123600c82E69cB311B0e068B06Bfa9F787699B7";
  const KINTSU = process.env.NEXT_PUBLIC_KINTSU || "0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626";
  const TOKEN_SWAP = process.env.NEXT_PUBLIC_SWAP || "0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2";
  const DRAGON_ROUTER = process.env.NEXT_PUBLIC_DRAGON_ROUTER || "0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e";
  const KEEPER = process.env.NEXT_PUBLIC_SAFE_ACCOUNT || deployer.address; // Use Safe as keeper

  console.log("📋 Constructor Parameters:");
  console.log("   TOURS Token:", TOURS_TOKEN);
  console.log("   Kintsu:", KINTSU);
  console.log("   Token Swap:", TOKEN_SWAP);
  console.log("   Dragon Router:", DRAGON_ROUTER);
  console.log("   Keeper:", KEEPER);
  console.log("");

  // Deploy the contract
  console.log("⏳ Deploying EmpowerToursYieldStrategyV5...");
  const YieldStrategyV5 = await ethers.getContractFactory("EmpowerToursYieldStrategyV5");
  const yieldStrategy = await YieldStrategyV5.deploy(
    TOURS_TOKEN,
    KINTSU,
    TOKEN_SWAP,
    DRAGON_ROUTER,
    KEEPER
  );

  console.log("⏳ Waiting for deployment transaction to be mined...");
  await yieldStrategy.waitForDeployment();

  const deployedAddress = await yieldStrategy.getAddress();
  console.log("\n✅ YieldStrategy V5 deployed successfully!");
  console.log("📍 Contract address:", deployedAddress);
  console.log("");

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const code = await ethers.provider.getCode(deployedAddress);
  if (code === "0x") {
    console.error("❌ Contract deployment failed - no code at address!");
    process.exit(1);
  }
  console.log("✅ Contract code verified (length:", code.length, "bytes)");
  console.log("");

  // Test contract by checking immutable variables
  console.log("🧪 Testing contract setup...");
  const toursTokenAddress = await yieldStrategy.toursToken();
  const kintsuAddress = await yieldStrategy.kintsu();
  const keeperAddress = await yieldStrategy.keeper();

  console.log("   TOURS Token:", toursTokenAddress);
  console.log("   Kintsu:", kintsuAddress);
  console.log("   Keeper:", keeperAddress);

  if (toursTokenAddress.toLowerCase() !== TOURS_TOKEN.toLowerCase()) {
    console.error("❌ TOURS token mismatch!");
    process.exit(1);
  }
  console.log("✅ Contract setup verified");
  console.log("");

  // Print next steps
  console.log("═══════════════════════════════════════════════════════");
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("📝 NEXT STEPS:");
  console.log("");
  console.log("1️⃣  Update environment variables:");
  console.log(`   Add to .env.local:`);
  console.log(`   NEXT_PUBLIC_YIELD_STRATEGY=${deployedAddress}`);
  console.log("");
  console.log("2️⃣  Verify contract on MonadScan:");
  console.log(`   npx hardhat verify --network monadTestnet ${deployedAddress} \\`);
  console.log(`     "${TOURS_TOKEN}" \\`);
  console.log(`     "${KINTSU}" \\`);
  console.log(`     "${TOKEN_SWAP}" \\`);
  console.log(`     "${DRAGON_ROUTER}" \\`);
  console.log(`     "${KEEPER}"`);
  console.log("");
  console.log("   OR use the verify script:");
  console.log(`   npm run verify:v5 ${deployedAddress}`);
  console.log("");
  console.log("3️⃣  Whitelist Passport NFT:");
  console.log(`   npx hardhat run scripts/whitelist-nft.ts --network monadTestnet`);
  console.log("");
  console.log("4️⃣  Test the deployment:");
  console.log(`   npm run test:v5`);
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  // Save deployment info to file
  const deploymentInfo = {
    network: "monadTestnet",
    chainId: 41454,
    contract: "EmpowerToursYieldStrategyV5",
    address: deployedAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    constructorArgs: {
      toursToken: TOURS_TOKEN,
      kintsu: KINTSU,
      tokenSwap: TOKEN_SWAP,
      dragonRouter: DRAGON_ROUTER,
      keeper: KEEPER,
    },
    transactionHash: yieldStrategy.deploymentTransaction()?.hash,
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `YieldStrategyV5-${Date.now()}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("💾 Deployment info saved to:", deploymentFile);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
