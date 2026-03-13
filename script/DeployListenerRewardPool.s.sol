// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "../contracts/ListenerRewardPool.sol";

contract DeployListenerRewardPool is Script {
    function run() external {
        address wmon = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        ListenerRewardPool pool = new ListenerRewardPool(wmon);

        console.log("ListenerRewardPool deployed to:", address(pool));
        console.log("Deployer (owner):", deployer);
        console.log("WMON token:", wmon);

        vm.stopBroadcast();
    }
}
