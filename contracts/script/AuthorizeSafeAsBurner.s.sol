// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFTv7.sol";

contract AuthorizeSafeAsBurner is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Addresses
        address nftV7 = 0xAD403897CD7d465445aF0BD4fe40f18698655D4e;
        address safeAccount = 0x37302543aeF0b06202adcb06Db36daB05F8237E9;

        vm.startBroadcast(deployerPrivateKey);

        EmpowerToursNFTv7 nft = EmpowerToursNFTv7(nftV7);
        nft.setAuthorizedBurner(safeAccount, true);

        console.log("Authorized Safe Account as burner:");
        console.log("NFT v7:", nftV7);
        console.log("Safe Account:", safeAccount);

        // Verify authorization
        bool isAuthorized = nft.authorizedBurners(safeAccount);
        console.log("Is Authorized:", isAuthorized);

        vm.stopBroadcast();
    }
}
