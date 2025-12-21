// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/MonadMirrorNFT.sol";

contract DeployMonadMirror is Script {
    function run() external {
        // Load private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // TOURS token address (update with actual deployed address)
        address toursToken = vm.envAddress("TOURS_TOKEN_ADDRESS");

        // Treasury address (update with your treasury)
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy MonadMirrorNFT
        MonadMirrorNFT monadMirror = new MonadMirrorNFT(
            toursToken,
            treasury
        );

        console.log("MonadMirrorNFT deployed to:", address(monadMirror));
        console.log("TOURS Token:", toursToken);
        console.log("Treasury:", treasury);

        vm.stopBroadcast();
    }
}
