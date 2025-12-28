// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract FundLotteryWithWMON is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Addresses
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
        address lotteryContract = 0x8D3d70a5F4eeaE446A70F6f38aBd2adf7c667866;

        // Amount to transfer: 10 WMON for entropy fees
        uint256 amount = 10 ether;

        console.log("=== Fund Lottery Contract with WMON ===");
        console.log("Deployer:", deployer);
        console.log("WMON Token:", wmonToken);
        console.log("Lottery Contract:", lotteryContract);
        console.log("Amount:", amount / 1 ether, "WMON");

        IERC20 wmon = IERC20(wmonToken);

        uint256 deployerBalance = wmon.balanceOf(deployer);
        console.log("Deployer WMON Balance:", deployerBalance / 1 ether, "WMON");

        uint256 lotteryBalanceBefore = wmon.balanceOf(lotteryContract);
        console.log("Lottery Contract Balance Before:", lotteryBalanceBefore / 1 ether, "WMON");

        require(deployerBalance >= amount, "Insufficient WMON balance");

        vm.startBroadcast(deployerPrivateKey);

        bool success = wmon.transfer(lotteryContract, amount);
        require(success, "Transfer failed");

        vm.stopBroadcast();

        uint256 lotteryBalanceAfter = wmon.balanceOf(lotteryContract);
        console.log("Lottery Contract Balance After:", lotteryBalanceAfter / 1 ether, "WMON");
        console.log("=== Transfer Complete ===");
    }
}
