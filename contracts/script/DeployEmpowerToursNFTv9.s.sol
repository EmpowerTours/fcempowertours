// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFTv9.sol";

contract DeployEmpowerToursNFTv9 is Script {
    function run() external {
        // Configuration
        address treasury = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3;
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;

        console.log("=== Deploying EmpowerToursNFTv9 ===");
        console.log("Treasury:", treasury);
        console.log("WMON Token (payments):", wmonToken);
        console.log("TOURS Token (rewards):", toursToken);
        console.log("");
        console.log("Features:");
        console.log("  - ERC2981 royalties (50% music, 50% art)");
        console.log("  - Soulbound masters (cannot transfer)");
        console.log("  - Collector editions with AI artwork");
        console.log("  - Delegated sales with auto royalties");
        console.log("  - Tiered burn rewards (10/5/1 TOURS)");
        console.log("  - Min prices: 35 WMON standard, 500 WMON collector");
        console.log("");

        vm.startBroadcast();

        EmpowerToursNFTv9 nft = new EmpowerToursNFTv9(
            treasury,
            wmonToken,
            toursToken
        );

        vm.stopBroadcast();

        console.log("EmpowerToursNFTv9 deployed to:", address(nft));
        console.log("");
        console.log("Configuration:");
        console.log("  Min License Price:", nft.MINIMUM_LICENSE_PRICE() / 1e18, "WMON");
        console.log("  Min Collector Price:", nft.MINIMUM_COLLECTOR_PRICE() / 1e18, "WMON");
        console.log("  Music Royalty:", nft.MUSIC_ROYALTY(), "bps (50%)");
        console.log("  Art Royalty:", nft.ART_ROYALTY(), "bps (50%)");
        console.log("");
        console.log("To verify with Sourcify:");
        console.log("forge verify-contract", address(nft), "src/EmpowerToursNFTv9.sol:EmpowerToursNFTv9 --chain 41454 --verifier sourcify");
        console.log("");
        console.log("Update .env.local:");
        console.log('NEXT_PUBLIC_NFT_ADDRESS="', address(nft), '"');
    }
}
