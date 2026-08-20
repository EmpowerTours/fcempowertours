// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "../v3/LicenseRegistry.sol";
import "../v3/SalesController.sol";
import "../v3/ProfileRegistry.sol";
import "../v3/SubscriptionReferrals.sol";
import "../MusicSubscriptionV6.sol";
import "../PassportNFTV4.sol";

/**
 * @title Deploy the v3 set one contract at a time
 *
 * @dev Same six contracts and the same order as `DeployV3.s.sol`, split so each is its own
 *      broadcast. Use this one for mainnet.
 *
 *      Deploying separately does not change any contract's ABI — each is compiled from its own
 *      artifact either way. What it does buy is worth having:
 *
 *        - `--verify` runs against a single contract, so a verification failure is unambiguous
 *          rather than one line in a six-contract batch (this repo builds with `via_ir`, where
 *          batch verification is the flakier path)
 *        - each address can be eyeballed before it becomes a constructor argument to the next
 *        - a failure halfway leaves a state you can read, not one you have to reconstruct
 *
 *      **Order matters and is not cosmetic.** Steps 2, 3 and 6 take addresses produced by earlier
 *      steps, and until step 2b runs the registry has no controller and nothing can mint at all.
 *
 * ## Running
 *
 * Export the previous step's address before each step that needs it. Every step prints the exact
 * line to export next.
 *
 * ```
 * cd contracts
 * export WMON=0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
 * export REWARD_MANAGER=0x056452a44d81AB502e24510b2e4FB1789C6faf85
 * export TREASURY=0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1
 * export ORACLE=0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf
 *
 * FLAGS="--rpc-url monad --broadcast --legacy --verify \
 *        --verifier-url https://api.etherscan.io/v2/api?chainid=143"
 *
 * forge script script/DeployV3Steps.s.sol:Step1_LicenseRegistry      $FLAGS
 * export REGISTRY=0x...
 * forge script script/DeployV3Steps.s.sol:Step2_SalesController      $FLAGS
 * export SALES_CONTROLLER=0x...
 * forge script script/DeployV3Steps.s.sol:Step2b_SetController       $FLAGS
 * forge script script/DeployV3Steps.s.sol:Step3_MusicSubscriptionV6  $FLAGS
 * export SUBSCRIPTION=0x...
 * forge script script/DeployV3Steps.s.sol:Step4_ProfileRegistry      $FLAGS
 * forge script script/DeployV3Steps.s.sol:Step5_PassportNFTV4        $FLAGS
 * forge script script/DeployV3Steps.s.sol:Step6_SubscriptionReferrals $FLAGS
 * forge script script/DeployV3Steps.s.sol:VerifyWiring --rpc-url monad
 * ```
 *
 * `VerifyWiring` broadcasts nothing — it reads the deployed set back and reverts if anything is
 * pointed at the wrong place.
 */
abstract contract StepBase is Script {
    function pk() internal view returns (uint256) {
        return vm.envUint("DEPLOYER_PRIVATE_KEY");
    }

    function deployer() internal view returns (address) {
        return vm.addr(pk());
    }

    function governance() internal view returns (address) {
        return vm.envOr("GOVERNANCE", deployer());
    }

    function req(string memory name) internal view returns (address a) {
        a = vm.envAddress(name);
        require(a != address(0), string(abi.encodePacked(name, " is not set")));
    }

    function done(string memory label, string memory exportName, address addr) internal pure {
        console2.log("");
        console2.log("=== deployed ===");
        console2.log(label, addr);
        console2.log("");
        console2.log("Next, export this before the following step:");
        console2.log(string(abi.encodePacked("  export ", exportName, "=%s")), addr);
    }
}

// ---------------------------------------------------------------- 1

contract Step1_LicenseRegistry is StepBase {
    function run() external returns (address) {
        vm.startBroadcast(pk());
        LicenseRegistry registry = new LicenseRegistry(governance());
        vm.stopBroadcast();

        done("LicenseRegistry", "REGISTRY", address(registry));
        console2.log("  export NEXT_PUBLIC_NFT_CONTRACT=%s", address(registry));
        return address(registry);
    }
}

// ---------------------------------------------------------------- 2

contract Step2_SalesController is StepBase {
    function run() external returns (address) {
        LicenseRegistry registry = LicenseRegistry(req("REGISTRY"));

        vm.startBroadcast(pk());
        SalesController sales = new SalesController(
            registry, IERC20(req("WMON")), governance(), req("TREASURY")
        );
        vm.stopBroadcast();

        done("SalesController", "SALES_CONTROLLER", address(sales));
        console2.log("  export NEXT_PUBLIC_SALES_CONTROLLER=%s", address(sales));
        console2.log("");
        console2.log("!! Run Step2b_SetController next. Until then NOTHING CAN MINT.");
        return address(sales);
    }
}

/**
 * @dev Binds the controller to the registry. Separated from step 2 because it is a *governance*
 *      call rather than a deployment: if governance has already been handed to a multisig or
 *      timelock, this step is made there instead and the script will revert here.
 */
contract Step2b_SetController is StepBase {
    function run() external {
        LicenseRegistry registry = LicenseRegistry(req("REGISTRY"));
        address sales = req("SALES_CONTROLLER");

        require(
            registry.governance() == deployer(),
            "governance is not the deployer - call setController from whoever holds it"
        );

        vm.startBroadcast(pk());
        registry.setController(sales);
        // Moderation fast path: takes content dark in seconds. Only governance can make a
        // takedown permanent, so this key is deliberately the weaker of the two.
        registry.setModerator(vm.envOr("MODERATOR", deployer()));
        vm.stopBroadcast();

        require(registry.controller() == sales, "setController did not land");
        console2.log("controller wired:", registry.controller());
        console2.log("moderator wired :", registry.moderator());
    }
}

// ---------------------------------------------------------------- 3

contract Step3_MusicSubscriptionV6 is StepBase {
    function run() external returns (address) {
        vm.startBroadcast(pk());
        MusicSubscriptionV6 subscription = new MusicSubscriptionV6(
            req("WMON"),
            req("REWARD_MANAGER"),
            req("REGISTRY"),
            req("TREASURY"),
            req("ORACLE")
        );
        vm.stopBroadcast();

        done("MusicSubscriptionV6", "SUBSCRIPTION", address(subscription));
        console2.log("  export NEXT_PUBLIC_MUSIC_SUBSCRIPTION=%s", address(subscription));
        return address(subscription);
    }
}

// ---------------------------------------------------------------- 4

contract Step4_ProfileRegistry is StepBase {
    function run() external returns (address) {
        vm.startBroadcast(pk());
        ProfileRegistry profiles = new ProfileRegistry(governance());
        vm.stopBroadcast();

        done("ProfileRegistry", "PROFILE_REGISTRY", address(profiles));
        console2.log("  export NEXT_PUBLIC_PROFILE_REGISTRY=%s", address(profiles));
        return address(profiles);
    }
}

// ---------------------------------------------------------------- 5

contract Step5_PassportNFTV4 is StepBase {
    function run() external returns (address) {
        vm.startBroadcast(pk());
        PassportNFTV4 passport =
            new PassportNFTV4(req("WMON"), req("ORACLE"), req("TREASURY"));
        vm.stopBroadcast();

        done("PassportNFTV4", "PASSPORT", address(passport));
        console2.log("  export NEXT_PUBLIC_PASSPORT_NFT=%s", address(passport));
        return address(passport);
    }
}

// ---------------------------------------------------------------- 6

contract Step6_SubscriptionReferrals is StepBase {
    function run() external returns (address) {
        // Must point at V6. Its `subscriptions()` decode is positional and V5's tuple carries an
        // extra field, so aiming this at the old contract reads the wrong slot without erroring.
        address subscription = req("SUBSCRIPTION");

        vm.startBroadcast(pk());
        SubscriptionReferrals referrals = new SubscriptionReferrals(
            IMusicSubscription(subscription),
            IERC20(req("WMON")),
            governance(),
            req("TREASURY")
        );
        vm.stopBroadcast();

        done("SubscriptionReferrals", "REFERRALS", address(referrals));
        console2.log("  export NEXT_PUBLIC_SUBSCRIPTION_REFERRALS=%s", address(referrals));
        console2.log("");
        console2.log("Fund it and setTrustedRelayer(<relaying Safe>), or no referral is recorded.");
        return address(referrals);
    }
}

// ---------------------------------------------------------------- check

/// @dev Reads the deployed set back. Broadcasts nothing; reverts if anything is misaimed.
contract VerifyWiring is StepBase {
    function run() external view {
        LicenseRegistry registry = LicenseRegistry(req("REGISTRY"));
        SalesController sales = SalesController(req("SALES_CONTROLLER"));
        MusicSubscriptionV6 subscription = MusicSubscriptionV6(req("SUBSCRIPTION"));

        console2.log("registry.controller   ", registry.controller());
        console2.log("registry.governance   ", registry.governance());
        console2.log("registry.moderator    ", registry.moderator());
        console2.log("sales.registry        ", address(sales.registry()));
        console2.log("subscription.registry ", address(subscription.registry()));
        console2.log("subscription.oracle   ", subscription.oracle());
        console2.log("subscription.treasury ", subscription.treasury());

        require(registry.controller() == address(sales), "registry.controller != SalesController");
        require(address(sales.registry()) == address(registry), "sales points at the wrong registry");
        require(
            address(subscription.registry()) == address(registry),
            "subscription points at the wrong registry"
        );
        require(subscription.oracle() == req("ORACLE"), "subscription.oracle != ORACLE");

        console2.log("");
        console2.log("All wiring checks passed.");
        console2.log("Still by hand: PlayOracleV3.setMusicSubscription, LiveRadioV3.setNFTContract,");
        console2.log("fund+setTrustedRelayer on referrals, migrateLegacy then sealMigration,");
        console2.log("then NEXT_PUBLIC_CONTRACTS_V3=true LAST.");
    }
}
