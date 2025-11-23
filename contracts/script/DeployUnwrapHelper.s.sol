// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/WMONUnwrapHelper.sol";

contract DeployUnwrapHelper is Script {
    function run() external {
        // Official WMON on Monad Testnet
        address WMON = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        WMONUnwrapHelper helper = new WMONUnwrapHelper(WMON);

        console2.log("=== WMONUnwrapHelper Deployed ===");
        console2.log("WMON_UNWRAP_HELPER=", address(helper));
        console2.log("WMON used:", WMON);

        vm.stopBroadcast();
    }
}
