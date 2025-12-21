// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../contracts/DailyPassLotteryV5.sol";

/**
 * @notice Deploy DailyPassLotteryV5 with Switchboard updateFee payment support
 *
 * === Monad Testnet ===
 * Switchboard: 0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33
 * Platform Safe: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
 * shMON: 0x3a98250F98Dd388C211206983453837C8365BDc1
 *
 * === Monad Mainnet ===
 * Switchboard: 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67
 */
contract DeployDailyPassLotteryV5 is Script {
    // Monad Testnet addresses
    address constant SWITCHBOARD_TESTNET = 0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33;
    address constant PLATFORM_SAFE = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;
    address constant SHMON_TESTNET = 0x3a98250F98Dd388C211206983453837C8365BDc1;

    // Monad Mainnet addresses
    address constant SWITCHBOARD_MAINNET = 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67;
    address constant SHMON_MAINNET = 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Auto-detect network based on chain ID (Monad Mainnet = 143, Testnet = 10143)
        bool isMainnet = block.chainid == 143;

        address switchboard = isMainnet ? SWITCHBOARD_MAINNET : SWITCHBOARD_TESTNET;
        address shMon = isMainnet ? SHMON_MAINNET : SHMON_TESTNET;
        address platformWallet = vm.envAddress("PLATFORM_WALLET"); // Set in .env

        console.log("=== Deploying DailyPassLotteryV5 ===");
        console.log("Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("Chain ID:", block.chainid);
        console.log("Switchboard:", switchboard);
        console.log("Platform Safe:", PLATFORM_SAFE);
        console.log("Platform Wallet:", platformWallet);
        console.log("shMON:", shMon);

        DailyPassLotteryV5 lottery = new DailyPassLotteryV5(
            switchboard,
            PLATFORM_SAFE,
            platformWallet,
            shMon
        );

        console.log("\n=== Deployed! ===");
        console.log("DailyPassLotteryV5:", address(lottery));

        console.log("\n=== V5 Improvements ===");
        console.log("- Added payable modifier for updateFee payment");
        console.log("- Proper Switchboard fee handling");
        console.log("- Refund logic for excess MON");

        // Fund with rewards for caller incentives
        uint256 initialFunding = 1 ether; // 1 MON for rewards
        (bool success,) = address(lottery).call{value: initialFunding}("");
        require(success, "Funding failed");

        console.log("Funded with rewards:", initialFunding);

        console.log("\n=== Configuration ===");
        console.log("Entry Fee: 1 MON");
        console.log("Platform Safe Fee: 5%");
        console.log("Platform Wallet Fee: 5%");
        console.log("Prize Pool: 90%");
        console.log("Caller Reward: 0.01 MON");
        console.log("Settlement Delay: 5 seconds");
        console.log("Round Duration: 24 hours");

        console.log("\n=== Add to .env ===");
        console.log("NEXT_PUBLIC_LOTTERY_ADDRESS=", address(lottery));

        vm.stopBroadcast();
    }
}
