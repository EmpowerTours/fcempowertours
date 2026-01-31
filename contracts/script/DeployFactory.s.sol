// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../DAOContractFactory.sol";
import "../DeploymentNFT.sol";

/**
 * @notice Deploy DAOContractFactory and DeploymentNFT.
 *
 * Usage:
 *   forge script script/DeployFactory.s.sol:DeployFactory \
 *     --rpc-url monad --broadcast --verify \
 *     -vvvv
 *
 * Requires env vars:
 *   DEPLOYER_PRIVATE_KEY
 *   TIMELOCK_ADDRESS
 *   TOURS_TOKEN
 *   TREASURY_ADDRESS
 *   ENTROPY_ADDRESS          (Pyth Entropy contract on Monad)
 *   FEE_RECIPIENT            (deployer wallet for API fee revenue)
 */
contract DeployFactory is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address timelock = vm.envAddress("TIMELOCK_ADDRESS");
        address toursToken = vm.envAddress("TOURS_TOKEN");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address entropyAddr = vm.envAddress("ENTROPY_ADDRESS");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer); // defaults to deployer

        vm.startBroadcast(deployerKey);

        // 1. Deploy DeploymentNFT
        DeploymentNFT nft = new DeploymentNFT();
        console.log("DeploymentNFT deployed:", address(nft));

        // 2. Deploy DAOContractFactory (with Pyth Entropy + fee recipient)
        DAOContractFactory factory = new DAOContractFactory(
            timelock,
            deployer, // operator = deployer initially
            toursToken,
            address(nft),
            treasury,
            entropyAddr,
            feeRecipient
        );
        console.log("DAOContractFactory deployed:", address(factory));

        // 3. Set factory on DeploymentNFT
        nft.setFactory(address(factory));
        console.log("Factory set on DeploymentNFT");

        vm.stopBroadcast();

        console.log("");
        console.log("=== FACTORY DEPLOYED ===");
        console.log("DeploymentNFT:      ", address(nft));
        console.log("DAOContractFactory: ", address(factory));
        console.log("Entropy:            ", entropyAddr);
        console.log("Fee Recipient:      ", feeRecipient);
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Fund factory with TOURS for reward pool");
        console.log("  2. Fund factory with MON for Pyth Entropy fees");
        console.log("  3. Set NEXT_PUBLIC_DAO_CONTRACT_FACTORY in .env");
    }
}
