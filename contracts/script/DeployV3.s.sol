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
 * @title Deploy the v3 contract set
 *
 * @dev v3 and V6 are **one deployment, not several**. `MusicSubscriptionV5` cannot read a v3
 *      master, so a master minted into v3 under the old subscription could never be played or
 *      paid. Deploying these piecemeal produces a system that looks fine and quietly pays nobody.
 *
 *      The wiring order below is the one `test/V3Integration.t.sol` exercises. That test asserts
 *      the step most likely to be skipped — `setController` — because without it nothing can mint
 *      and the failure is total.
 *
 * ## Run
 *
 * ```
 * forge script script/DeployV3.s.sol:DeployV3 \
 *   --rpc-url monad --broadcast --verify -vvv
 * ```
 *
 * Required environment:
 *
 * | var | meaning |
 * |---|---|
 * | `DEPLOYER_PRIVATE_KEY` | pays for the deployment; becomes the initial governance |
 * | `WMON`                 | the payment token |
 * | `REWARD_MANAGER`       | ToursRewardManagerV2 |
 * | `TREASURY`             | receives the platform fee |
 * | `ORACLE`               | PlayOracleV3, the only address allowed to record plays |
 *
 * `GOVERNANCE` and `MODERATOR` are optional and default to the deployer.
 *
 * ## After this script — steps it deliberately does not take
 *
 * These touch **live** contracts, so they are left as explicit manual calls rather than buried
 * in a broadcast:
 *
 *   1. `PlayOracleV3.setMusicSubscription(<MusicSubscriptionV6>)`  — onlyOwner
 *   2. `LiveRadioV3.setNFTContract(<LicenseRegistry>)`             — onlyOwner
 *   3. Fund `SubscriptionReferrals`, or referral commission accrues against an empty pool and
 *      pays nobody.
 *   4. `SubscriptionReferrals.setTrustedRelayer(<the Safe that relays subscriptions>)`, or no
 *      referral is ever recorded on the relayed path.
 *   5. `migrateLegacy` for licence 1000004 on master 3 — the one real outside buyer — and then
 *      `sealMigration()`, which is irreversible.
 *   6. Set the app env vars, then `NEXT_PUBLIC_CONTRACTS_V3=true` last.
 *
 * Re-run `docs/INTEGRATION_MATRIX.md` against the new addresses before flipping the flag.
 */
contract DeployV3 is Script {
    struct Deployed {
        address registry;
        address salesController;
        address subscription;
        address profileRegistry;
        address passport;
        address referrals;
    }

    function run() external returns (Deployed memory out) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address wmon = vm.envAddress("WMON");
        address rewardManager = vm.envAddress("REWARD_MANAGER");
        address treasury = vm.envAddress("TREASURY");
        address oracle = vm.envAddress("ORACLE");

        address governance = vm.envOr("GOVERNANCE", deployer);
        address moderator = vm.envOr("MODERATOR", deployer);

        // Fail here rather than after spending gas on half a deployment.
        require(wmon != address(0), "WMON not set");
        require(rewardManager != address(0), "REWARD_MANAGER not set");
        require(treasury != address(0), "TREASURY not set");
        require(oracle != address(0), "ORACLE not set");

        console2.log("deployer  ", deployer);
        console2.log("governance", governance);

        vm.startBroadcast(pk);

        // 1. The registry. Governance starts as `governance` so it can set the controller below.
        LicenseRegistry registry = new LicenseRegistry(governance);

        // 2. The controller — the only thing the registry will accept mints from.
        SalesController sales =
            new SalesController(registry, IERC20(wmon), governance, treasury);

        // 3. Bind them. NOTHING CAN MINT UNTIL THIS RUNS. Only governance may call it, so this
        //    line only works while the deployer still holds that role — which is why governance
        //    is handed over at the very end and not here.
        require(governance == deployer, "run setController as governance, or do it manually");
        registry.setController(address(sales));

        // 4. Moderation fast path. Content can be taken dark in seconds by this key; only
        //    governance can make that permanent.
        registry.setModerator(moderator);

        // 5. The subscription, reading masters from the registry above.
        MusicSubscriptionV6 subscription =
            new MusicSubscriptionV6(wmon, rewardManager, address(registry), treasury, oracle);

        // 6. Display names for artists with no Farcaster account.
        ProfileRegistry profiles = new ProfileRegistry(governance);

        // 7. Passports. `treasury` receives the mint fee.
        PassportNFTV4 passport = new PassportNFTV4(wmon, oracle, treasury);

        // 8. Referrals. Must point at V6, not V5 — its `subscriptions()` decode is positional
        //    and V5's tuple has an extra field.
        SubscriptionReferrals referrals = new SubscriptionReferrals(
            IMusicSubscription(address(subscription)), IERC20(wmon), governance, treasury
        );

        vm.stopBroadcast();

        out = Deployed({
            registry: address(registry),
            salesController: address(sales),
            subscription: address(subscription),
            profileRegistry: address(profiles),
            passport: address(passport),
            referrals: address(referrals)
        });

        _report(out, registry, sales, subscription);
    }

    function _report(
        Deployed memory out,
        LicenseRegistry registry,
        SalesController sales,
        MusicSubscriptionV6 subscription
    ) private view {
        console2.log("");
        console2.log("=== deployed ===");
        console2.log("LicenseRegistry     ", out.registry);
        console2.log("SalesController     ", out.salesController);
        console2.log("MusicSubscriptionV6 ", out.subscription);
        console2.log("ProfileRegistry     ", out.profileRegistry);
        console2.log("PassportNFTV4       ", out.passport);
        console2.log("SubscriptionReferrals", out.referrals);

        // Read the wiring back off-chain rather than trusting that the calls above landed.
        console2.log("");
        console2.log("=== wiring check ===");
        console2.log("registry.controller  ", registry.controller());
        console2.log("registry.moderator   ", registry.moderator());
        console2.log("registry.governance  ", registry.governance());
        console2.log("sales.registry       ", address(sales.registry()));
        console2.log("subscription.registry", address(subscription.registry()));
        console2.log("subscription.oracle  ", subscription.oracle());

        require(registry.controller() == out.salesController, "controller not set");
        require(address(sales.registry()) == out.registry, "sales points at the wrong registry");
        require(
            address(subscription.registry()) == out.registry,
            "subscription points at the wrong registry"
        );

        console2.log("");
        console2.log("=== env for the app ===");
        console2.log("NEXT_PUBLIC_NFT_CONTRACT=%s", out.registry);
        console2.log("NEXT_PUBLIC_SALES_CONTROLLER=%s", out.salesController);
        console2.log("NEXT_PUBLIC_MUSIC_SUBSCRIPTION=%s", out.subscription);
        console2.log("NEXT_PUBLIC_PROFILE_REGISTRY=%s", out.profileRegistry);
        console2.log("NEXT_PUBLIC_PASSPORT_NFT=%s", out.passport);
        console2.log("NEXT_PUBLIC_SUBSCRIPTION_REFERRALS=%s", out.referrals);
        console2.log("# set NEXT_PUBLIC_CONTRACTS_V3=true LAST, after the two owner calls below");

        console2.log("");
        console2.log("=== still to do by hand ===");
        console2.log("1. PlayOracleV3.setMusicSubscription(%s)", out.subscription);
        console2.log("2. LiveRadioV3.setNFTContract(%s)", out.registry);
        console2.log("3. fund SubscriptionReferrals, else commission accrues against nothing");
        console2.log("4. SubscriptionReferrals.setTrustedRelayer(<relaying Safe>)");
        console2.log("5. migrateLegacy for licence 1000004 on master 3, then sealMigration()");
        console2.log("6. re-run the integration matrix, then flip NEXT_PUBLIC_CONTRACTS_V3");
    }
}
