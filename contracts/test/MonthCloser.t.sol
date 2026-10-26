// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "../MonthCloser.sol";
import "./mocks/MockScheduler.sol";

interface IV6View {
    function owner() external view returns (address);
    function lockedWmon() external view returns (uint256);
    function getReserveBalance() external view returns (uint256);
}

interface IPoolView {
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function monthlyPools(uint256) external view returns (uint256 totalWMON, uint256 totalListenPoints, uint256 listenerCount, bool finalized, bool funded);
    function listenerPoints(uint256, address) external view returns (uint256);
}

/// Mainnet-fork replay of the 4 Oct 2026 month-end (month 690) as ONE MonthCloser transaction.
/// Read-only: runs only against a local fork; nothing is broadcast. Skips if MONAD_FORK_RPC is unset.
contract MonthCloserForkTest is Test {
    address constant OWNER = 0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1;
    address constant V6 = 0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B;
    address constant POOL = 0x98c07c35Cc99F0f78b60f001157B5aeC5e2051A7;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant LISTENER = 0x05d1599622915050C4981816ef5E8d51F53dbc7D;
    uint256 constant FORK_BLOCK = 110346246;     // block before the real finalize (0x0f417e8e…)
    uint256 constant AFTER_BLOCK = 110346277;    // block after the real finalizeMonth (0x18017821…)
    uint256 constant M = 690;

    MonthCloser closer;
    address setter = address(0x5E77E5);
    bool noFork;

    function setUp() public {
        string memory rpc = vm.envOr("MONAD_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) { noFork = true; return; }
        vm.createSelectFork(rpc, FORK_BLOCK);
        closer = new MonthCloser(V6, POOL, WMON, OWNER, setter, M);
        // The ownership handover this contract needs (admin action, NOT part of this PR).
        vm.prank(OWNER); IMusicSubscriptionV6Closer(V6).transferOwnership(address(closer));
        vm.prank(OWNER); IListenerRewardPoolCloser(POOL).transferOwnership(address(closer));
        vm.prank(OWNER); closer.acceptPoolOwnership();
        _stage(6);
    }

    function _stage(uint256 pts) internal {
        address[] memory u = new address[](1); uint256[] memory p = new uint256[](1);
        u[0] = LISTENER; p[0] = pts;
        vm.prank(setter); closer.stagePoints(M, u, p);
    }

    function test_Fork_OctMonthEnd_OneTx_MatchesProduction() public {
        if (noFork) return;
        assertEq(IV6View(V6).owner(), address(closer));
        assertEq(IPoolView(POOL).owner(), address(closer));
        uint256 g = gasleft();
        uint256 funded = closer.close(M);
        g -= gasleft();
        console.log("MonthCloser.close(690) gas (excl. 21k intrinsic):", g);
        console.log("production 6 txs gasUsed total: 554053");
        assertEq(funded, 3 ether, "same 3 WMON the owner moved by hand");

        (, , , bool fin) = IMusicSubscriptionV6Closer(V6).monthlyStats(M);
        assertTrue(fin);
        (uint256 tw, uint256 tp, uint256 lc, bool pf, bool pfund) = IPoolView(POOL).monthlyPools(M);
        uint256 lp = IPoolView(POOL).listenerPoints(M, LISTENER);
        uint256 locked = IV6View(V6).lockedWmon();

        // Compare with the state production actually reached after its 6 txs.
        vm.createSelectFork(vm.envString("MONAD_FORK_RPC"), AFTER_BLOCK);
        (uint256 tw2, uint256 tp2, uint256 lc2, bool pf2, bool pfund2) = IPoolView(POOL).monthlyPools(M);
        (, , , bool fin2) = IMusicSubscriptionV6Closer(V6).monthlyStats(M);
        assertEq(tw, tw2); assertEq(tp, tp2); assertEq(lc, lc2); assertEq(pf, pf2); assertEq(pfund, pfund2);
        assertEq(lp, IPoolView(POOL).listenerPoints(M, LISTENER));
        assertEq(fin, fin2);
        assertEq(locked, IV6View(V6).lockedWmon());
    }

    function test_Fork_Atomic_BadPointsRevertsEverything() public {
        if (noFork) return;
        vm.prank(setter);
        closer.stagePoints(M, _one(LISTENER), _one(0)); // pool rejects zero points at step 5
        vm.expectRevert(bytes("Zero points"));
        closer.close(M);
        (, , , bool fin) = IMusicSubscriptionV6Closer(V6).monthlyStats(M);
        assertFalse(fin, "V6 finalize rolled back too");
        assertEq(IV6View(V6).getReserveBalance(), 0);
        assertFalse(closer.closed(M));
    }

    function test_Fork_Idempotent_And_Gates() public {
        if (noFork) return;
        vm.expectRevert(MonthCloser.MonthOpen.selector);
        closer.close(M + 1);
        closer.close(M);
        vm.expectRevert(MonthCloser.AlreadyClosed.selector);
        closer.close(M);
        vm.expectRevert(MonthCloser.AlreadyClosed.selector);
        vm.prank(setter); closer.stagePoints(M, _one(LISTENER), _one(1));
        assertFalse(closer.tick()); // nothing due: month 691 is open
        vm.expectRevert(MonthCloser.NotPointsSetter.selector);
        closer.stagePoints(M + 1, _one(LISTENER), _one(1));
    }

    function test_Fork_NotStaged_DoesNotClose() public {
        if (noFork) return;
        MonthCloser c2 = new MonthCloser(V6, POOL, WMON, OWNER, setter, M);
        vm.expectRevert(MonthCloser.NotStaged.selector);
        c2.close(M);
        assertFalse(c2.tick());
    }

    function test_Fork_BountyPoke_OnlyWhenLate_Once() public {
        if (noFork) return;
        vm.deal(address(closer), 1 ether);
        vm.prank(OWNER); closer.setBounty(0.1 ether);
        address hunter = address(0xB0B);
        // Fork block is ~1 min after month end: inside GRACE, so the close pays no bounty.
        vm.prank(hunter); closer.poke();
        assertEq(hunter.balance, 0);
        vm.prank(hunter); vm.expectRevert(MonthCloser.NothingDue.selector); closer.poke();

        // Next month, staged, closed late by a stranger: bounty paid once.
        // (Month 691's revenue on the fork is whatever V6 holds; the close still runs atomically.)
        vm.warp(closer.monthEnd(M + 1) + 7 hours);
        vm.prank(setter); closer.stagePoints(M + 1, _one(LISTENER), _one(1));
        (uint256 rev,,,) = IMusicSubscriptionV6Closer(V6).monthlyStats(M + 1);
        if (rev == 0 && IV6View(V6).getReserveBalance() == 0) {
            // Pool would reject an unfunded month; nothing to pay out on this fork state.
            vm.prank(hunter); vm.expectRevert(bytes("Not funded")); closer.poke();
            return;
        }
        vm.prank(hunter); closer.poke();
        assertEq(hunter.balance, 0.1 ether);
    }

    function test_Fork_SelfSchedule_ArmsOnce_AndRunsTheClose() public {
        if (noFork) return;
        MockScheduler s = new MockScheduler(200_000);
        vm.prank(OWNER); closer.setScheduler(address(s), 900_000);
        vm.deal(address(closer), 1 ether);
        // Before month end: rewind so the close is in the future.
        vm.warp(closer.monthEnd(M) - 10 minutes);
        assertFalse(closer.tick());
        uint256 armed = closer.armedBlock();
        assertGt(armed, block.number);
        uint256 bal = address(closer).balance;
        for (uint256 i; i < 20; i++) closer.tick(); // spam can't stack scheduled txs
        assertEq(address(closer).balance, bal);
        assertEq(closer.armedBlock(), armed);
        // Precompile fires at the target (pessimistic estimate => never early).
        // Real cadence is 0.3026 s/block; the target was sized at a pessimistic 0.28 s, so at the
        // target block the month has ended. (vm.getBlock* because via-ir caches block.* reads.)
        uint256 dt = (armed - vm.getBlockNumber()) * 3026 / 10_000;
        vm.warp(vm.getBlockTimestamp() + dt);
        vm.roll(armed);
        assertGe(vm.getBlockTimestamp(), closer.monthEnd(M), "never early");
        s.process();
        assertTrue(closer.closed(M), "scheduled tick closed the month");
        assertGt(closer.armedBlock(), armed, "re-armed for the next month");
    }

    function test_Fork_AdminCall_OnlyAdmin_OnlyTargets() public {
        if (noFork) return;
        vm.expectRevert(MonthCloser.NotAdmin.selector);
        closer.adminCall(V6, abi.encodeWithSignature("pause()"));
        vm.prank(OWNER); vm.expectRevert(MonthCloser.BadTarget.selector);
        closer.adminCall(WMON, abi.encodeWithSignature("transfer(address,uint256)", OWNER, 1));
        vm.prank(OWNER); closer.adminCall(V6, abi.encodeWithSignature("pause()"));
        // V6 guard still applies through the closer: no taking money owed to artists.
        uint256 bal = IERC20(WMON).balanceOf(V6);
        vm.prank(OWNER); vm.expectRevert(bytes("Would take money owed to artists"));
        closer.adminCall(V6, abi.encodeWithSignature("emergencyWithdraw(address,uint256)", WMON, bal));
        vm.prank(OWNER); closer.returnOwnership(OWNER);
        assertEq(IV6View(V6).owner(), OWNER);
        assertEq(IPoolView(POOL).pendingOwner(), OWNER);
    }

    function _one(address a) internal pure returns (address[] memory r) { r = new address[](1); r[0] = a; }
    function _one(uint256 a) internal pure returns (uint256[] memory r) { r = new uint256[](1); r[0] = a; }
}
