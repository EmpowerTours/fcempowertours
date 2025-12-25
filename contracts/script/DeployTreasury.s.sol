// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/EmpowerToursTreasury.sol";

contract DeployTreasury is Script {

    // Current Safe account for delegated transactions
    address constant SAFE_ACCOUNT = 0xDdaE200DBc2874BAd4FdB5e39F227215386c7533;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("==============================================");
        console.log("Deploying EmpowerToursTreasury");
        console.log("==============================================");
        console.log("Deployer:", deployer);
        console.log("Safe Account:", SAFE_ACCOUNT);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Treasury - deployer is owner
        EmpowerToursTreasury treasury = new EmpowerToursTreasury(deployer);
        console.log("Treasury deployed:", address(treasury));

        // Add Safe as operator (so it can deposit on behalf of users)
        treasury.setOperator(SAFE_ACCOUNT, true);
        console.log("Safe authorized as operator");

        vm.stopBroadcast();

        console.log("");
        console.log("==============================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("Treasury:", address(treasury));
        console.log("");
        console.log("Update .env: TREASURY_ADDRESS=", address(treasury));
        console.log("");
        console.log("Verify with:");
        console.log("forge verify-contract <ADDRESS> contracts/EmpowerToursTreasury.sol:EmpowerToursTreasury --chain monad_testnet");
    }
}
