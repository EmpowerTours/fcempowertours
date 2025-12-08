// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ExperienceNFT.sol";

/**
 * @title DeployExperienceNFT
 * @notice Deployment script for ExperienceNFT contract on Monad Testnet
 *
 * DEPLOYMENT:
 *   forge script script/DeployExperienceNFT.s.sol:DeployExperienceNFT \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --broadcast \
 *     --slow
 *
 * VERIFICATION (using Sourcify):
 *   forge verify-contract <CONTRACT_ADDRESS> \
 *     ExperienceNFT \
 *     --chain 41454 \
 *     --verifier sourcify \
 *     --watch
 *
 * Required env vars:
 *   - DEPLOYER_PRIVATE_KEY
 *   - WMON_ADDRESS (Wrapped MON token)
 */
contract DeployExperienceNFT is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address wmonAddress = vm.envAddress("WMON_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy ExperienceNFT
        ExperienceNFT experienceNFT = new ExperienceNFT(wmonAddress);

        console.log("ExperienceNFT deployed to:", address(experienceNFT));
        console.log("WMON Token:", wmonAddress);

        vm.stopBroadcast();

        // Print deployment info
        console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
        console.log("Contract Address:", address(experienceNFT));
        console.log("Chain: Monad Testnet (41454)");

        console.log("\n=== VERIFY ON MONADSCAN (Sourcify) ===");
        console.log("forge verify-contract %s \\", address(experienceNFT));
        console.log("  ExperienceNFT \\");
        console.log("  --chain 41454 \\");
        console.log("  --verifier sourcify \\");
        console.log("  --constructor-args $(cast abi-encode \"constructor(address)\" %s) \\", wmonAddress);
        console.log("  --watch");

        console.log("\n=== Add to .env.local ===");
        console.log("NEXT_PUBLIC_EXPERIENCE_NFT=%s", address(experienceNFT));

        console.log("\n=== Fund contract with WMON for rewards ===");
        console.log("cast send %s \\", wmonAddress);
        console.log("  \"approve(address,uint256)\" \\");
        console.log("  %s \\", address(experienceNFT));
        console.log("  100000000000000000000000 \\");
        console.log("  --rpc-url https://testnet-rpc.monad.xyz \\");
        console.log("  --private-key $DEPLOYER_PRIVATE_KEY");
        console.log("");
        console.log("cast send %s \\", address(experienceNFT));
        console.log("  \"fundRewards(uint256)\" \\");
        console.log("  100000000000000000000000 \\");
        console.log("  --rpc-url https://testnet-rpc.monad.xyz \\");
        console.log("  --private-key $DEPLOYER_PRIVATE_KEY");

        console.log("\n=== View on Monadscan ===");
        console.log("https://testnet.monadscan.com/address/%s", address(experienceNFT));
    }
}
