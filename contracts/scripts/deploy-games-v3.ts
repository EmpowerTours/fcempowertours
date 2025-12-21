import { ethers } from "hardhat";

/**
 * Deploy MusicBeatMatchV3 and CountryCollectorV3 to Monad Testnet
 *
 * V3 Changes:
 * - Uses Switchboard randomness with queue parameter for proper oracle routing
 * - Fixed requestRandomness() to use TESTNET_QUEUE
 */

async function main() {
  console.log("🚀 Deploying Game Contracts V3 to Monad Testnet\n");

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

  // Contract addresses
  const SWITCHBOARD = "0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33"; // Monad testnet
  const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN || "0xa123600c82E69cB311B0e068B06Bfa9F787699B7";
  const KEEPER = process.env.NEXT_PUBLIC_SAFE_ACCOUNT || deployer.address;
  const RESOLVER = deployer.address; // Bot address that resolves randomness

  console.log("📋 Constructor Parameters:");
  console.log("   Switchboard:", SWITCHBOARD);
  console.log("   TOURS Token:", TOURS_TOKEN);
  console.log("   Keeper:", KEEPER);
  console.log("   Resolver:", RESOLVER);
  console.log("");

  // Deploy MusicBeatMatchV3
  console.log("⏳ Deploying MusicBeatMatchV3...");
  const MusicBeatMatchV3 = await ethers.getContractFactory("MusicBeatMatchV3");
  const musicBeatMatch = await MusicBeatMatchV3.deploy(
    SWITCHBOARD,
    TOURS_TOKEN,
    KEEPER,
    RESOLVER
  );

  console.log("⏳ Waiting for MusicBeatMatchV3 deployment...");
  await musicBeatMatch.waitForDeployment();
  const musicBeatMatchAddress = await musicBeatMatch.getAddress();
  console.log("✅ MusicBeatMatchV3 deployed:", musicBeatMatchAddress);
  console.log("");

  // Deploy CountryCollectorV3
  console.log("⏳ Deploying CountryCollectorV3...");
  const CountryCollectorV3 = await ethers.getContractFactory("CountryCollectorV3");
  const countryCollector = await CountryCollectorV3.deploy(
    SWITCHBOARD,
    TOURS_TOKEN,
    KEEPER,
    RESOLVER
  );

  console.log("⏳ Waiting for CountryCollectorV3 deployment...");
  await countryCollector.waitForDeployment();
  const countryCollectorAddress = await countryCollector.getAddress();
  console.log("✅ CountryCollectorV3 deployed:", countryCollectorAddress);
  console.log("");

  // Verify deployments
  console.log("🔍 Verifying deployments...");
  const musicCode = await ethers.provider.getCode(musicBeatMatchAddress);
  const countryCode = await ethers.provider.getCode(countryCollectorAddress);

  if (musicCode === "0x" || countryCode === "0x") {
    console.error("❌ Contract deployment failed - no code at address!");
    process.exit(1);
  }
  console.log("✅ Contract code verified");
  console.log("");

  // Print next steps
  console.log("═══════════════════════════════════════════════════════");
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("📝 DEPLOYED CONTRACTS:");
  console.log(`   MusicBeatMatchV3: ${musicBeatMatchAddress}`);
  console.log(`   CountryCollectorV3: ${countryCollectorAddress}`);
  console.log("");
  console.log("📝 NEXT STEPS:");
  console.log("");
  console.log("1️⃣  Update environment variables in .env.local:");
  console.log(`   NEXT_PUBLIC_MUSIC_BEAT_MATCH_V3="${musicBeatMatchAddress}"`);
  console.log(`   NEXT_PUBLIC_COUNTRY_COLLECTOR_V3="${countryCollectorAddress}"`);
  console.log("");
  console.log("2️⃣  Fund contracts with TOURS tokens for rewards");
  console.log("");
  console.log("3️⃣  Test randomness flow:");
  console.log(`   - Call requestRandomSongSelection() on MusicBeatMatchV3`);
  console.log(`   - Call requestRandomArtistSelection() on CountryCollectorV3`);
  console.log(`   - Run randomness resolver bot to complete challenges`);
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
      MusicBeatMatchV3: {
        address: musicBeatMatchAddress,
        constructorArgs: [SWITCHBOARD, TOURS_TOKEN, KEEPER, RESOLVER],
        transactionHash: musicBeatMatch.deploymentTransaction()?.hash,
      },
      CountryCollectorV3: {
        address: countryCollectorAddress,
        constructorArgs: [SWITCHBOARD, TOURS_TOKEN, KEEPER, RESOLVER],
        transactionHash: countryCollector.deploymentTransaction()?.hash,
      },
    },
  };

  const deploymentFile = path.join(deploymentsDir, `GamesV3-${Date.now()}.json`);
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
