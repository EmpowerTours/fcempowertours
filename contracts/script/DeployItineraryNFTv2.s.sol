// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ItineraryNFTv2.sol";

contract DeployItineraryNFTv2 is Script {

    // Existing deployed contract addresses on Monad Testnet
    address constant PASSPORT_NFT_V3 = 0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163;
    address constant TOURS_TOKEN = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
    address constant KEEPER = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;  // Safe account

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("==============================================");
        console.log("Deploying ItineraryNFTv2 to Monad Testnet");
        console.log("==============================================");
        console.log("");
        console.log("Deployer Address:", deployer);
        console.log("Deployer Balance:", deployer.balance / 1 ether, "MON");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy ItineraryNFTv2
        console.log("Deploying ItineraryNFTv2...");
        ItineraryNFTv2 itineraryNFTv2 = new ItineraryNFTv2(
            PASSPORT_NFT_V3,
            TOURS_TOKEN
        );
        console.log("Deployed at:", address(itineraryNFTv2));

        // Authorize the Keeper (Safe) as a burner
        console.log("Authorizing Keeper as burner:", KEEPER);
        itineraryNFTv2.setAuthorizedBurner(KEEPER, true);
        console.log("Keeper authorized!");

        vm.stopBroadcast();

        // Summary
        console.log("");
        console.log("==============================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("");
        console.log("ItineraryNFTv2:", address(itineraryNFTv2));
        console.log("");
        console.log("Constructor args:");
        console.log("  PassportNFT v3:", PASSPORT_NFT_V3);
        console.log("  TOURS Token:", TOURS_TOKEN);
        console.log("");
        console.log("NEXT STEPS:");
        console.log("1. Verify contract:");
        console.log("   forge verify-contract <address> \\");
        console.log("     contracts/ItineraryNFTv2.sol:ItineraryNFTv2 \\");
        console.log("     --chain monad_testnet \\");
        console.log("     --constructor-args $(cast abi-encode \"constructor(address,address)\" 0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163 0xa123600c82E69cB311B0e068B06Bfa9F787699B7)");
        console.log("");
        console.log("2. Fund with TOURS for rewards");
        console.log("3. Update environment variable:");
        console.log("   NEXT_PUBLIC_ITINERARY_NFT_V2=<address>");
        console.log("");
    }
}
