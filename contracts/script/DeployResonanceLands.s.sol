// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ResonanceLands.sol";

contract DeployResonanceLands is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Contract addresses from .env.local
        address passportNFT = 0xCDdE80E0cf16b31e7Ad7D83dD012d33b328f9E4f;  // NEXT_PUBLIC_PASSPORT_NFT
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;    // NEXT_PUBLIC_WMON
        address platformWallet = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3; // TREASURY_ADDRESS

        vm.startBroadcast(deployerPrivateKey);

        // Deploy ResonanceLands
        ResonanceLands resonanceLands = new ResonanceLands(
            passportNFT,
            wmonToken,
            platformWallet
        );

        console.log("ResonanceLands deployed at:", address(resonanceLands));
        console.log("  - PassportNFT:", passportNFT);
        console.log("  - WMON Token:", wmonToken);
        console.log("  - Platform Wallet:", platformWallet);

        vm.stopBroadcast();
    }
}
