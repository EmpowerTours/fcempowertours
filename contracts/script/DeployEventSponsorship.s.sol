// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EventSponsorship.sol";

/**
 * @title DeployEventSponsorship
 * @notice Deploys EventSponsorship contract for two-way sponsorship marketplace
 *
 * Deploy command:
 * cd contracts && forge script script/DeployEventSponsorship.s.sol:DeployEventSponsorship \
 *   --rpc-url https://testnet-rpc.monad.xyz \
 *   --broadcast \
 *   --legacy
 *
 * Verify command:
 * forge verify-contract <ADDRESS> src/EventSponsorship.sol:EventSponsorship \
 *   --verifier sourcify \
 *   --verifier-url https://sourcify.dev/server \
 *   --chain-id 10143 \
 *   --constructor-args $(cast abi-encode "constructor(address,address,address)" 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3 0xDdaE200DBc2874BAd4FdB5e39F227215386c7533)
 */
contract DeployEventSponsorship is Script {
    // Monad Testnet addresses
    address constant WMON = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
    address constant TREASURY = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3;
    address constant ORACLE = 0xDdaE200DBc2874BAd4FdB5e39F227215386c7533; // Platform Safe

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Deploying EventSponsorship ===");
        console.log("Deployer:", deployer);
        console.log("WMON:", WMON);
        console.log("Treasury:", TREASURY);
        console.log("Oracle:", ORACLE);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        EventSponsorship eventSponsorship = new EventSponsorship(
            WMON,
            TREASURY,
            ORACLE
        );

        console.log("EventSponsorship deployed at:", address(eventSponsorship));

        vm.stopBroadcast();

        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("EventSponsorship:", address(eventSponsorship));
        console.log("");
        console.log("Add to .env.local:");
        console.log("NEXT_PUBLIC_EVENT_SPONSORSHIP=", address(eventSponsorship));
        console.log("");
        console.log("Verify with:");
        console.log("forge verify-contract", address(eventSponsorship), "src/EventSponsorship.sol:EventSponsorship --verifier sourcify --verifier-url https://sourcify.dev/server --chain-id 10143");
    }
}
