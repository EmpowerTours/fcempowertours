// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IWMON {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract WrapAndFundLottery is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Addresses
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
        address lotteryContract = 0xEFB7d472A717bDb9aEF4308d891eA8eE70C21a4F;

        // Amount to wrap and transfer: 10 WMON for entropy fees
        uint256 amount = 10 ether;

        console.log("=== Wrap MON and Fund Lottery Contract ===");
        console.log("Deployer:", deployer);
        console.log("Deployer MON Balance:", deployer.balance / 1 ether, "MON");
        console.log("WMON Token:", wmonToken);
        console.log("Lottery Contract:", lotteryContract);
        console.log("Amount:", amount / 1 ether, "WMON");

        IWMON wmon = IWMON(wmonToken);

        uint256 lotteryBalanceBefore = wmon.balanceOf(lotteryContract);
        console.log("Lottery Contract WMON Balance Before:", lotteryBalanceBefore / 1 ether, "WMON");

        require(deployer.balance >= amount, "Insufficient MON balance");

        vm.startBroadcast(deployerPrivateKey);

        // Wrap MON to WMON
        wmon.deposit{value: amount}();
        console.log("Wrapped", amount / 1 ether, "MON to WMON");

        // Transfer WMON to lottery contract
        bool success = wmon.transfer(lotteryContract, amount);
        require(success, "Transfer failed");

        vm.stopBroadcast();

        uint256 lotteryBalanceAfter = wmon.balanceOf(lotteryContract);
        console.log("Lottery Contract WMON Balance After:", lotteryBalanceAfter / 1 ether, "WMON");
        console.log("=== Transfer Complete ===");
    }
}
