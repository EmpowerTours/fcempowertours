// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ActionBasedDemandSignal.sol";
import "../contracts/ItineraryNFT.sol";
import "../contracts/MusicBeatMatch.sol";
import "../contracts/CountryCollector.sol";
import "../contracts/PassportNFTv3.sol";
import "../contracts/EmpowerToursYieldStrategyV9.sol";
import "../contracts/MusicLicenseNFTv5.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTOURS is ERC20 {
    constructor() ERC20("TOURS", "TOURS") {
        _mint(msg.sender, 10000000 ether);
    }
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockKintsu {
    mapping(address => uint256) public balances;
    uint96 public totalShares;

    function deposit(uint96 minShares, address receiver) external payable returns (uint96 shares) {
        shares = uint96(msg.value); // 1:1 for simplicity
        balances[receiver] += shares;
        totalShares += shares;
        return shares;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function convertToAssets(uint96 shares) external pure returns (uint96) {
        return shares; // 1:1 for testing
    }

    function convertToShares(uint96 assets) external pure returns (uint96) {
        return assets;
    }

    struct UnlockRequest {
        uint96 shares;
        uint96 spotValue;
        uint40 batchId;
        uint16 exitFeeInBips;
    }

    mapping(address => UnlockRequest[]) public unlockRequests;

    function requestUnlock(uint96 shares, uint96 minSpotValue) external returns (uint96 spotValue) {
        require(balances[msg.sender] >= shares, "Insufficient balance");
        balances[msg.sender] -= shares;
        totalShares -= shares;

        unlockRequests[msg.sender].push(UnlockRequest({
            shares: shares,
            spotValue: shares, // 1:1
            batchId: 0,
            exitFeeInBips: 0
        }));

        return shares;
    }

    function redeem(uint256 unlockIndex, address payable receiver) external returns (uint96 assets) {
        require(unlockIndex < unlockRequests[msg.sender].length, "Invalid index");
        UnlockRequest memory request = unlockRequests[msg.sender][unlockIndex];

        (bool success, ) = receiver.call{value: request.spotValue}("");
        require(success, "Transfer failed");

        return request.spotValue;
    }

    function getAllUserUnlockRequests(address user) external view returns (UnlockRequest[] memory) {
        return unlockRequests[user];
    }

    function cancelUnlockRequest(uint256 unlockIndex) external {
        require(unlockIndex < unlockRequests[msg.sender].length, "Invalid index");
        UnlockRequest memory request = unlockRequests[msg.sender][unlockIndex];

        balances[msg.sender] += request.shares;
        totalShares += request.shares;

        // Remove request
        delete unlockRequests[msg.sender][unlockIndex];
    }

    receive() external payable {}
}

/**
 * @title CompleteIntegrationTest
 * @notice Tests ALL critical protocol flows including staking, demand signals, and venue bookings
 */
contract CompleteIntegrationTest is Test {

    // Contracts
    MockTOURS public tours;
    MockKintsu public kintsu;
    ActionBasedDemandSignal public demandSignal;
    ItineraryNFT public itinerary;
    MusicBeatMatch public beatMatch;
    CountryCollector public collector;
    PassportNFTv3 public passport;
    EmpowerToursYieldStrategyV9 public yieldStrategy;
    MusicLicenseNFTv5 public musicNFT;

    // Test accounts
    address keeper = makeAddr("keeper");
    address backend = makeAddr("backend");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");
    address artist = makeAddr("artist");
    address venue = makeAddr("venue");

    function setUp() public {
        // Deploy mocks
        tours = new MockTOURS();
        kintsu = new MockKintsu();

        // Deploy core contracts
        yieldStrategy = new EmpowerToursYieldStrategyV9(
            address(tours),
            address(kintsu),
            address(0), // tokenSwap
            address(0), // dragonRouter
            keeper
        );

        passport = new PassportNFTv3(address(yieldStrategy));

        musicNFT = new MusicLicenseNFTv5(
            address(this), // treasury
            address(tours)
        );

        demandSignal = new ActionBasedDemandSignal(keeper);
        itinerary = new ItineraryNFT(address(passport), address(tours));
        beatMatch = new MusicBeatMatch(address(tours), keeper);
        collector = new CountryCollector(address(tours), address(passport), keeper);

        // Setup
        demandSignal.authorizeContract(backend, true);

        // Whitelist NFTs in YieldStrategy
        yieldStrategy.whitelistNFT(address(passport), true);
        yieldStrategy.whitelistNFT(address(musicNFT), true);

        // Fund contracts and users
        tours.transfer(address(itinerary), 50000 ether);
        tours.transfer(address(beatMatch), 50000 ether);
        tours.transfer(address(collector), 50000 ether);
        tours.transfer(user1, 10000 ether);
        tours.transfer(user2, 10000 ether);
        tours.transfer(artist, 10000 ether);
        tours.transfer(venue, 10000 ether);

        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(artist, 100 ether);
        vm.deal(venue, 100 ether);
        vm.deal(address(kintsu), 1000 ether);
    }

    // ============================================
    // TEST 1: PASSPORT STAKING WITH MON
    // ============================================

    function test_PassportStakingWithMON() public {
        console.log("\n=== TEST 1: Passport Staking with MON ===");

        // User1 mints passport
        vm.startPrank(user1);
        uint256 passportId = passport.mint{value: 0.01 ether}(
            user1,
            "Mexico",
            "MX",
            "Cancun",
            "Tourist",
            "ipfs://passport"
        );
        console.log("Passport minted:", passportId);

        // User1 stakes 10 MON with passport
        uint256 stakeAmount = 10 ether;
        uint256 positionId = passport.stakeWithPassport{value: stakeAmount}(passportId);
        console.log("Staked 10 MON, position ID:", positionId);

        // Verify staking position
        uint256 stakedAmount = passport.getPassportStakedAmount(passportId);
        assertEq(stakedAmount, stakeAmount);
        console.log("OK - Passport staked amount:", stakedAmount / 1 ether, "MON");

        // Check portfolio value
        uint256 portfolioValue = passport.getPassportPortfolioValue(passportId);
        console.log("Portfolio value:", portfolioValue / 1 ether, "MON");
        assertTrue(portfolioValue >= stakeAmount);

        vm.stopPrank();

        console.log("OK - Passport staking with MON works!");
    }

    // ============================================
    // TEST 2: PASSPORT UNSTAKING (TWO-STEP)
    // ============================================

    function test_PassportUnstaking() public {
        console.log("\n=== TEST 2: Passport Unstaking (Two-Step) ===");

        // Setup: User stakes
        vm.startPrank(user1);
        uint256 passportId = passport.mint{value: 0.01 ether}(
            user1,
            "Mexico",
            "MX",
            "Cancun",
            "Tourist",
            "ipfs://passport"
        );
        uint256 positionId = passport.stakeWithPassport{value: 10 ether}(passportId);
        console.log("Initial stake: 10 MON");

        // Step 1: Request unstake
        uint96 expectedValue = passport.requestUnstake(passportId, positionId);
        console.log("Unstake requested, expected value:", expectedValue / 1 ether, "MON");

        // Step 2: Finalize unstake (simulate cooldown passed)
        uint256 balBefore = user1.balance;
        uint256 refund = passport.finalizeUnstake(passportId, positionId);
        uint256 balAfter = user1.balance;

        console.log("Refund received:", refund / 1 ether, "MON");
        console.log("Balance increase:", (balAfter - balBefore) / 1 ether, "MON");

        assertTrue(balAfter > balBefore);
        console.log("OK - Two-step unstaking works!");

        vm.stopPrank();
    }

    // ============================================
    // TEST 3: MUSIC NFT STAKING WITH MON
    // ============================================

    function test_MusicNFTStakingWithMON() public {
        console.log("\n=== TEST 3: Music NFT Staking with MON ===");

        // Artist creates music NFT
        vm.startPrank(artist);
        tours.approve(address(musicNFT), 1 ether);

        uint256 musicTokenId = musicNFT.mintMaster(
            artist,
            "ipfs://music-metadata",
            "Despacito",
            5 ether // price
        );
        console.log("Music NFT created:", musicTokenId);

        // Artist stakes 20 MON with music NFT
        uint256 stakeAmount = 20 ether;
        uint256 positionId = yieldStrategy.stakeWithDeposit{value: stakeAmount}(
            address(musicNFT),
            musicTokenId,
            artist
        );
        console.log("Staked 20 MON with music NFT, position ID:", positionId);

        // Verify position
        (
            address nftAddress,
            uint256 nftTokenId,
            address owner,
            address beneficiary,
            ,
            uint256 monStaked,
            ,
            ,
            ,

        ) = yieldStrategy.stakingPositions(positionId);

        assertEq(nftAddress, address(musicNFT));
        assertEq(nftTokenId, musicTokenId);
        assertEq(owner, artist);
        assertEq(beneficiary, artist);
        assertEq(monStaked, stakeAmount);

        console.log("OK - Music NFT staking works!");
        console.log("  MON staked:", monStaked / 1 ether);

        vm.stopPrank();
    }

    // ============================================
    // TEST 4: ACTION-BASED DEMAND SIGNAL FLOW
    // ============================================

    function test_ActionBasedDemandSignalFlow() public {
        console.log("\n=== TEST 4: Action-Based Demand Signal Flow ===");

        uint256 artistId = 1;
        string memory location = "Mexico City";

        // Simulate various user actions generating demand
        vm.startPrank(backend);

        // User1 creates itinerary mentioning artist
        demandSignal.recordActionBasedSignal(
            user1,
            location,
            artistId,
            "concert",
            ActionBasedDemandSignal.ActionType.ITINERARY_CREATED
        );
        console.log("Signal 1: ITINERARY_CREATED (weight: 25)");

        // User2 purchases itinerary
        demandSignal.recordActionBasedSignal(
            user2,
            location,
            artistId,
            "concert",
            ActionBasedDemandSignal.ActionType.ITINERARY_PURCHASED
        );
        console.log("Signal 2: ITINERARY_PURCHASED (weight: 25)");

        // User1 stakes music NFT
        demandSignal.recordActionBasedSignal(
            user1,
            location,
            artistId,
            "concert",
            ActionBasedDemandSignal.ActionType.MUSIC_STAKE
        );
        console.log("Signal 3: MUSIC_STAKE (weight: 50)");

        // Multiple users visit venue (passport stamps)
        for (uint i = 0; i < 5; i++) {
            address randomUser = address(uint160(uint256(keccak256(abi.encodePacked(i)))));
            demandSignal.recordActionBasedSignal(
                randomUser,
                location,
                artistId,
                "concert",
                ActionBasedDemandSignal.ActionType.PASSPORT_STAMP
            );
        }
        console.log("Signals 4-8: 5x PASSPORT_STAMP (weight: 100 each)");

        vm.stopPrank();

        // Check total weighted demand
        uint256 weightedDemand = demandSignal.getArtistWeightedDemand(location, artistId);
        // Expected: 25 + 25 + 50 + (5 * 100) = 600
        console.log("Total weighted demand:", weightedDemand);
        assertEq(weightedDemand, 600);

        // Check if threshold met (default: 500)
        bool thresholdMet = demandSignal.isDemandThresholdMet(location, artistId);
        assertTrue(thresholdMet);
        console.log("OK - Demand threshold MET! (600 >= 500)");
    }

    // ============================================
    // TEST 5: VENUE BOOKING WHEN DEMAND IS HIGH
    // ============================================

    function test_VenueBookingWhenDemandHigh() public {
        console.log("\n=== TEST 5: Venue Booking When Artist is Hot ===");

        uint256 artistId = 1;
        string memory location = "Mexico City";

        // Step 1: Build up demand to threshold
        vm.startPrank(backend);
        for (uint i = 0; i < 6; i++) {
            address user = address(uint160(uint256(keccak256(abi.encodePacked(i)))));
            demandSignal.recordActionBasedSignal(
                user,
                location,
                artistId,
                "concert",
                ActionBasedDemandSignal.ActionType.PASSPORT_STAMP
            );
        }
        vm.stopPrank();

        uint256 demand = demandSignal.getArtistWeightedDemand(location, artistId);
        console.log("Demand generated:", demand, "(threshold: 500)");
        assertTrue(demand >= 500);

        // Step 2: Venue sees high demand and creates booking
        vm.startPrank(venue);

        uint256 bookingId = demandSignal.createVenueBooking(
            artistId,
            location,
            "Arena Mexico",
            "Live Concert Event - High Demand",
            block.timestamp + 30 days, // Event in 30 days
            5000 ether, // Artist fee: 5000 TOURS
            50 ether,   // Ticket price: 50 TOURS
            1000        // Expected attendees
        );

        console.log("Venue booking created! ID:", bookingId);

        // Verify booking details
        (
            uint256 id,
            address venueAddress,
            uint256 bookingArtistId,
            string memory bookingLocation,
            string memory venueName,
            ,
            ,
            uint256 artistFee,
            uint256 ticketPrice,
            uint256 expectedAttendees,
            bool artistAccepted,
            bool artistRejected,
            ,
        ) = demandSignal.bookings(bookingId);

        assertEq(id, bookingId);
        assertEq(venueAddress, venue);
        assertEq(bookingArtistId, artistId);
        assertEq(keccak256(bytes(bookingLocation)), keccak256(bytes(location)));
        assertEq(artistFee, 5000 ether);
        assertEq(ticketPrice, 50 ether);
        assertEq(expectedAttendees, 1000);
        assertFalse(artistAccepted);
        assertFalse(artistRejected);

        console.log("OK - Venue booking details:");
        console.log("  Venue:", venueName);
        console.log("  Artist fee:", artistFee / 1 ether, "TOURS");
        console.log("  Ticket price:", ticketPrice / 1 ether, "TOURS");
        console.log("  Expected attendees:", expectedAttendees);

        vm.stopPrank();
    }

    // ============================================
    // TEST 6: ARTIST RESPONDS TO BOOKING
    // ============================================

    function test_ArtistAcceptsBooking() public {
        console.log("\n=== TEST 6: Artist Accepts Venue Booking ===");

        // Setup: Create high demand and venue booking
        uint256 artistId = 1;
        string memory location = "Tokyo";

        vm.startPrank(backend);
        for (uint i = 0; i < 10; i++) {
            demandSignal.recordActionBasedSignal(
                user1,
                location,
                artistId,
                "concert",
                ActionBasedDemandSignal.ActionType.PASSPORT_STAMP
            );
        }
        vm.stopPrank();

        vm.prank(venue);
        uint256 bookingId = demandSignal.createVenueBooking(
            artistId,
            location,
            "Tokyo Dome",
            "Major Concert",
            block.timestamp + 60 days,
            10000 ether,
            100 ether,
            5000
        );

        console.log("Booking created:", bookingId);

        // Artist accepts booking
        vm.prank(artist);
        demandSignal.respondToBooking(bookingId, artistId, true);

        // Verify acceptance
        (,,,,,,,,,, bool artistAccepted, bool artistRejected,,) = demandSignal.bookings(bookingId);
        assertTrue(artistAccepted);
        assertFalse(artistRejected);

        console.log("OK - Artist accepted booking!");
    }

    // ============================================
    // TEST 7: FULL USER JOURNEY WITH STAKING
    // ============================================

    function test_FullUserJourneyWithStaking() public {
        console.log("\n=== TEST 7: Full User Journey (Stake -> Demand -> Booking) ===");

        uint256 artistId = 5;
        string memory location = "Cancun";

        // 1. User mints passport and stakes
        vm.startPrank(user1);
        uint256 passportId = passport.mint{value: 0.01 ether}(
            user1,
            "Mexico",
            "MX",
            "Cancun",
            "Tourist",
            "ipfs://passport"
        );
        passport.stakeWithPassport{value: 15 ether}(passportId);
        console.log("1. User staked 15 MON with passport");
        vm.stopPrank();

        // 2. User creates itinerary
        vm.startPrank(user1);
        uint256 itinId = itinerary.createExperience(
            "Mexico",
            "Cancun",
            "Beach Concert Venue",
            "Amazing beachside concerts!",
            ItineraryNFT.ExperienceType.ENTERTAINMENT,
            21161908,
            -86851528,
            200,
            25 ether,
            "ipfs://beach-photo"
        );
        console.log("2. User created itinerary:", itinId);
        vm.stopPrank();

        // 3. Backend records demand signal
        vm.prank(backend);
        demandSignal.recordActionBasedSignal(
            user1,
            location,
            artistId,
            "beach-concert",
            ActionBasedDemandSignal.ActionType.ITINERARY_CREATED
        );
        console.log("3. Demand signal recorded (ITINERARY_CREATED)");

        // 4. Other users purchase and visit
        vm.startPrank(user2);
        tours.approve(address(itinerary), 25 ether);
        itinerary.purchaseExperience(itinId);
        console.log("4. User2 purchased itinerary");
        vm.stopPrank();

        vm.prank(backend);
        demandSignal.recordActionBasedSignal(
            user2,
            location,
            artistId,
            "beach-concert",
            ActionBasedDemandSignal.ActionType.ITINERARY_PURCHASED
        );

        // 5. Multiple passport stamps (visits)
        vm.startPrank(backend);
        for (uint i = 0; i < 20; i++) {
            address visitor = address(uint160(uint256(keccak256(abi.encodePacked(i, "visitor")))));
            demandSignal.recordActionBasedSignal(
                visitor,
                location,
                artistId,
                "beach-concert",
                ActionBasedDemandSignal.ActionType.PASSPORT_STAMP
            );
        }
        console.log("5. Recorded 20 passport stamps (visits)");
        vm.stopPrank();

        // 6. Check demand
        uint256 totalDemand = demandSignal.getArtistWeightedDemand(location, artistId);
        // 25 + 25 + (20 * 100) = 2050
        console.log("6. Total weighted demand:", totalDemand);
        assertEq(totalDemand, 2050);

        // 7. Venue creates booking (demand is hot!)
        vm.startPrank(venue);
        uint256 bookingId = demandSignal.createVenueBooking(
            artistId,
            location,
            "Cancun Beach Arena",
            "Beach Concert Series",
            block.timestamp + 45 days,
            8000 ether,
            75 ether,
            2000
        );
        console.log("7. Venue created booking:", bookingId);
        vm.stopPrank();

        // 8. Artist accepts
        vm.prank(artist);
        demandSignal.respondToBooking(bookingId, artistId, true);
        console.log("8. Artist accepted booking!");

        console.log("\nOK - Full journey complete:");
        console.log("  - User staked MON");
        console.log("  - Created itinerary");
        console.log("  - Others purchased & visited");
        console.log("  - Demand reached 2050 (hot artist!)");
        console.log("  - Venue booked artist");
        console.log("  - Artist accepted");
    }

    // ============================================
    // TEST 8: DEMAND THRESHOLD NOT MET
    // ============================================

    function test_BookingFailsWhenDemandLow() public {
        console.log("\n=== TEST 8: Booking Fails When Demand Too Low ===");

        uint256 artistId = 99;
        string memory location = "Small Town";

        // Only create small demand (below threshold)
        // Use single MUSIC_PURCHASE action (weight: 10, below threshold of 500)
        vm.prank(backend);
        demandSignal.recordActionBasedSignal(
            user1,
            location,
            artistId,
            "concert",
            ActionBasedDemandSignal.ActionType.MUSIC_PURCHASE
        );

        uint256 demand = demandSignal.getArtistWeightedDemand(location, artistId);
        console.log("Low demand:", demand, "(threshold: 500)");
        assertTrue(demand < 500);

        // Try to create booking (should fail)
        vm.startPrank(venue);
        vm.expectRevert("Demand threshold not met");
        demandSignal.createVenueBooking(
            artistId,
            location,
            "Small Venue",
            "Concert",
            block.timestamp + 30 days,
            1000 ether,
            25 ether,
            100
        );
        console.log("OK - Booking correctly rejected (demand too low)");
        vm.stopPrank();
    }

    // ============================================
    // SUMMARY
    // ============================================

    function test_Summary() public view {
        console.log("\n==========================================");
        console.log("COMPLETE INTEGRATION TEST SUMMARY");
        console.log("==========================================");
        console.log("OK - Passport staking with MON");
        console.log("OK - Passport unstaking (two-step)");
        console.log("OK - Music NFT staking with MON");
        console.log("OK - Action-based demand signals");
        console.log("OK - Venue booking when demand high");
        console.log("OK - Artist booking acceptance");
        console.log("OK - Full user journey");
        console.log("OK - Demand threshold enforcement");
        console.log("==========================================");
        console.log("ALL CRITICAL FLOWS VALIDATED");
        console.log("==========================================");
    }
}
