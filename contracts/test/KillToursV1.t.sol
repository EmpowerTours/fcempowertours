// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";

interface IToursV1 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function burn(uint256) external;
    function name() external view returns (string memory);
}

interface IOldRewardManager {
    function owner() external view returns (address);
    function paused() external view returns (bool);
    function pause() external;
    function totalDistributed() external view returns (uint256);
}

/**
 * @title TOURS V1 is retired — and must stay retired
 *
 * @dev This file used to rehearse the retirement before it happened. It was executed on mainnet
 *      on 2026-08-21 in two transactions:
 *
 *        pause()  on 0x7fff35BB…  tx 0x38b01711…  block 97976755
 *        burn(99,977,900,000)     tx 0x726f6e83…  block 97976961
 *
 *      The rehearsal predicted `totalSupply` would land at 22,100,000. It did, exactly.
 *
 *      The assertions are now inverted: they no longer prove the retirement *can* happen, they
 *      prove it *has* and has not been undone. That matters because two tokens sharing a name is
 *      the failure this closed — if V1 supply ever grows again, or the old manager is unpaused,
 *      something has gone badly wrong and this suite should be what says so.
 *
 *      Reads a live fork; sends nothing.
 */
contract KillToursV1Test is Test {
    address constant V1 = 0xf61F2b014e38FfEf66a3A0a8104D36365404f74f;
    address constant V2 = 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF;
    address constant OLD_REWARD_MANAGER = 0x7fff35BB27307806B92Fb1D1FBe52D168093eF87;
    address constant DEPLOYER = 0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1;

    /// @dev What the pre-burn rehearsal predicted, and what the chain actually produced.
    uint256 constant V1_SUPPLY_AFTER_RETIREMENT = 22_100_000 ether;
    uint256 constant BURNED = 99_977_900_000 ether;

    bool forked;

    function setUp() public {
        try vm.createSelectFork("monad") {
            forked = true;
        } catch {
            forked = false;
        }
    }

    modifier onlyForked() {
        if (!forked) {
            emit log("SKIPPED: no RPC");
            return;
        }
        _;
    }

    // =====================================================================
    // The retirement, as executed
    // =====================================================================

    function test_V1SupplyIsBurnedDownAndStaysThere() public onlyForked {
        assertEq(
            IToursV1(V1).totalSupply(),
            V1_SUPPLY_AFTER_RETIREMENT,
            "V1 supply moved - it should be frozen at 22.1M with no issuer left to change it"
        );
    }

    function test_TheDeployerHoldsNoV1() public onlyForked {
        assertEq(IToursV1(V1).balanceOf(DEPLOYER), 0, "the treasury was burned and must stay burned");
    }

    /**
     * @dev A real burn, not a dead-address park: 100B minus what was burned equals what remains.
     *      Tokens sent to a dead address still count as supply on every explorer and in every
     *      market-cap figure, which is why the distinction was worth getting right.
     */
    function test_TheBurnActuallyReducedSupply() public onlyForked {
        assertEq(
            100_000_000_000 ether - BURNED,
            V1_SUPPLY_AFTER_RETIREMENT,
            "the arithmetic of the burn"
        );
        assertEq(IToursV1(V1).totalSupply(), 100_000_000_000 ether - BURNED, "and the chain agrees");
    }

    /**
     * @dev The old manager still holds ~20M V1 and cannot be emptied, so `paused` is the only
     *      thing between that balance and circulation. Unpausing it would quietly restart a token
     *      we have declared dead.
     */
    function test_TheOldRewardManagerStaysPaused() public onlyForked {
        assertTrue(
            IOldRewardManager(OLD_REWARD_MANAGER).paused(),
            "the old reward manager was unpaused - it can pay out V1 again"
        );
        assertGt(
            IToursV1(V1).balanceOf(OLD_REWARD_MANAGER),
            19_000_000 ether,
            "it still holds the ~20M that pausing is containing"
        );
        assertEq(IOldRewardManager(OLD_REWARD_MANAGER).owner(), DEPLOYER, "and we still control it");
    }

    /// @dev The residue: dust across outside wallets, harmless without an issuer behind it.
    function test_OnlyDustRemainsOutside() public onlyForked {
        address[3] memory outsiders = [
            0x61d7Ae2f6c2c0A95380b96959fFc5Cc865380b49,
            0xc28c035B524f6F4651A9efc49915A6B547aEa15f,
            0x8d041Df23F916Ae24B28b260eD0cBB4Bfb9B606c
        ];
        uint256 total;
        for (uint256 i = 0; i < outsiders.length; i++) {
            total += IToursV1(V1).balanceOf(outsiders[i]);
        }
        assertLt(total, 1_000 ether, "outside holdings should be dust");
        emit log_named_uint("V1 dust held by the three largest outside wallets", total / 1e18);
    }

    // =====================================================================
    // V2 — deliberately untouched, and still the open decision
    // =====================================================================

    /**
     * @dev V2 was not part of the retirement; this asserts it was not touched by accident. It is
     *      also the standing reminder that 100B on one key is why the modelled per-token value is
     *      what it is. See docs/TOURS_ECONOMICS.md.
     */
    function test_V2IsUntouchedAndStillTheOpenQuestion() public onlyForked {
        assertEq(IToursV1(V2).totalSupply(), 100_000_000_000 ether, "V2 supply changed unexpectedly");
        assertGt(
            IToursV1(V2).balanceOf(DEPLOYER),
            99_000_000_000 ether,
            "V2 is still concentrated on one key - burning it is the open decision"
        );
    }

    /// @dev Two distinct contracts. Retiring one must never touch the other.
    function test_TheTwoTokensRemainSeparate() public onlyForked {
        assertTrue(V1 != V2, "distinct addresses");
        assertGt(IToursV1(V2).totalSupply(), IToursV1(V1).totalSupply(), "V2 dwarfs the retired V1");
    }
}
