// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IYieldStrategy {
    function whitelistNFT(address nftAddress, bool accepted) external;
    function acceptedNFTs(address nftAddress) external view returns (bool);
}

contract WhitelistNFTv6 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Contract addresses
        address yieldStrategy = 0x37aC86916Ae673bDFCc9c712057092E57b270f5f; // YieldStrategyV6
        address nftContract = 0x5053ef43F5682E0a24882c2f8e25056D66e5D0f9; // EmpowerToursNFTv6

        vm.startBroadcast(deployerPrivateKey);

        // Whitelist the new NFT contract
        IYieldStrategy(yieldStrategy).whitelistNFT(nftContract, true);

        vm.stopBroadcast();

        // Verify whitelisting
        bool isWhitelisted = IYieldStrategy(yieldStrategy).acceptedNFTs(nftContract);

        console.log("YieldStrategy:", yieldStrategy);
        console.log("NFT Contract:", nftContract);
        console.log("Whitelisted:", isWhitelisted);
    }
}
