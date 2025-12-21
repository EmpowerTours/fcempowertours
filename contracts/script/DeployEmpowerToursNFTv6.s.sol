// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFTv6.sol";

contract DeployEmpowerToursNFTV6 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Constructor arguments
        address treasury = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20; // Safe account
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7; // TOURS token

        vm.startBroadcast(deployerPrivateKey);

        EmpowerToursNFTv6 nft = new EmpowerToursNFTv6(
            treasury,
            toursToken
        );

        vm.stopBroadcast();

        console.log("EmpowerToursNFT V6 deployed to:", address(nft));
    }
}
