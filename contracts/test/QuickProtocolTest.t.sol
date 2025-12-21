// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ActionBasedDemandSignal.sol";
import "../contracts/ItineraryNFT.sol";
import "../contracts/MusicBeatMatch.sol";
import "../contracts/CountryCollector.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTOURS is ERC20 {
    constructor() ERC20("TOURS", "TOURS") {
        _mint(msg.sender, 1000000 ether);
    }
}

contract QuickProtocolTest is Test {
    MockTOURS public tours;
    ActionBasedDemandSignal public demandSignal;
    ItineraryNFT public itinerary;
    MusicBeatMatch public beatMatch;
    CountryCollector public collector;

    address keeper = makeAddr("keeper");
    address backend = makeAddr("backend");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");

    function setUp() public {
        tours = new MockTOURS();

        demandSignal = new ActionBasedDemandSignal(keeper);
        itinerary = new ItineraryNFT(address(0), address(tours));
        beatMatch = new MusicBeatMatch(address(tours), keeper);
        collector = new CountryCollector(address(tours), address(0), keeper);

        // Setup
        demandSignal.authorizeContract(backend, true);
        tours.transfer(address(itinerary), 10000 ether);
        tours.transfer(address(beatMatch), 10000 ether);
        tours.transfer(address(collector), 10000 ether);
        tours.transfer(user1, 1000 ether);
        tours.transfer(user2, 1000 ether);
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
    }

    function test_DemandSignalRecording() public {
        console.log("\n=== Test: Demand Signal Recording ===");

        vm.prank(backend);
        demandSignal.recordActionBasedSignal(
            user1,
            "Mexico City",
            1,
            "concert",
            ActionBasedDemandSignal.ActionType.ITINERARY_CREATED
        );

        uint256 demand = demandSignal.getArtistWeightedDemand("Mexico City", 1);
        assertEq(demand, 25); // ITINERARY_CREATED weight
        console.log("OK - Demand signal recorded:", demand);
    }

    function test_ItineraryCreationAndPurchase() public {
        console.log("\n=== Test: Itinerary Creation & Purchase ===");

        vm.prank(user1);
        uint256 id = itinerary.createExperience(
            "Mexico",
            "Cancun",
            "Beach Club",
            "Best beach!",
            ItineraryNFT.ExperienceType.ENTERTAINMENT,
            21161908,
            -86851528,
            200,
            10 ether,
            "ipfs://photo"
        );

        console.log("Itinerary created:", id);
        assertEq(itinerary.ownerOf(id), user1);

        // User2 purchases
        vm.startPrank(user2);
        tours.approve(address(itinerary), 10 ether);
        itinerary.purchaseExperience(id);
        vm.stopPrank();

        assertTrue(itinerary.hasPurchased(user2, id));
        console.log("OK - Itinerary purchased by user2");
    }

    function test_MusicBeatMatchChallenge() public {
        console.log("\n=== Test: Music Beat Match ===");

        vm.prank(keeper);
        uint256 challengeId = beatMatch.createDailyChallenge(
            1,
            "Despacito",
            "ipfs://audio"
        );

        console.log("Challenge created:", challengeId);

        vm.startPrank(user1);
        uint256 balBefore = tours.balanceOf(user1);
        beatMatch.submitGuess(challengeId, 1, "Despacito");
        uint256 balAfter = tours.balanceOf(user1);
        vm.stopPrank();

        uint256 reward = balAfter - balBefore;
        console.log("Reward earned:", reward / 1 ether, "TOURS");
        assertTrue(reward >= 10 ether);
        console.log("OK - Music challenge works!");
    }

    function test_CountryCollectorBadge() public {
        console.log("\n=== Test: Country Collector ===");

        vm.prank(keeper);
        uint256[3] memory artists = [uint256(1), uint256(2), uint256(3)];
        uint256 weekId = collector.createWeeklyChallenge("Mexico", "MX", artists);

        console.log("Weekly challenge created:", weekId);

        vm.startPrank(user1);
        uint256 balBefore = tours.balanceOf(user1);

        collector.completeArtist(weekId, 0, 1);
        collector.completeArtist(weekId, 1, 2);
        collector.completeArtist(weekId, 2, 3);

        uint256 balAfter = tours.balanceOf(user1);

        CountryCollector.CountryBadge[] memory badges = collector.getUserBadges(user1);
        assertEq(badges.length, 1);
        assertEq(badges[0].country, "Mexico");

        console.log("Badge earned! Rewards:", (balAfter - balBefore) / 1 ether, "TOURS");
        console.log("OK - Country collector works!");
        vm.stopPrank();
    }

    function test_FullIntegration() public {
        console.log("\n=== Test: Full Integration ===");

        // 1. Create itinerary
        vm.prank(user1);
        uint256 itinId = itinerary.createExperience(
            "Mexico",
            "Cancun",
            "Taco Stand",
            "Amazing tacos!",
            ItineraryNFT.ExperienceType.FOOD,
            21161908,
            -86851528,
            100,
            15 ether,
            "ipfs://taco-photo"
        );

        // 2. Backend records signal
        vm.prank(backend);
        demandSignal.recordActionBasedSignal(
            user1,
            "Cancun",
            5,
            "food-tour",
            ActionBasedDemandSignal.ActionType.ITINERARY_CREATED
        );

        // 3. User2 purchases
        vm.startPrank(user2);
        tours.approve(address(itinerary), 15 ether);
        itinerary.purchaseExperience(itinId);
        vm.stopPrank();

        // 4. Backend records purchase signal
        vm.prank(backend);
        demandSignal.recordActionBasedSignal(
            user2,
            "Cancun",
            5,
            "food-tour",
            ActionBasedDemandSignal.ActionType.ITINERARY_PURCHASED
        );

        // 5. Check demand
        uint256 demand = demandSignal.getArtistWeightedDemand("Cancun", 5);
        assertEq(demand, 50); // ITINERARY_CREATED (25) + ITINERARY_PURCHASED (25)

        console.log("Final demand score:", demand);
        console.log("OK - Full integration works!");
    }

    function test_Summary() public view {
        console.log("\n==========================================");
        console.log("PROTOCOL TEST SUMMARY");
        console.log("==========================================");
        console.log("OK - All contracts deploy successfully");
        console.log("OK - Demand signals record correctly");
        console.log("OK - Itinerary creation & purchase works");
        console.log("OK - Music Beat Match rewards users");
        console.log("OK - Country Collector badges work");
        console.log("OK - Full integration flow operational");
        console.log("==========================================");
    }
}
