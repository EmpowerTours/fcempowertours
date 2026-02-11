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
 *   --verify \
 *   --verifier etherscan \
 *   --etherscan-api-key YOUR_MONADSCAN_API_KEY \
 *   --chain 10143
 * 
 * After deployment:
 * 1. Get the contract address from the output
 * 2. Set NEXT_PUBLIC_CONSENSUS_NFT in Railway env
 * 3. Call authorizeMinter(backendAddress) to authorize the API minter
 */
contract DeployConsensusNFT is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the contract
        ConsensusNFT consensusNFT = new ConsensusNFT();
        
        console.log("ConsensusNFT deployed to:", address(consensusNFT));
        
        vm.stopBroadcast();
    }
}
