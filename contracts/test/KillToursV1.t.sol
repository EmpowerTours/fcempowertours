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
 * @title Retiring TOURS V1, rehearsed on a fork before anything is signed
 *
 * @dev Two TOURS tokens exist, both with a 100B supply and neither burned:
 *
 *        V1  0xf61f2b01…  "EmpowerTours Token"
 *        V2  0x45b76a12…  "EmpowerTours Token V2"
 *
 *      Two live tokens under nearly the same name is a standing scam vector — the moment either
 *      is worth anything, the other gets sold as the real one. This rehearses retiring V1.
 *
 *      Every claim here is established by executing the call on forked mainnet state, not by
 *      finding a selector in bytecode. `burn(uint256)` and `pause()` both *probe* as present on
 *      these contracts; a probe finds outbound call sites too, so it proves nothing on its own.
 */
contract KillToursV1Test is Test {
    address constant V1 = 0xf61F2b014e38FfEf66a3A0a8104D36365404f74f;
    address constant OLD_REWARD_MANAGER = 0x7fff35BB27307806B92Fb1D1FBe52D168093eF87;
    address constant DEPLOYER = 0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1;

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

    /// @dev The premise, restated from live state so it cannot rot.
    function test_BothToursTokensExistAndNeitherIsBurned() public onlyForked {
        assertEq(IToursV1(V1).totalSupply(), 100_000_000_000 ether, "V1 is a full 100B");
        assertEq(
            IToursV1(0x45b76a127167fD7FC7Ed264ad490144300eCfcBF).totalSupply(),
            100_000_000_000 ether,
            "V2 is another full 100B"
        );
    }

    /**
     * @dev The burn itself. `burn` reduces `totalSupply` rather than parking tokens at a dead
     *      address, which matters: a dead-address balance still counts as supply on every
     *      explorer and in every market-cap calculation.
     */
    function test_TheDeployerCanActuallyBurnItsV1Balance() public onlyForked {
        uint256 held = IToursV1(V1).balanceOf(DEPLOYER);
        uint256 supplyBefore = IToursV1(V1).totalSupply();
        assertGt(held, 99_000_000_000 ether, "deployer holds essentially all of V1");

        vm.prank(DEPLOYER);
        IToursV1(V1).burn(held);

        assertEq(IToursV1(V1).balanceOf(DEPLOYER), 0, "deployer holds no V1");
        assertEq(
            IToursV1(V1).totalSupply(),
            supplyBefore - held,
            "supply actually fell - this is a real burn, not a transfer to a dead address"
        );

        emit log_named_uint("V1 supply remaining after the burn", IToursV1(V1).totalSupply() / 1e18);
    }

    /**
     * @dev What survives the burn, and why it is not enough to leave alone.
     *
     *      The old reward manager still holds ~20M V1 and is **not paused**, so it can keep
     *      paying out a token we have declared dead. Burning the deployer's balance without
     *      stopping it leaves the one contract that can still mint circulating supply, in effect.
     */
    function test_TheOldRewardManagerStillHoldsAndCanStillPayUntilPaused() public onlyForked {
        assertEq(IOldRewardManager(OLD_REWARD_MANAGER).owner(), DEPLOYER, "we own it");
        assertFalse(IOldRewardManager(OLD_REWARD_MANAGER).paused(), "it is live right now");
        assertGt(
            IToursV1(V1).balanceOf(OLD_REWARD_MANAGER),
            19_000_000 ether,
            "and it is holding ~20M V1"
        );

        vm.prank(DEPLOYER);
        IOldRewardManager(OLD_REWARD_MANAGER).pause();

        assertTrue(IOldRewardManager(OLD_REWARD_MANAGER).paused(), "pause lands");
    }

    /**
     * @dev The residue nobody can reach: ~442 V1 across a handful of outside wallets, paid 5 at a
     *      time by the old manager. It cannot be burned without those holders' consent and it does
     *      not need to be — once the treasury is gone and the manager is paused, what remains is
     *      dust with no issuer behind it.
     *
     *      Correcting the record: an earlier note in this project claimed no third party had ever
     *      been paid TOURS. That was true of V2. On V1 it is not — these are real outside wallets.
     */
    function test_TheOutsideHoldersAreDustAndStayUntouched() public onlyForked {
        address[3] memory outsiders = [
            0x61d7Ae2f6c2c0A95380b96959fFc5Cc865380b49,
            0xc28c035B524f6F4651A9efc49915A6B547aEa15f,
            0x8d041Df23F916Ae24B28b260eD0cBB4Bfb9B606c
        ];

        uint256 total;
        for (uint256 i = 0; i < outsiders.length; i++) {
            total += IToursV1(V1).balanceOf(outsiders[i]);
        }
        assertGt(total, 0, "outside wallets really do hold V1");
        assertLt(total, 1_000 ether, "and it is dust against a 100B supply");

        emit log_named_uint("V1 held by the three largest outside wallets", total / 1e18);
    }

    /// @dev The whole retirement, in the order it should be executed.
    function test_TheFullRetirementSequence() public onlyForked {
        vm.startPrank(DEPLOYER);

        // 1. Stop the old manager first. Burning the treasury while it can still pay would leave
        //    the only remaining source of circulating V1 running.
        IOldRewardManager(OLD_REWARD_MANAGER).pause();

        // 2. Then burn the treasury.
        IToursV1(V1).burn(IToursV1(V1).balanceOf(DEPLOYER));

        vm.stopPrank();

        assertTrue(IOldRewardManager(OLD_REWARD_MANAGER).paused());
        assertEq(IToursV1(V1).balanceOf(DEPLOYER), 0);

        uint256 remaining = IToursV1(V1).totalSupply();
        emit log_named_uint("V1 supply after retirement", remaining / 1e18);
        assertLt(remaining, 25_000_000 ether, "only the manager's locked 20M and dust remain");
    }
}
