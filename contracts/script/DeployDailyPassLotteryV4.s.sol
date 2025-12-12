// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../contracts/DailyPassLotteryV4.sol";

/**
 * @notice Deploy DailyPassLotteryV4 with Switchboard randomness
 *
 * === Monad Testnet ===
 * Switchboard: 0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33
 * Platform Safe: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
 * shMON: 0x3a98250F98Dd388C211206983453837C8365BDc1
 *
 * === Monad Mainnet ===
 * Switchboard: 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67
 */
contract DeployDailyPassLotteryV4 is Script {
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

        // Deploy on Monad Testnet
        bool isMainnet = false; // Change to true for mainnet

        address switchboard = isMainnet ? SWITCHBOARD_MAINNET : SWITCHBOARD_TESTNET;
        address shMon = isMainnet ? SHMON_MAINNET : SHMON_TESTNET;
        address platformWallet = vm.envAddress("PLATFORM_WALLET"); // Set in .env

        console.log("=== Deploying DailyPassLotteryV4 ===");
        console.log("Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("Switchboard:", switchboard);
        console.log("Platform Safe:", PLATFORM_SAFE);
        console.log("Platform Wallet:", platformWallet);
        console.log("shMON:", shMon);

        DailyPassLotteryV4 lottery = new DailyPassLotteryV4(
            switchboard,
            PLATFORM_SAFE,
            platformWallet,
            shMon
        );

        console.log("\n=== Deployed! ===");
        console.log("DailyPassLotteryV4:", address(lottery));

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
