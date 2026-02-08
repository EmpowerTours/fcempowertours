// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/AgentMusicNFT.sol";

contract DeployAgentMusicNFT is Script {
    function run() external {
        address emptours = 0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777;
        address tours = 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF;
        address treasury = 0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA;
        
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        AgentMusicNFT nft = new AgentMusicNFT(emptours, tours, treasury);
        
        console.log("AgentMusicNFT deployed to:", address(nft));
        console.log("Deployer address:", deployer);
        
        // Authorize the deployer as a minter
        nft.setAuthorizedMinter(deployer, true);
        console.log("Deployer authorized as minter");
        
        vm.stopBroadcast();
    }
}
