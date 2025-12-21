// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../contracts/EmpowerToursRegistry.sol";

/**
 * @notice Deploy EmpowerToursRegistry
 *
 * === Monad Testnet ===
 * No constructor parameters needed - fully permissionless
 *
 * === Integration ===
 * Works with existing MirrorMate contract at 0x1b4B6866BF81fD76C51bf12C25e3F2CB819e81e6
 * - Registry: Stores user profiles (bio, location, languages, transport)
 * - MirrorMate: Handles payments (skip fees, match payments)
 */
contract DeployEmpowerToursRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        console.log("=== Deploying EmpowerToursRegistry ===");
        console.log("Network: Monad Testnet");
        console.log("Chain ID:", block.chainid);

        EmpowerToursRegistry registry = new EmpowerToursRegistry();

        console.log("\n=== Deployed! ===");
        console.log("EmpowerToursRegistry:", address(registry));

        console.log("\n=== Contract Info ===");
        console.log("- Stores user profiles (bio, location, languages, transport)");
        console.log("- Tracks registered guides for discovery");
        console.log("- Fully permissionless (any Farcaster user can register)");
        console.log("- Gas-optimized with O(1) guide list operations");

        console.log("\n=== Integration ===");
        console.log("MirrorMate Contract: 0x1b4B6866BF81fD76C51bf12C25e3F2CB819e81e6");
        console.log("Usage:");
        console.log("1. User registers profile in Registry");
        console.log("2. UI fetches profiles from Registry");
        console.log("3. User pays skip/match fees via MirrorMate");
        console.log("4. Guides receive earnings to their verified Farcaster address");

        console.log("\n=== Add to .env ===");
        console.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(registry));

        vm.stopBroadcast();
    }
}
