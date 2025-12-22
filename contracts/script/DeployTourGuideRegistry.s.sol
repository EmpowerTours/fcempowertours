// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../src/TourGuideRegistry.sol";

/**
 * @notice Deploy TourGuideRegistry - FID-Based Tour Guide Marketplace
 *
 * === Monad Testnet Addresses ===
 * PassportNFT: (deployed first)
 * WMON: 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541
 * TOURS: 0x46d048EB424b0A95d5185f39C760c5FA754491d0
 * Platform Wallet: (from .env)
 * Approval Oracle: 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5 (Bot Safe)
 *
 * === Features ===
 * - Two-tier registration: 200+ credit (auto) vs 100-199 credit (manual admin approval)
 * - Free connections: Coffee/advice meetups (like Mirror Mate)
 * - Paid bookings: 90/10 split, max 168 hours
 * - Admin approval flow: Applications → Video call → Approve
 * - Completion tracking: Guide marks → Traveler confirms → Auto-complete (7 days)
 * - Security: ReentrancyGuard, Pausable, rate limiting, anti-self-booking
 */
contract DeployTourGuideRegistry is Script {
    // Monad Testnet addresses
    address constant WMON_TESTNET = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
    address constant TOURS_TESTNET = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
    address constant ORACLE_TESTNET = 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5;

    // Monad Mainnet addresses (placeholder)
    address constant WMON_MAINNET = address(0);
    address constant TOURS_MAINNET = address(0);
    address constant ORACLE_MAINNET = address(0);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Auto-detect network based on chain ID (Monad Mainnet = 143, Testnet = 10143)
        bool isMainnet = block.chainid == 143;

        console.log("=== Deploying TourGuideRegistry ===");
        console.log("Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("Chain ID:", block.chainid);

        address passportNFT = vm.envAddress("PASSPORT_NFT_ADDRESS");
        address wmonToken;
        address toursToken;
        address platformWallet;
        address approvalOracle;

        if (isMainnet) {
            // Mainnet configuration
            wmonToken = WMON_MAINNET;
            toursToken = TOURS_MAINNET;
            platformWallet = vm.envAddress("PLATFORM_WALLET");
            approvalOracle = ORACLE_MAINNET;

            require(wmonToken != address(0), "WMON not deployed to mainnet");
            require(toursToken != address(0), "TOURS not deployed to mainnet");
            require(approvalOracle != address(0), "Oracle not set");
        } else {
            // Testnet configuration
            wmonToken = WMON_TESTNET;
            toursToken = TOURS_TESTNET;
            platformWallet = vm.envAddress("PLATFORM_WALLET");
            approvalOracle = ORACLE_TESTNET;
        }

        require(passportNFT != address(0), "PassportNFT must be deployed first");

        console.log("");
        console.log("Configuration:");
        console.log("  PassportNFT:", passportNFT);
        console.log("  WMON Token:", wmonToken);
        console.log("  TOURS Token:", toursToken);
        console.log("  Platform Wallet:", platformWallet);
        console.log("  Approval Oracle (Bot Safe):", approvalOracle);
        console.log("");

        // Deploy TourGuideRegistry
        TourGuideRegistry registry = new TourGuideRegistry(
            passportNFT,
            wmonToken,
            toursToken,
            platformWallet,
            approvalOracle
        );

        console.log("=== Deployed! ===");
        console.log("TourGuideRegistry:", address(registry));
        console.log("");

        console.log("=== Registration Thresholds ===");
        console.log("Auto-Approve Credit:", registry.AUTO_APPROVE_CREDIT(), "points (200+)");
        console.log("Manual-Approve Credit:", registry.MANUAL_APPROVE_CREDIT(), "points (100-199)");
        console.log("Max Booking Hours:", registry.MAX_BOOKING_HOURS(), "hours (168 = 1 week)");
        console.log("");

        console.log("=== Revenue Split ===");
        console.log("Guide Share:", registry.GUIDE_PERCENTAGE(), "%");
        console.log("Platform Share:", registry.PLATFORM_PERCENTAGE(), "%");
        console.log("");

        console.log("=== Security Features ===");
        console.log("Booking Cooldown:", registry.BOOKING_COOLDOWN() / 60, "minutes");
        console.log("Auto-Complete Period:", registry.AUTO_COMPLETE_PERIOD() / 86400, "days");
        console.log("Max Cancellation Rate:", registry.MAX_CANCELLATION_RATE(), "%");
        console.log("");

        console.log("=== Registration Flow ===");
        console.log("");
        console.log("PATH A: Auto-Approve (200+ Credit)");
        console.log("-------------------------------------");
        console.log("1. User earns 200+ credit score:");
        console.log("   - Base: 100 pts");
        console.log("   - 4 verified venues: 4 x 12 x 2 = 96 pts");
        console.log("   - Total: 196 pts (need 1 more venue or itinerary)");
        console.log("");
        console.log("2. Register as guide:");
        console.log("   registry.registerGuide(");
        console.log("     guideFid,");
        console.log("     passportTokenId,");
        console.log("     ['France', 'Italy'],");
        console.log("     'Local expert in Paris',");
        console.log("     profileImageIPFS,");
        console.log("     50 ether  // 50 WMON/hour (~$1.75/hr)");
        console.log("   );");
        console.log("");
        console.log("PATH B: Manual Approval (100-199 Credit)");
        console.log("-------------------------------------------");
        console.log("1. Apply for approval:");
        console.log("   registry.applyForGuideApproval(");
        console.log("     guideFid,");
        console.log("     passportTokenId,");
        console.log("     ['Thailand'],");
        console.log("     'Bangkok native, 5 years experience',");
        console.log("     profileImageIPFS");
        console.log("   );");
        console.log("");
        console.log("2. Admin reviews application:");
        console.log("   - Video call with applicant");
        console.log("   - Verify credentials, local knowledge");
        console.log("");
        console.log("3. Admin approves on-chain:");
        console.log("   registry.approveGuideApplication(");
        console.log("     guideFid,");
        console.log("     videoCallProofIPFS,");
        console.log("     'Approved after video interview'");
        console.log("   );");
        console.log("");
        console.log("4. User registers as guide:");
        console.log("   registry.registerGuide(...)");
        console.log("");

        console.log("=== Free Connections ===");
        console.log("1. Traveler requests connection:");
        console.log("   registry.requestConnection(");
        console.log("     travelerFid,");
        console.log("     guideFid,");
        console.log("     'coffee',  // 'coffee', 'advice', 'trial'");
        console.log("     'Would love to chat about Bangkok!'");
        console.log("   );");
        console.log("");
        console.log("2. Guide accepts:");
        console.log("   registry.acceptConnection(connectionId, 'Happy to meet!')");
        console.log("");
        console.log("3. Guide declines:");
        console.log("   registry.declineConnection(connectionId, 'Busy this week')");
        console.log("");

        console.log("=== Paid Bookings ===");
        console.log("1. Traveler books guide:");
        console.log("   wmon.approve(registryAddress, totalCost)");
        console.log("   registry.bookGuide(travelerFid, guideFid, 8, wmonAddress)  // 8 hours");
        console.log("");
        console.log("2. Payment: 90% to guide, 10% to platform (instant)");
        console.log("");
        console.log("3. After tour, guide marks complete:");
        console.log("   registry.markTourComplete(bookingId, photoProofIPFS)");
        console.log("");
        console.log("4. Traveler confirms and rates:");
        console.log("   registry.confirmAndRate(bookingId, 500, reviewIPFS)  // 5.00 stars");
        console.log("");
        console.log("5. Or auto-complete after 7 days:");
        console.log("   registry.autoCompleteTour(bookingId)");
        console.log("");

        console.log("=== Admin Functions ===");
        console.log("- setApprovalOracle(address) - Delegate approvals to oracle");
        console.log("- approveGuideApplication(fid, videoProof, notes) - Approve low-credit guide");
        console.log("- rejectGuideApplication(fid, reason) - Reject application");
        console.log("- suspendGuide(fid, reason) - Suspend malicious guide");
        console.log("- unsuspendGuide(fid) - Reinstate guide");
        console.log("- pause() / unpause() - Circuit breaker");
        console.log("");

        console.log("=== View Functions ===");
        console.log("- getGuideByFid(fid) - Guide profile");
        console.log("- getGuidesByCountry(country) - Search by location");
        console.log("- getAllGuides() - All registered guides");
        console.log("- getPendingApplications() - Applications awaiting approval");
        console.log("- getUserBookings(address) - User's booking history");
        console.log("- getFidBookings(fid) - FID's booking history");
        console.log("- getGuideStats(guideFid) - Guide statistics");
        console.log("");

        console.log("=== Verify Contract ===");
        console.log("forge verify-contract", address(registry));
        console.log("  src/TourGuideRegistry.sol:TourGuideRegistry");
        console.log("  --chain-id", block.chainid);
        console.log("  --verifier sourcify");
        console.log("  --constructor-args:");
        console.log("    passportNFT:", passportNFT);
        console.log("    wmonToken:", wmonToken);
        console.log("    toursToken:", toursToken);
        console.log("    platformWallet:", platformWallet);
        console.log("    approvalOracle:", approvalOracle);
        console.log("");

        console.log("=== Update .env ===");
        console.log("NEXT_PUBLIC_TOUR_GUIDE_REGISTRY_ADDRESS=%s", address(registry));

        vm.stopBroadcast();
    }
}
