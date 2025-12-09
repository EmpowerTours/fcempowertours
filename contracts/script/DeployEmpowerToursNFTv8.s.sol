// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFTv8.sol";

contract DeployEmpowerToursNFTv8 is Script {
    function run() external {
        // Configuration
        address treasury = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3;
        address wmonToken = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;

        console.log("=== Deploying EmpowerToursNFTv8 ===");
        console.log("Treasury:", treasury);
        console.log("WMON Token (payments):", wmonToken);
        console.log("TOURS Token (rewards):", toursToken);
        console.log("");

        vm.startBroadcast();

        EmpowerToursNFTv8 nft = new EmpowerToursNFTv8(
            treasury,
            wmonToken,
            toursToken
        );

        vm.stopBroadcast();

        console.log("EmpowerToursNFTv8 deployed to:", address(nft));
        console.log("");
        console.log("To verify with Sourcify:");
        console.log("forge verify-contract", address(nft), "src/EmpowerToursNFTv8.sol:EmpowerToursNFTv8 --chain 41454 --verifier sourcify");
    }
}
