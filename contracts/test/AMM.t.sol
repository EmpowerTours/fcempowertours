// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {WMON} from "../contracts/WMON.sol";
import {SimpleLiquidityPool} from "../contracts/SimpleLiquidityPool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTOURS is ERC20 {
    constructor() ERC20("TOURS", "TOURS") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AMMTest is Test {
    WMON public wmon;
    MockTOURS public tours;
    SimpleLiquidityPool public pool;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 constant INITIAL_BALANCE = 1000000 ether;

    function setUp() public {
        // Deploy contracts
        tours = new MockTOURS();
        wmon = new WMON();
        pool = new SimpleLiquidityPool(address(tours), address(wmon));

        // Mint TOURS to users
        tours.mint(alice, INITIAL_BALANCE);
        tours.mint(bob, INITIAL_BALANCE);
        tours.mint(charlie, INITIAL_BALANCE);

        // Give users MON
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(charlie, 1000 ether);
    }

    // ========================================================================
    // WMON TESTS
    // ========================================================================

    function test_WMONDeposit() public {
        vm.startPrank(alice);
        wmon.deposit{value: 10 ether}();
        assertEq(wmon.balanceOf(alice), 10 ether);
        assertEq(address(wmon).balance, 10 ether);
        vm.stopPrank();
    }

    function test_WMONWithdraw() public {
        vm.startPrank(alice);
        wmon.deposit{value: 10 ether}();

        uint256 balanceBefore = alice.balance;
        wmon.withdraw(5 ether);

        assertEq(wmon.balanceOf(alice), 5 ether);
        assertEq(alice.balance, balanceBefore + 5 ether);
        vm.stopPrank();
    }

    function test_WMONReceive() public {
        vm.prank(alice);
        (bool success,) = address(wmon).call{value: 10 ether}("");
        assertTrue(success);
        assertEq(wmon.balanceOf(alice), 10 ether);
    }

    // ========================================================================
    // LIQUIDITY TESTS
    // ========================================================================

    function test_AddInitialLiquidity() public {
        uint256 toursAmount = 100 ether;
        uint256 wmonAmount = 10 ether;

        vm.startPrank(alice);

        // Wrap MON
        wmon.deposit{value: wmonAmount}();

        // Approve pool
        tours.approve(address(pool), toursAmount);
        wmon.approve(address(pool), wmonAmount);

        // Add liquidity
        uint256 liquidity = pool.addLiquidity(toursAmount, wmonAmount, 0);

        assertGt(liquidity, 0);
        assertEq(pool.balanceOf(alice), liquidity);
        assertEq(pool.reserveTours(), toursAmount);
        assertEq(pool.reserveWMON(), wmonAmount);

        vm.stopPrank();
    }

    function test_AddSubsequentLiquidity() public {
        // Alice adds initial liquidity
        vm.startPrank(alice);
        wmon.deposit{value: 10 ether}();
        tours.approve(address(pool), 100 ether);
        wmon.approve(address(pool), 10 ether);
        pool.addLiquidity(100 ether, 10 ether, 0);
        vm.stopPrank();

        // Bob adds liquidity at same ratio
        vm.startPrank(bob);
        wmon.deposit{value: 5 ether}();
        tours.approve(address(pool), 50 ether);
        wmon.approve(address(pool), 5 ether);

        uint256 liquidityBob = pool.addLiquidity(50 ether, 5 ether, 0);

        assertGt(liquidityBob, 0);
        assertEq(pool.reserveTours(), 150 ether);
        assertEq(pool.reserveWMON(), 15 ether);

        vm.stopPrank();
    }

    function test_RemoveLiquidity() public {
        // Add liquidity first
        vm.startPrank(alice);
        wmon.deposit{value: 10 ether}();
        tours.approve(address(pool), 100 ether);
        wmon.approve(address(pool), 10 ether);
        uint256 liquidity = pool.addLiquidity(100 ether, 10 ether, 0);

        // Remove half the liquidity
        uint256 toursBalanceBefore = tours.balanceOf(alice);
        uint256 wmonBalanceBefore = wmon.balanceOf(alice);

        (uint256 toursAmount, uint256 wmonAmount) = pool.removeLiquidity(
            liquidity / 2,
            0,
            0
        );

        assertGt(toursAmount, 0);
        assertGt(wmonAmount, 0);
        assertEq(tours.balanceOf(alice), toursBalanceBefore + toursAmount);
        assertEq(wmon.balanceOf(alice), wmonBalanceBefore + wmonAmount);

        vm.stopPrank();
    }

    function test_RevertAddLiquiditySlippage() public {
        vm.startPrank(alice);
        wmon.deposit{value: 10 ether}();
        tours.approve(address(pool), 100 ether);
        wmon.approve(address(pool), 10 ether);

        vm.expectRevert("Slippage: insufficient liquidity minted");
        pool.addLiquidity(100 ether, 10 ether, 1000000 ether);

        vm.stopPrank();
    }

    // ========================================================================
    // SWAP TESTS
    // ========================================================================

    function test_SwapToursForWMON() public {
        // Setup: Alice adds liquidity
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        // Bob swaps TOURS for WMON
        vm.startPrank(bob);
        uint256 toursIn = 10 ether;
        tours.approve(address(pool), toursIn);

        uint256 wmonBalanceBefore = wmon.balanceOf(bob);
        uint256 wmonOut = pool.swapToursForWMON(toursIn, 0);

        assertGt(wmonOut, 0);
        assertEq(wmon.balanceOf(bob), wmonBalanceBefore + wmonOut);

        vm.stopPrank();
    }

    function test_SwapWMONForTours() public {
        // Setup: Alice adds liquidity
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        // Bob swaps WMON for TOURS
        vm.startPrank(bob);
        wmon.deposit{value: 1 ether}();
        wmon.approve(address(pool), 1 ether);

        uint256 toursBalanceBefore = tours.balanceOf(bob);
        uint256 toursOut = pool.swapWMONForTours(1 ether, 0);

        assertGt(toursOut, 0);
        assertEq(tours.balanceOf(bob), toursBalanceBefore + toursOut);

        vm.stopPrank();
    }

    function test_SwapConstantProductFormula() public {
        // Setup: Add liquidity with 10:1 ratio (1000 TOURS : 100 WMON)
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        uint256 k = 1000 ether * 100 ether; // Initial k = x * y

        // Bob swaps 10 TOURS for WMON
        vm.startPrank(bob);
        tours.approve(address(pool), 10 ether);
        pool.swapToursForWMON(10 ether, 0);
        vm.stopPrank();

        // Verify k is approximately maintained (accounting for fees)
        (uint256 reserveTours, uint256 reserveWMON) = pool.getReserves();
        uint256 newK = reserveTours * reserveWMON;

        // k should increase slightly due to fees
        assertGe(newK, k);
    }

    function test_QuoteAccuracy() public {
        // Setup liquidity
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        // Get quote
        uint256 toursIn = 10 ether;
        uint256 quotedWMON = pool.getToursToWMONQuote(toursIn);

        // Execute swap
        vm.startPrank(bob);
        tours.approve(address(pool), toursIn);
        uint256 actualWMON = pool.swapToursForWMON(toursIn, 0);
        vm.stopPrank();

        // Quote should match actual output
        assertEq(quotedWMON, actualWMON);
    }

    function test_RevertSwapSlippage() public {
        // Setup liquidity
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        // Try to swap with unrealistic slippage protection
        vm.startPrank(bob);
        tours.approve(address(pool), 10 ether);

        vm.expectRevert("Slippage: insufficient output");
        pool.swapToursForWMON(10 ether, 100 ether); // Expecting way more than possible

        vm.stopPrank();
    }

    function test_RevertSwapInsufficientLiquidity() public {
        vm.startPrank(bob);
        tours.approve(address(pool), 10 ether);

        vm.expectRevert("Insufficient liquidity");
        pool.swapToursForWMON(10 ether, 0);

        vm.stopPrank();
    }

    // ========================================================================
    // PRICE TESTS
    // ========================================================================

    function test_GetPrice() public {
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        uint256 price = pool.getPrice();

        // Price should be 0.1 WMON per TOURS (100/1000 = 0.1)
        assertEq(price, 0.1 ether);
    }

    function test_PriceImpact() public {
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        uint256 priceBefore = pool.getPrice();

        // Large swap should impact price
        vm.startPrank(bob);
        tours.approve(address(pool), 100 ether);
        pool.swapToursForWMON(100 ether, 0);
        vm.stopPrank();

        uint256 priceAfter = pool.getPrice();

        // Price should decrease (more TOURS relative to WMON)
        assertLt(priceAfter, priceBefore);
    }

    // ========================================================================
    // FEE TESTS
    // ========================================================================

    function test_FeesAccumulateToLP() public {
        // Alice adds liquidity
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        uint256 liquidity = pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        // Record reserves before
        (uint256 reserveToursBefore, uint256 reserveWMONBefore) = pool.getReserves();

        // Bob makes multiple swaps (generates fees)
        vm.startPrank(bob);
        for (uint i = 0; i < 10; i++) {
            tours.approve(address(pool), 10 ether);
            pool.swapToursForWMON(10 ether, 0);
        }
        vm.stopPrank();

        // Reserves should have increased due to fees
        (uint256 reserveToursAfter, uint256 reserveWMONAfter) = pool.getReserves();
        assertGt(reserveToursAfter, reserveToursBefore);

        // Alice removes all liquidity
        vm.startPrank(alice);
        (uint256 toursOut, uint256 wmonOut) = pool.removeLiquidity(liquidity, 0, 0);
        vm.stopPrank();

        // Alice should get more than she put in (due to fees)
        assertGe(toursOut, 1000 ether); // May get slightly less due to swaps changing ratio
    }

    // ========================================================================
    // FUZZ TESTS
    // ========================================================================

    function testFuzz_AddLiquidity(uint256 toursAmount, uint256 wmonAmount) public {
        toursAmount = bound(toursAmount, 0.01 ether, INITIAL_BALANCE);
        wmonAmount = bound(wmonAmount, 0.01 ether, 1000 ether);

        vm.startPrank(alice);
        wmon.deposit{value: wmonAmount}();
        tours.approve(address(pool), toursAmount);
        wmon.approve(address(pool), wmonAmount);

        uint256 liquidity = pool.addLiquidity(toursAmount, wmonAmount, 0);

        assertGt(liquidity, 0);
        assertEq(pool.reserveTours(), toursAmount);
        assertEq(pool.reserveWMON(), wmonAmount);

        vm.stopPrank();
    }

    function testFuzz_Swap(uint256 swapAmount) public {
        // Setup liquidity
        vm.startPrank(alice);
        wmon.deposit{value: 100 ether}();
        tours.approve(address(pool), 1000 ether);
        wmon.approve(address(pool), 100 ether);
        pool.addLiquidity(1000 ether, 100 ether, 0);
        vm.stopPrank();

        // Bound swap to reasonable amount
        swapAmount = bound(swapAmount, 0.01 ether, 50 ether);

        vm.startPrank(bob);
        tours.approve(address(pool), swapAmount);
        uint256 wmonOut = pool.swapToursForWMON(swapAmount, 0);

        assertGt(wmonOut, 0);
        assertLt(wmonOut, 100 ether); // Can't drain the pool

        vm.stopPrank();
    }
}
