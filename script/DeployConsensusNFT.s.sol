// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ConsensusNFT.sol";

/**
 * Deployment script for ConsensusNFT contract
 * 
 * Deploy to Monad Mainnet:
 * forge script script/DeployConsensusNFT.s.sol:DeployConsensusNFT \
 *   --rpc-url https://rpc.monad.xyz \
 *   --private-key YOUR_PRIVATE_KEY \
 *   --broadcast \
 *   --chain 143
 * 
 * After deployment:
 * 1. Get the contract address from the output
 * 2. Set NEXT_PUBLIC_CONSENSUS_NFT in Railway env
 * 3. Set NEXT_PUBLIC_CONSENSUS_TREASURY in Railway env
 * 4. Backend API will call mint() without authorization
 */
contract DeployConsensusNFT is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the contract
        ConsensusNFT consensusNFT = new ConsensusNFT();
        
        console.log("ConsensusNFT deployed to:", address(consensusNFT));
        
        vm.stopBroadcast();
    }
}
