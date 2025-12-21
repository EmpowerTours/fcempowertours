// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../src/DailyPassLotteryWMON.sol";

/**
 * @notice Deploy DailyPassLotteryWMON with Pyth Entropy randomness
 *
 * === Monad Testnet Addresses ===
 * Pyth Entropy: 0x825c0390f379c631f3cf11a82a37d20bddf93c07
 * WMON: 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701
 * Platform Safe: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
 *
 * === Monad Mainnet Addresses ===
 * (To be determined when deploying to mainnet)
 */
contract DeployDailyPassLotteryWMON is Script {
    // Monad Testnet addresses
    address constant WMON_TESTNET = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
    address constant TOURS_TESTNET = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
    address constant ENTROPY_TESTNET = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;
    address constant PLATFORM_SAFE_TESTNET = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;

    // Monad Mainnet addresses (placeholder)
    address constant WMON_MAINNET = address(0); // Update when WMON is deployed
    address constant TOURS_MAINNET = address(0); // Update when TOURS is deployed
    address constant ENTROPY_MAINNET = address(0); // Update when available
    address constant PLATFORM_SAFE_MAINNET = address(0); // Update when known

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Auto-detect network based on chain ID (Monad Mainnet = 143, Testnet = 10143)
        bool isMainnet = block.chainid == 143;

        console.log("=== Deploying DailyPassLotteryWMON ===");
        console.log("Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("Chain ID:", block.chainid);

        address wmonToken;
        address toursToken;
        address entropy;
        address platformSafe;
        address platformWallet;

        if (isMainnet) {
            // Mainnet configuration
            wmonToken = WMON_MAINNET;
            toursToken = TOURS_MAINNET;
            entropy = ENTROPY_MAINNET;
            platformSafe = PLATFORM_SAFE_MAINNET;
            platformWallet = vm.envAddress("PLATFORM_WALLET");

            require(wmonToken != address(0), "WMON not deployed to mainnet");
            require(toursToken != address(0), "TOURS not deployed to mainnet");
            require(entropy != address(0), "Entropy not available on mainnet");
            require(platformSafe != address(0), "Platform safe not set");
        } else {
            // Testnet configuration
            wmonToken = WMON_TESTNET;
            toursToken = TOURS_TESTNET;
            entropy = ENTROPY_TESTNET;
            platformSafe = PLATFORM_SAFE_TESTNET;
            platformWallet = vm.envAddress("PLATFORM_WALLET");
        }

        console.log("");
        console.log("Configuration:");
        console.log("  WMON Token:", wmonToken);
        console.log("  TOURS Token:", toursToken);
        console.log("  Pyth Entropy:", entropy);
        console.log("  Platform Safe:", platformSafe);
        console.log("  Platform Wallet:", platformWallet);
        console.log("");

        // Deploy DailyPassLotteryWMON
        DailyPassLotteryWMON lottery = new DailyPassLotteryWMON(
            wmonToken,
            toursToken,
            entropy,
            platformSafe,
            platformWallet
        );

        console.log("=== Deployed! ===");
        console.log("DailyPassLotteryWMON:", address(lottery));
        console.log("");

        console.log("=== Lottery Configuration ===");
        console.log("Entry Fee:", lottery.ENTRY_FEE() / 1e18, "WMON");
        console.log("Prize Pool:", lottery.PRIZE_POOL_BPS() / 100, "%");
        console.log("Platform Safe Fee:", lottery.PLATFORM_SAFE_FEE_BPS() / 100, "%");
        console.log("Platform Wallet Fee:", lottery.PLATFORM_WALLET_FEE_BPS() / 100, "%");
        console.log("Round Duration:", lottery.ROUND_DURATION() / 3600, "hours");
        console.log("Escrow Claim Period:", lottery.ESCROW_CLAIM_PERIOD() / 86400, "days");
        console.log("");

        console.log("=== Randomness Provider ===");
        console.log("Entropy Provider:", lottery.entropyProvider());
        console.log("Current Entropy Fee:", lottery.getEntropyFee(), "wei (~0.109 MON testnet)");
        console.log("");

        console.log("=== Current Round ===");
        (
            uint256 roundId,
            uint256 prizePool,
            uint256 participants,
            ,
            ,

        ) = lottery.getStats();
        console.log("Round ID:", roundId);
        console.log("Prize Pool:", prizePool / 1e18, "WMON");
        console.log("Participants:", participants);
        console.log("");

        console.log("=== Next Steps ===");
        console.log("1. Fund lottery contract with TOURS for caller rewards:");
        console.log("   lottery.fundRewards(1000 ether) // 1000 TOURS");
        console.log("   Caller Reward:", lottery.CALLER_REWARD_TOURS() / 1e18, "TOURS per request");
        console.log("");
        console.log("2. Users enter lottery:");
        console.log("   wmon.approve(lotteryAddress, 1 ether)");
        console.log("   lottery.enterWithWMON()");
        console.log("");
        console.log("3. After round ends, anyone can request randomness:");
        console.log("   lottery.requestRandomness(roundId) { value: entropyFee }");
        console.log("");
        console.log("4. Pyth Entropy will callback automatically with random number");
        console.log("");
        console.log("5. Winner claims prize:");
        console.log("   lottery.claimPrize(roundId)");
        console.log("");

        console.log("=== Verify Contract ===");
        console.log("forge verify-contract", address(lottery));
        console.log("  src/DailyPassLotteryWMON.sol:DailyPassLotteryWMON");
        console.log("  --chain-id", block.chainid);
        console.log("  --verifier sourcify");
        console.log("  --constructor-args:");
        console.log("    wmonToken:", wmonToken);
        console.log("    toursToken:", toursToken);
        console.log("    entropy:", entropy);
        console.log("    platformSafe:", platformSafe);
        console.log("    platformWallet:", platformWallet);
        console.log("");

        console.log("=== Update .env ===");
        console.log("NEXT_PUBLIC_LOTTERY_WMON_ADDRESS=%s", address(lottery));

        vm.stopBroadcast();
    }
}
