// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWMON {
    function deposit() external payable;
    function balanceOf(address) external view returns (uint256);
}

interface ISimpleLiquidityPool {
    function addLiquidity(
        uint256 toursAmount,
        uint256 wmonAmount,
        uint256 minLiquidity
    ) external returns (uint256 liquidity);
    function balanceOf(address) external view returns (uint256);
}

contract AddInitialLiquidity is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Contract addresses
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        address officialWMON = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;
        address pool = 0xE0DCc1242C93ce1e0884aEf630942b74C33C4ab6;

        // Amounts
        uint256 monToWrap = 2 ether; // 2 MON
        uint256 toursAmount = 10_000 ether; // 10,000 TOURS

        console2.log("=== Adding Initial Liquidity ===");
        console2.log("Deployer:", deployer);
        console2.log("MON to wrap:", monToWrap / 1e18);
        console2.log("TOURS amount:", toursAmount / 1e18);

        vm.startBroadcast(deployerPrivateKey);

        // Check deployer's MON balance
        uint256 monBalance = deployer.balance;
        console2.log("\nDeployer MON balance:", monBalance / 1e18);
        require(monBalance >= monToWrap, "Insufficient MON balance");

        // Check deployer's TOURS balance
        uint256 toursBalance = IERC20(toursToken).balanceOf(deployer);
        console2.log("Deployer TOURS balance:", toursBalance / 1e18);
        require(toursBalance >= toursAmount, "Insufficient TOURS balance");

        // Step 1: Wrap MON to WMON
        console2.log("\n1. Wrapping", monToWrap / 1e18, "MON to WMON...");
        IWMON(officialWMON).deposit{value: monToWrap}();
        uint256 wmonBalance = IWMON(officialWMON).balanceOf(deployer);
        console2.log("   WMON balance after wrap:", wmonBalance / 1e18);

        // Step 2: Approve TOURS to pool
        console2.log("\n2. Approving TOURS to pool...");
        IERC20(toursToken).approve(pool, toursAmount);
        console2.log("   TOURS approved:", toursAmount / 1e18);

        // Step 3: Approve WMON to pool
        console2.log("\n3. Approving WMON to pool...");
        IERC20(officialWMON).approve(pool, monToWrap);
        console2.log("   WMON approved:", monToWrap / 1e18);

        // Step 4: Add liquidity (minLiquidity = 0 for first deposit, accepting any amount)
        console2.log("\n4. Adding liquidity to pool...");
        uint256 lpTokens = ISimpleLiquidityPool(pool).addLiquidity(
            toursAmount,
            monToWrap,
            0 // minLiquidity - set to 0 for initial liquidity
        );

        console2.log("   LP tokens received:", lpTokens / 1e18);

        // Check final balances
        uint256 finalLPBalance = ISimpleLiquidityPool(pool).balanceOf(deployer);
        console2.log("\n=== Final Balances ===");
        console2.log("LP Token balance:", finalLPBalance / 1e18);
        console2.log("TOURS balance:", IERC20(toursToken).balanceOf(deployer) / 1e18);
        console2.log("WMON balance:", IWMON(officialWMON).balanceOf(deployer) / 1e18);
        console2.log("MON balance:", deployer.balance / 1e18);

        console2.log("\nLiquidity added successfully!");
        console2.log("Pool is now ready for TOURS <-> WMON swaps");

        vm.stopBroadcast();
    }
}
