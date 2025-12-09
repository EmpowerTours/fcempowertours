// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/CountryCollectorV2.sol";

contract DeployCountryCollectorV2Updated is Script {
    function run() external {
        // Configuration
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        address keeper = 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9; // Your deployer address

        console.log("=== Deploying CountryCollectorV2 (Rewards with TOURS) ===");
        console.log("TOURS Token:", toursToken);
        console.log("Keeper:", keeper);
        console.log("");

        vm.startBroadcast();

        CountryCollectorV2 collector = new CountryCollectorV2(
            toursToken,
            keeper
        );

        vm.stopBroadcast();

        console.log("CountryCollectorV2 deployed to:", address(collector));
        console.log("");
        console.log("To verify with Sourcify:");
        console.log("forge verify-contract", address(collector), "contracts/CountryCollectorV2.sol:CountryCollectorV2 --chain 41454 --verifier sourcify");
    }
}
