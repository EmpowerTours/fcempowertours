// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../contracts/CountryCollectorV5.sol";

/**
 * @notice Deploy CountryCollectorV5 with Switchboard updateFee payment support
 *
 * === Monad Testnet ===
 * Switchboard: 0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33
 * TOURS Token: 0xa123600c82E69cB311B0e068B06Bfa9F787699B7
 * Platform Safe: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
 *
 * === Monad Mainnet ===
 * Switchboard: 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67
 */
contract DeployCountryCollectorV5 is Script {
    // Monad Testnet addresses
    address constant SWITCHBOARD_TESTNET = 0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33;
    address constant TOURS_TOKEN_TESTNET = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
    address constant PLATFORM_SAFE = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;

    // Monad Mainnet addresses
    address constant SWITCHBOARD_MAINNET = 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address resolver = vm.envAddress("RESOLVER_ADDRESS"); // Resolver bot address

        vm.startBroadcast(deployerPrivateKey);

        // Auto-detect network based on chain ID (Monad Mainnet = 143, Testnet = 10143)
        bool isMainnet = block.chainid == 143;

        address switchboard = isMainnet ? SWITCHBOARD_MAINNET : SWITCHBOARD_TESTNET;
        address toursToken = TOURS_TOKEN_TESTNET; // Update for mainnet when needed
        address keeper = PLATFORM_SAFE;

        console.log("=== Deploying CountryCollectorV5 ===");
        console.log("Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("Chain ID:", block.chainid);
        console.log("Switchboard:", switchboard);
        console.log("TOURS Token:", toursToken);
        console.log("Keeper:", keeper);
        console.log("Resolver:", resolver);

        CountryCollectorV5 game = new CountryCollectorV5(
            switchboard,
            toursToken,
            keeper,
            resolver
        );

        console.log("\n=== Deployed! ===");
        console.log("CountryCollectorV5:", address(game));

        console.log("\n=== V5 Improvements ===");
        console.log("- Added payable modifier for updateFee payment");
        console.log("- Proper Switchboard fee handling");
        console.log("- Refund logic for excess MON");

        console.log("\n=== Configuration ===");
        console.log("Artist Completion Reward: 5 TOURS");
        console.log("Badge Reward: 50 TOURS");
        console.log("Global Citizen Bonus: 100 TOURS");
        console.log("Challenge Duration: 7 days");
        console.log("Settlement Delay: 5 seconds");

        console.log("\n=== Add to .env ===");
        console.log("NEXT_PUBLIC_COUNTRY_COLLECTOR_ADDRESS=", address(game));

        vm.stopBroadcast();
    }
}
