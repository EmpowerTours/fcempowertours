// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IEmpowerToursNFT {
    function setAuthorizedBurner(address burner, bool authorized) external;
    function authorizedBurners(address) external view returns (bool);
}

contract AuthorizeSafeAsBurner is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Current addresses
        address nftContract = 0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08;
        address safeAccount = 0xDdaE200DBc2874BAd4FdB5e39F227215386c7533;

        vm.startBroadcast(deployerPrivateKey);

        IEmpowerToursNFT nft = IEmpowerToursNFT(nftContract);
        nft.setAuthorizedBurner(safeAccount, true);

        console.log("Authorized Safe Account as burner:");
        console.log("NFT Contract:", nftContract);
        console.log("Safe Account:", safeAccount);

        // Verify authorization
        bool isAuthorized = nft.authorizedBurners(safeAccount);
        console.log("Is Authorized:", isAuthorized);

        vm.stopBroadcast();
    }
}
