// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFT.sol";

contract DeployEmpowerToursNFT is Script {
    function run() external {
        // Configuration - Updated Dec 27, 2025
        address treasury = 0xb5FF3Ed7Ab53A4DDA6C9887e0a0039C5f1E80107; // EmpowerToursTreasury contract
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
        address toursToken = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;

        console.log("=== Deploying EmpowerToursNFT ===");
        console.log("Treasury:", treasury);
        console.log("WMON Token (payments):", wmonToken);
        console.log("TOURS Token (rewards):", toursToken);
        console.log("");
        console.log("Features:");
        console.log("  - ERC2981 royalties (50% music, 50% art)");
        console.log("  - Soulbound masters (cannot transfer)");
        console.log("  - Collector editions with AI artwork");
        console.log("  - Tiered burn rewards (10/5/1 TOURS)");
        console.log("  - Min prices: 35 WMON standard, 500 WMON collector");
        console.log("");
        console.log("Revenue Model:");
        console.log("  - Initial sale: 10% treasury, 90% artist");
        console.log("  - Resale: 10% treasury, 60% artist, 30% seller");
        console.log("");
        console.log("New Admin Functions:");
        console.log("  - clearArtistSong(artist, title) - allows reminting after burn");
        console.log("  - burnStolenContent(tokenId, reason) - remove stolen/infringing NFTs");
        console.log("");

        vm.startBroadcast();

        EmpowerToursNFT nft = new EmpowerToursNFT(
            treasury,
            wmonToken,
            toursToken
        );

        vm.stopBroadcast();

        console.log("EmpowerToursNFT deployed to:", address(nft));
        console.log("");
        console.log("Configuration:");
        console.log("  Min License Price:", nft.MINIMUM_LICENSE_PRICE() / 1e18, "WMON");
        console.log("  Min Collector Price:", nft.MINIMUM_COLLECTOR_PRICE() / 1e18, "WMON");
        console.log("  Music Royalty:", nft.MUSIC_ROYALTY(), "bps (50%)");
        console.log("  Art Royalty:", nft.ART_ROYALTY(), "bps (50%)");
        console.log("  Treasury Fee:", nft.treasuryFee(), "%");
        console.log("");
        console.log("To verify with Sourcify:");
        console.log("forge verify-contract", address(nft), "src/EmpowerToursNFT.sol:EmpowerToursNFT --chain 10143 --verifier sourcify");
        console.log("");
        console.log("Update .env.local:");
        console.log('NEXT_PUBLIC_NFT_ADDRESS="', address(nft), '"');
    }
}
