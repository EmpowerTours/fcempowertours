// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../EPKRegistry.sol";

/**
 * @notice Deploy EPKRegistryV2 with WMON escrow booking + createEPKFor/updateEPKFor.
 *
 * Usage:
 *   forge script script/DeployEPKRegistry.s.sol:DeployEPKRegistry \
 *     --rpc-url monad --broadcast --verify \
 *     -vvvv
 *
 * Requires env vars:
 *   DEPLOYER_PRIVATE_KEY
 *   WMON_TOKEN  (0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A on Monad mainnet)
 */
contract DeployEPKRegistry is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address wmonToken = vm.envAddress("WMON_TOKEN");

        vm.startBroadcast(deployerKey);

        EPKRegistryV2 registry = new EPKRegistryV2(wmonToken);
        console.log("EPKRegistryV2 deployed:", address(registry));

        vm.stopBroadcast();

        console.log("");
        console.log("=== EPK REGISTRY V2 DEPLOYED ===");
        console.log("EPKRegistryV2: ", address(registry));
        console.log("WMON Token:    ", wmonToken);
        console.log("Owner:         ", vm.addr(deployerKey));
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. transferOwnership(platformSafe) on the new contract");
        console.log("  2. Set NEXT_PUBLIC_EPK_REGISTRY in Railway env");
        console.log("  3. Add contract to Envio indexer config");
        console.log("  4. Seed Earvin Gallardo EPK via /api/epk/seed");
    }
}
