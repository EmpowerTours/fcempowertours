// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "../contracts/AgentBreeding.sol";

contract DeployAgentBreeding is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Contract addresses
        address agentMusicNFT = 0xeA2A73efA11ccA7A90dbc6865A0F184DbA6d7377;
        address emptours = 0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777;
        address tours = 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF;
        address treasury = 0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA;

        vm.startBroadcast(deployerPrivateKey);

        AgentBreeding breeding = new AgentBreeding(
            agentMusicNFT,
            emptours,
            tours,
            treasury
        );

        console.log("AgentBreeding deployed at:", address(breeding));

        // Authorize deployer as breeder
        breeding.setAuthorizedBreeder(vm.addr(deployerPrivateKey), true);
        console.log("Deployer authorized as breeder");

        vm.stopBroadcast();
    }
}
