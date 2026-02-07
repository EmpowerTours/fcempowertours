// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerTweaks.sol";

/**
 * @title DeployEmpowerTweaks
 * @notice Deployment script for EmpowerTweaks contract on Monad
 *
 * Usage:
 *   forge script script/DeployEmpowerTweaks.s.sol:DeployEmpowerTweaks \
 *     --rpc-url $MONAD_RPC \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast \
 *     --verify
 */
contract DeployEmpowerTweaks is Script {
    // Monad Mainnet addresses
    address constant TOURS_TOKEN = 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF;
    address constant WMON_TOKEN = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;

    // Fee recipient (EmpowerTours treasury)
    address constant FEE_RECIPIENT = 0x4f9e1B8B0fDcE6D2E8e8f8E8e8e8e8e8e8e8e8e8; // Update with actual treasury

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying EmpowerTweaks...");
        console.log("Deployer:", deployer);
        console.log("TOURS Token:", TOURS_TOKEN);
        console.log("WMON Token:", WMON_TOKEN);
        console.log("Fee Recipient:", FEE_RECIPIENT);

        vm.startBroadcast(deployerPrivateKey);

        EmpowerTweaks empowerTweaks = new EmpowerTweaks(
            TOURS_TOKEN,
            WMON_TOKEN,
            FEE_RECIPIENT
        );

        console.log("EmpowerTweaks deployed at:", address(empowerTweaks));

        vm.stopBroadcast();

        // Log deployment info
        console.log("\n=== Deployment Complete ===");
        console.log("Contract Address:", address(empowerTweaks));
        console.log("Platform Fee:", empowerTweaks.platformFeeBps(), "bps (2.5%)");
        console.log("\nAdd to .env:");
        console.log("NEXT_PUBLIC_EMPOWERTWEAKS_CONTRACT=", address(empowerTweaks));
    }
}
