import { ethers } from "hardhat";

/**
 * Deploy Game Contracts V5 + Lottery V5 to Monad Testnet
 *
 * V5 Changes:
 * - Added payable modifiers to randomness settlement functions
 * - Added Switchboard updateFee payment support
 * - Proper fee handling and refund logic
 */

async function main() {
  console.log("🚀 Deploying Game Contracts V5 + Lottery V5 to Monad Testnet\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deployer address:", deployer.address);

  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "MON\n");

  if (balance < ethers.parseEther("0.2")) {
    console.error("❌ Insufficient MON balance! Need at least 0.2 MON for deployment.");
    console.error("   Send MON to:", deployer.address);
    process.exit(1);
  }

  // Contract addresses
  const SWITCHBOARD = "0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33"; // Monad testnet
  const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN || "0xa123600c82E69cB311B0e068B06Bfa9F787699B7";
  const KEEPER = process.env.NEXT_PUBLIC_SAFE_ACCOUNT || deployer.address;
  const RESOLVER = deployer.address; // Bot address that resolves randomness
  const PLATFORM_SAFE = process.env.NEXT_PUBLIC_SAFE_ACCOUNT || deployer.address;
  const PLATFORM_WALLET = deployer.address;
  const SHMON_TOKEN = process.env.NEXT_PUBLIC_SHMON_TOKEN || "0x0000000000000000000000000000000000000000";

  console.log("📋 Constructor Parameters:");
  console.log("   Switchboard:", SWITCHBOARD);
  console.log("   TOURS Token:", TOURS_TOKEN);
  console.log("   Keeper:", KEEPER);
  console.log("   Resolver:", RESOLVER);
  console.log("   Platform Safe:", PLATFORM_SAFE);
  console.log("   Platform Wallet:", PLATFORM_WALLET);
  console.log("   shMON Token:", SHMON_TOKEN);
  console.log("");

  // Deploy MusicBeatMatchV5
  console.log("⏳ Deploying MusicBeatMatchV5...");
  const MusicBeatMatchV5 = await ethers.getContractFactory("MusicBeatMatchV5");
  const musicBeatMatch = await MusicBeatMatchV5.deploy(
    SWITCHBOARD,
    TOURS_TOKEN,
    KEEPER,
    RESOLVER
  );

  console.log("⏳ Waiting for MusicBeatMatchV5 deployment...");
  await musicBeatMatch.waitForDeployment();
  const musicBeatMatchAddress = await musicBeatMatch.getAddress();
  console.log("✅ MusicBeatMatchV5 deployed:", musicBeatMatchAddress);
  console.log("");

  // Deploy CountryCollectorV5
  console.log("⏳ Deploying CountryCollectorV5...");
  const CountryCollectorV5 = await ethers.getContractFactory("CountryCollectorV5");
  const countryCollector = await CountryCollectorV5.deploy(
    SWITCHBOARD,
    TOURS_TOKEN,
    KEEPER,
    RESOLVER
  );

  console.log("⏳ Waiting for CountryCollectorV5 deployment...");
  await countryCollector.waitForDeployment();
  const countryCollectorAddress = await countryCollector.getAddress();
  console.log("✅ CountryCollectorV5 deployed:", countryCollectorAddress);
  console.log("");

  // Deploy DailyPassLotteryV5
  console.log("⏳ Deploying DailyPassLotteryV5...");
  const DailyPassLotteryV5 = await ethers.getContractFactory("DailyPassLotteryV5");
  const lottery = await DailyPassLotteryV5.deploy(
    SWITCHBOARD,
    PLATFORM_SAFE,
    PLATFORM_WALLET,
    SHMON_TOKEN
  );

  console.log("⏳ Waiting for DailyPassLotteryV5 deployment...");
  await lottery.waitForDeployment();
  const lotteryAddress = await lottery.getAddress();
  console.log("✅ DailyPassLotteryV5 deployed:", lotteryAddress);
  console.log("");

  // Verify deployments
  console.log("🔍 Verifying deployments...");
  const musicCode = await ethers.provider.getCode(musicBeatMatchAddress);
  const countryCode = await ethers.provider.getCode(countryCollectorAddress);
  const lotteryCode = await ethers.provider.getCode(lotteryAddress);

  if (musicCode === "0x" || countryCode === "0x" || lotteryCode === "0x") {
    console.error("❌ Contract deployment failed - no code at address!");
    process.exit(1);
  }
  console.log("✅ All contract code verified");
  console.log("");

  // Print next steps
  console.log("═══════════════════════════════════════════════════════");
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("📝 DEPLOYED CONTRACTS:");
  console.log(`   MusicBeatMatchV5: ${musicBeatMatchAddress}`);
  console.log(`   CountryCollectorV5: ${countryCollectorAddress}`);
  console.log(`   DailyPassLotteryV5: ${lotteryAddress}`);
  console.log("");
  console.log("📝 NEXT STEPS:");
  console.log("");
  console.log("1️⃣  Update environment variables in .env.local:");
  console.log(`   NEXT_PUBLIC_MUSIC_BEAT_MATCH_ADDRESS="${musicBeatMatchAddress}"`);
  console.log(`   NEXT_PUBLIC_COUNTRY_COLLECTOR_ADDRESS="${countryCollectorAddress}"`);
  console.log(`   NEXT_PUBLIC_LOTTERY_ADDRESS="${lotteryAddress}"`);
  console.log("");
  console.log("2️⃣  Fund contracts with TOURS tokens for rewards:");
  console.log(`   - MusicBeatMatch needs ~10,000 TOURS for daily pools`);
  console.log(`   - CountryCollector needs ~5,000 TOURS for rewards`);
  console.log("");
  console.log("3️⃣  Update bot scripts to use new addresses");
  console.log("");
  console.log("4️⃣  Restart randomness resolver bots:");
  console.log(`   - game-randomness-resolver.ts (for both games)`);
  console.log(`   - lottery-randomness-resolver.ts`);
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  // Save deployment info
  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    network: "monadTestnet",
    chainId: 10143,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MusicBeatMatchV5: {
        address: musicBeatMatchAddress,
        constructorArgs: [SWITCHBOARD, TOURS_TOKEN, KEEPER, RESOLVER],
        transactionHash: musicBeatMatch.deploymentTransaction()?.hash,
      },
      CountryCollectorV5: {
        address: countryCollectorAddress,
        constructorArgs: [SWITCHBOARD, TOURS_TOKEN, KEEPER, RESOLVER],
        transactionHash: countryCollector.deploymentTransaction()?.hash,
      },
      DailyPassLotteryV5: {
        address: lotteryAddress,
        constructorArgs: [SWITCHBOARD, PLATFORM_SAFE, PLATFORM_WALLET, SHMON_TOKEN],
        transactionHash: lottery.deploymentTransaction()?.hash,
      },
    },
  };

  const deploymentFile = path.join(deploymentsDir, `GamesV5-${Date.now()}.json`);
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
