// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract FundNFTWithTours is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Addresses
        address toursToken = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
        address nftContract = 0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08;

        // Amount to transfer: 1000 TOURS (enough for 200 burns at 5 TOURS each)
        uint256 amount = 1000 ether;

        console.log("=== Fund NFT Contract with TOURS ===");
        console.log("Deployer:", deployer);
        console.log("TOURS Token:", toursToken);
        console.log("NFT Contract:", nftContract);
        console.log("Amount:", amount / 1 ether, "TOURS");

        IERC20 tours = IERC20(toursToken);

        uint256 deployerBalance = tours.balanceOf(deployer);
        console.log("Deployer TOURS Balance:", deployerBalance / 1 ether, "TOURS");

        uint256 nftBalanceBefore = tours.balanceOf(nftContract);
        console.log("NFT Contract Balance Before:", nftBalanceBefore / 1 ether, "TOURS");

        vm.startBroadcast(deployerPrivateKey);

        bool success = tours.transfer(nftContract, amount);
        require(success, "Transfer failed");

        vm.stopBroadcast();

        uint256 nftBalanceAfter = tours.balanceOf(nftContract);
        console.log("NFT Contract Balance After:", nftBalanceAfter / 1 ether, "TOURS");
        console.log("=== Transfer Complete ===");
    }
}
