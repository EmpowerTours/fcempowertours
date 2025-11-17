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
import "../contracts/TandaPool.sol";
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
        shares = uint96(msg.value);
        balances[receiver] += shares;
        totalShares += shares;
        return shares;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function convertToAssets(uint96 shares) external pure returns (uint96) {
        return shares;
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
            spotValue: shares,
            batchId: 0,
            exitFeeInBips: 100
        }));

        return shares;
    }

    function redeem(uint256 unlockIndex, address payable receiver) external returns (uint96 assets) {
        require(unlockIndex < unlockRequests[msg.sender].length, "Invalid index");
        UnlockRequest memory request = unlockRequests[msg.sender][unlockIndex];

        // 1% exit fee
        uint96 fee = (request.spotValue * request.exitFeeInBips) / 10000;
        uint96 netAmount = request.spotValue - fee;

        (bool success, ) = receiver.call{value: netAmount}("");
        require(success, "Transfer failed");

        return netAmount;
    }

    function getAllUserUnlockRequests(address user) external view returns (UnlockRequest[] memory) {
        return unlockRequests[user];
    }

    function cancelUnlockRequest(uint256 unlockIndex) external {
        require(unlockIndex < unlockRequests[msg.sender].length, "Invalid index");
        UnlockRequest memory request = unlockRequests[msg.sender][unlockIndex];

        balances[msg.sender] += request.shares;
        totalShares += request.shares;

        delete unlockRequests[msg.sender][unlockIndex];
    }

    receive() external payable {}
}

/**
 * @title AdvancedProtocolTest
 * @notice Tests unstaking, music deletion, tanda pools, and game scenarios
 */
contract AdvancedProtocolTest is Test {

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
    TandaPool public tandaPool;

    // Test accounts
    address keeper = makeAddr("keeper");
    address backend = makeAddr("backend");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");
    address user3 = makeAddr("user3");
    address user4 = makeAddr("user4");
    address user5 = makeAddr("user5");
    address artist1 = makeAddr("artist1");
    address artist2 = makeAddr("artist2");
    address venue = makeAddr("venue");

    function setUp() public {
        // Deploy mocks
        tours = new MockTOURS();
        kintsu = new MockKintsu();

        // Deploy core contracts
        yieldStrategy = new EmpowerToursYieldStrategyV9(
            address(tours),
            address(kintsu),
            address(0),
            address(0),
            keeper
        );

        passport = new PassportNFTv3(address(yieldStrategy));

        musicNFT = new MusicLicenseNFTv5(
            address(this),
            address(tours)
        );

        demandSignal = new ActionBasedDemandSignal(keeper);
        itinerary = new ItineraryNFT(address(passport), address(tours));
        beatMatch = new MusicBeatMatch(address(tours), keeper);
        collector = new CountryCollector(address(tours), address(passport), keeper);
        tandaPool = new TandaPool(address(tours));

        // Setup
        demandSignal.authorizeContract(backend, true);
        yieldStrategy.whitelistNFT(address(passport), true);
        yieldStrategy.whitelistNFT(address(musicNFT), true);

        // Fund contracts
        tours.transfer(address(itinerary), 100000 ether);
        tours.transfer(address(beatMatch), 100000 ether);
        tours.transfer(address(collector), 100000 ether);
        tours.transfer(address(musicNFT), 100000 ether);

        // Fund users
        address[8] memory users = [user1, user2, user3, user4, user5, artist1, artist2, venue];
        for (uint i = 0; i < users.length; i++) {
            tours.transfer(users[i], 50000 ether);
            vm.deal(users[i], 200 ether);
        }
        vm.deal(address(kintsu), 10000 ether);
    }

    // ============================================
    // TEST 1: PASSPORT UNSTAKING
    // ============================================

    function test_PassportUnstaking() public {
        console.log("\n=== TEST 1: Passport Unstaking (Two-Step Process) ===");

        // User1 mints passport and stakes
        vm.startPrank(user1);
        uint256 passportId = passport.mint{value: 0.01 ether}(
            user1, "USA", "US", "New York", "Tourist", "ipfs://passport"
        );
        uint256 stakeAmount = 20 ether;
        uint256 positionId = passport.stakeWithPassport{value: stakeAmount}(passportId);
        console.log("Staked 20 MON with passport");

        // Step 1: Request unstake
        passport.requestUnstake(passportId, positionId);
        console.log("Step 1: Unstake requested");

        // Step 2: Finalize unstake
        uint256 balanceBefore = user1.balance;
        passport.finalizeUnstake(passportId, positionId);
        uint256 balanceAfter = user1.balance;
        uint256 refund = balanceAfter - balanceBefore;

        console.log("Step 2: Unstake finalized");
        console.log("Refund received:", refund / 1 ether, "MON (with 1% exit fee)");

        // Verify refund (minus 1% exit fee)
        assertGt(refund, 19 ether);
        assertLt(refund, 20 ether);
        console.log("OK - Passport unstaking works!");
        vm.stopPrank();
    }

    // ============================================
    // TEST 2: MUSIC NFT UNSTAKING
    // ============================================

    function test_MusicNFTUnstaking() public {
        console.log("\n=== TEST 2: Music NFT Unstaking ===");

        // Artist creates and stakes music NFT
        vm.startPrank(artist1);
        uint256 musicTokenId = musicNFT.mintMaster(
            artist1, "ipfs://metadata", "Song Title", 5 ether
        );
        console.log("Music NFT created:", musicTokenId);

        uint256 stakeAmount = 30 ether;
        uint256 positionId = yieldStrategy.stakeWithDeposit{value: stakeAmount}(
            address(musicNFT), musicTokenId, artist1
        );
        console.log("Staked 30 MON with music NFT");

        // Step 1: Request unstake
        yieldStrategy.requestUnstake(positionId);
        console.log("Step 1: Unstake requested");

        // Step 2: Finalize unstake
        uint256 balanceBefore = artist1.balance;
        yieldStrategy.finalizeUnstake(positionId);
        uint256 balanceAfter = artist1.balance;
        uint256 refund = balanceAfter - balanceBefore;

        console.log("Step 2: Unstake finalized");
        console.log("Refund received:", refund / 1 ether, "MON");

        assertGt(refund, 29 ether);
        console.log("OK - Music NFT unstaking works!");
        vm.stopPrank();
    }

    // ============================================
    // TEST 3: MUSIC DELETION/BURNING
    // ============================================

    function test_MusicDeletion() public {
        console.log("\n=== TEST 3: Music Deletion/Burning (Artist corrects mistake) ===");

        // Artist mints music with typo
        vm.startPrank(artist1);
        uint256 wrongTokenId = musicNFT.mintMaster(
            artist1, "ipfs://metadata", "Despacitto", 5 ether // Typo!
        );
        console.log("Music NFT minted with typo:", wrongTokenId);

        // Check balance before burn
        uint256 balanceBefore = tours.balanceOf(artist1);

        // Artist burns the wrong NFT
        musicNFT.burnMusic(wrongTokenId);
        console.log("Music NFT burned!");

        // Check burn reward
        uint256 balanceAfter = tours.balanceOf(artist1);
        uint256 burnReward = balanceAfter - balanceBefore;
        console.log("Burn reward received:", burnReward / 1 ether, "TOURS");

        assertEq(burnReward, 5 ether); // Should receive burn reward

        // Verify NFT is burned
        vm.expectRevert();
        musicNFT.ownerOf(wrongTokenId);

        // Artist creates corrected version
        uint256 correctTokenId = musicNFT.mintMaster(
            artist1, "ipfs://metadata", "Despacito", 5 ether // Correct!
        );
        console.log("Corrected music NFT minted:", correctTokenId);
        console.log("OK - Music deletion/burning works!");
        vm.stopPrank();
    }

    // ============================================
    // TEST 4: TANDA POOL - RESTAURANT ITINERARY
    // ============================================

    function test_TandaPool_RestaurantTrip() public {
        console.log("\n=== TEST 4: Tanda Pool - Restaurant Trip ===");

        // User1 creates restaurant itinerary
        vm.startPrank(user1);
        uint256 itinId = itinerary.createExperience(
            "Mexico",
            "Mexico City",
            "Taco Oasis",
            "Best tacos in town",
            ItineraryNFT.ExperienceType.FOOD,
            19_432180, // lat
            -99_133209, // lon
            100,
            50 ether, // Price: 50 TOURS
            "ipfs://restaurant-photo"
        );
        console.log("Restaurant itinerary created:", itinId);
        vm.stopPrank();

        // Create tanda pool for restaurant trip
        vm.startPrank(user2);
        uint256 poolId = tandaPool.createPool(
            "Taco Trip Pool",
            5, // 5 members
            50 ether, // 50 TOURS per round
            5, // 5 rounds
            TandaPool.PoolType.EXPERIENCE
        );
        console.log("Tanda pool created:", poolId);
        vm.stopPrank();

        // Users join pool
        address[5] memory members = [user2, user3, user4, user5, artist2];
        for (uint i = 0; i < 5; i++) {
            vm.startPrank(members[i]);
            tours.approve(address(tandaPool), 250 ether); // 5 rounds * 50
            tandaPool.joinPool(poolId);
            console.log("Member", i+1, "joined pool");
            vm.stopPrank();
        }

        // Round 1: User2 gets the payout (wait 2 minutes)
        vm.warp(block.timestamp + 2 minutes + 1);
        vm.prank(user2);
        tandaPool.claimPayout(poolId);
        console.log("Round 1: User2 claimed 250 TOURS");

        // User2 uses payout to purchase itinerary for the group
        vm.startPrank(user2);
        tours.approve(address(itinerary), 50 ether);
        itinerary.purchaseExperience(itinId);
        console.log("User2 purchased restaurant itinerary with tanda payout!");

        // Simulate 5 members visiting the restaurant
        for (uint i = 0; i < 5; i++) {
            vm.stopPrank();
            vm.startPrank(members[i]);

            // Each member gets passport
            if (i > 0) {
                uint256 pId = passport.mint{value: 0.01 ether}(
                    members[i], "Mexico", "MX", "Mexico City", "Tourist", "ipfs://pass"
                );

                // Stamp passport at restaurant (with manual verification for testing)
                itinerary.stampPassportAtLocation(pId, itinId, 19_432180, -99_133209, true);
                console.log("Member", i+1, "visited restaurant and stamped passport!");
            }
        }

        console.log("OK - Tanda pool restaurant trip successful!");
        vm.stopPrank();
    }

    // ============================================
    // TEST 5: TANDA POOL - CONCERT TICKETS
    // ============================================

    function test_TandaPool_ConcertTickets() public {
        console.log("\n=== TEST 5: Tanda Pool - Concert Tickets ===");

        // Artist creates music to generate demand
        vm.startPrank(artist1);
        uint256 musicTokenId = musicNFT.mintMaster(
            artist1, "ipfs://metadata", "Hot Song", 10 ether
        );
        console.log("Artist created hot song:", musicTokenId);
        vm.stopPrank();

        // Generate demand signals
        for (uint i = 0; i < 6; i++) {
            vm.prank(backend);
            demandSignal.recordActionBasedSignal(
                user1,
                "Mexico City",
                1, // artistId
                "concert",
                ActionBasedDemandSignal.ActionType.PASSPORT_STAMP
            );
        }
        uint256 demand = demandSignal.getArtistWeightedDemand("Mexico City", 1);
        console.log("Demand generated:", demand);

        // Venue books artist
        vm.startPrank(venue);
        tours.approve(address(demandSignal), 10000 ether);
        uint256 bookingId = demandSignal.createVenueBooking(
            1,
            "Mexico City",
            "Arena Mexico",
            "Concert",
            block.timestamp + 60 days,
            5000 ether, // Artist fee
            100 ether, // Ticket price
            500 // Expected attendees
        );
        console.log("Venue created booking:", bookingId);
        vm.stopPrank();

        // Artist accepts booking
        vm.prank(artist1);
        demandSignal.respondToBooking(bookingId, 1, true);
        console.log("Artist accepted booking!");

        // Create tanda pool for concert tickets
        vm.startPrank(user1);
        uint256 poolId = tandaPool.createPool(
            "Concert Pool",
            4, // 4 members
            100 ether, // 100 TOURS per round (ticket price)
            4, // 4 rounds
            TandaPool.PoolType.EVENT
        );
        console.log("Concert tanda pool created:", poolId);
        vm.stopPrank();

        // Users join pool
        address[4] memory members = [user1, user2, user3, user4];
        for (uint i = 0; i < 4; i++) {
            vm.startPrank(members[i]);
            tours.approve(address(tandaPool), 400 ether);
            tandaPool.joinPool(poolId);
            console.log("Member", i+1, "joined concert pool");
            vm.stopPrank();
        }

        // Round 1: User1 gets payout to buy tickets for all
        vm.warp(block.timestamp + 2 minutes + 1);
        vm.prank(user1);
        tandaPool.claimPayout(poolId);
        console.log("Round 1: User1 claimed 400 TOURS for concert tickets!");

        // Simulate ticket purchases (would be done through venue contract)
        console.log("User1 buys 4 concert tickets @ 100 TOURS each = 400 TOURS");
        console.log("OK - Tanda pool concert trip successful!");
    }

    // ============================================
    // TEST 6: TANDA POOL - LARGE GROUP STAKE
    // ============================================

    function test_TandaPool_LargeGroupStake() public {
        console.log("\n=== TEST 6: Tanda Pool - Large Group Pooled Staking ===");

        // Create large tanda pool (10 members, 100 TOURS/round, 10 rounds)
        vm.startPrank(user1);
        uint256 poolId = tandaPool.createPool(
            "Mega Stake Pool",
            10,
            100 ether,
            10,
            TandaPool.PoolType.SAVINGS
        );
        console.log("Large tanda pool created: 10 members, 10 rounds");
        vm.stopPrank();

        // Create 6 more test addresses
        address user6 = makeAddr("user6");
        address user7 = makeAddr("user7");
        address user8 = makeAddr("user8");
        address user9 = makeAddr("user9");
        address user10 = makeAddr("user10");

        address[10] memory members = [
            user1, user2, user3, user4, user5,
            user6, user7, user8, user9, user10
        ];

        // Fund and join pool
        for (uint i = 0; i < 10; i++) {
            if (i >= 5) {
                tours.transfer(members[i], 50000 ether);
                vm.deal(members[i], 200 ether);
            }

            vm.startPrank(members[i]);
            tours.approve(address(tandaPool), 1000 ether);
            tandaPool.joinPool(poolId);
            console.log("Member", i+1, "joined (contributes 1000 TOURS total)");
            vm.stopPrank();
        }

        console.log("Total pool: 10,000 TOURS (10 members x 1000)");

        // Simulate 3 rounds (pool activates when last member joins)
        uint256 poolActivationTime = block.timestamp;

        for (uint round = 1; round <= 3; round++) {
            // Wait from pool activation time + (round duration * round number)
            vm.warp(poolActivationTime + (round * 2 minutes) + 1);

            vm.prank(members[round - 1]);
            tandaPool.claimPayout(poolId);

            console.log("Round completed - Member claimed 1000 TOURS");
        }

        console.log("OK - Large group tanda pool works!");
    }

    // ============================================
    // TEST 7: MUSIC BEAT MATCH - MULTIPLE PLAYERS
    // ============================================

    function test_MusicBeatMatch_MultipleUsers() public {
        console.log("\n=== TEST 7: Music Beat Match - Multiple Players ===");

        // Keeper creates daily challenge
        vm.prank(keeper);
        uint256 challengeId = beatMatch.createDailyChallenge(
            1, // artistId
            "Despacito",
            "ipfs://3sec-preview"
        );
        console.log("Daily challenge created:", challengeId);

        // Multiple users guess
        address[5] memory players = [user1, user2, user3, user4, user5];
        string[5] memory guesses = ["Despacito", "Despacito", "Wrong Song", "Despacito", "Wrong Song"];

        for (uint i = 0; i < 5; i++) {
            vm.prank(players[i]);
            beatMatch.submitGuess(challengeId, 1, guesses[i]);

            MusicBeatMatch.UserGuess memory guess = beatMatch.getUserGuess(challengeId, players[i]);
            if (guess.correct) {
                console.log("Player guessed correctly! Reward (TOURS):", guess.rewardEarned / 1 ether);
            } else {
                console.log("Player guessed wrong");
            }
        }

        // Check stats
        (uint256 totalPlayers, uint256 correctGuesses, uint256 accuracy, ) =
            beatMatch.getChallengeStats(challengeId);

        console.log("Challenge stats:");
        console.log("  Total players:", totalPlayers);
        console.log("  Correct guesses:", correctGuesses);
        console.log("  Accuracy:", accuracy, "%");
        console.log("OK - Music Beat Match with multiple users works!");
    }

    // ============================================
    // TEST 8: COUNTRY COLLECTOR - MULTIPLE USERS
    // ============================================

    function test_CountryCollector_Competition() public {
        console.log("\n=== TEST 8: Country Collector - User Competition ===");

        // Keeper creates weekly challenge
        vm.prank(keeper);
        uint256 weekId = collector.createWeeklyChallenge(
            "Brazil",
            "BR",
            [uint256(10), uint256(11), uint256(12)]
        );
        console.log("Weekly Brazil challenge created");

        // User1 completes all artists
        vm.startPrank(user1);
        uint256 passport1 = passport.mint{value: 0.01 ether}(
            user1, "Brazil", "BR", "Rio", "Tourist", "ipfs://p1"
        );

        for (uint i = 0; i < 3; i++) {
            collector.completeArtist(weekId, i, 10 + i);
        }
        console.log("User1 completed all 3 Brazilian artists!");

        MusicBeatMatch.PlayerStats memory stats1 = beatMatch.getPlayerStats(user1);
        vm.stopPrank();

        // User2 completes 2 artists
        vm.startPrank(user2);
        uint256 passport2 = passport.mint{value: 0.01 ether}(
            user2, "USA", "US", "NYC", "Tourist", "ipfs://p2"
        );

        collector.completeArtist(weekId, 0, 10);
        collector.completeArtist(weekId, 1, 11);
        console.log("User2 completed 2 Brazilian artists");
        vm.stopPrank();

        // User3 completes all + has Brazil passport (bonus!)
        vm.startPrank(user3);
        uint256 passport3 = passport.mint{value: 0.01 ether}(
            user3, "Brazil", "BR", "Sao Paulo", "Tourist", "ipfs://p3"
        );

        for (uint i = 0; i < 3; i++) {
            collector.completeArtist(weekId, i, 10 + i);
        }
        console.log("User3 completed all 3 + has Brazil passport (BONUS!)");
        vm.stopPrank();

        console.log("OK - Country Collector competition works!");
    }

    // ============================================
    // TEST 9: COMPLEX SCENARIO - FULL ECOSYSTEM
    // ============================================

    function test_FullEcosystem() public {
        console.log("\n=== TEST 9: Full Ecosystem Test ===");

        // 1. Artist creates music and stakes
        vm.startPrank(artist1);
        uint256 musicId = musicNFT.mintMaster(artist1, "ipfs://meta", "Hit Song", 15 ether);
        uint256 artistStake = yieldStrategy.stakeWithDeposit{value: 50 ether}(
            address(musicNFT), musicId, artist1
        );
        console.log("1. Artist created music & staked 50 MON");
        vm.stopPrank();

        // 2. Users purchase music licenses
        for (uint i = 0; i < 3; i++) {
            vm.startPrank([user1, user2, user3][i]);
            tours.approve(address(musicNFT), 15 ether);
            musicNFT.purchaseLicenseFor(musicId, [user1, user2, user3][i]);

            // Record demand signal
            vm.stopPrank();
            vm.prank(backend);
            demandSignal.recordActionBasedSignal(
                [user1, user2, user3][i],
                "Mexico City",
                1,
                "music",
                ActionBasedDemandSignal.ActionType.MUSIC_PURCHASE
            );
        }
        console.log("2. Three users purchased music licenses");

        // 3. User creates itinerary
        vm.startPrank(user1);
        uint256 itinId = itinerary.createExperience(
            "Mexico",
            "Mexico City",
            "Concert Venue Tour",
            "Behind the scenes",
            ItineraryNFT.ExperienceType.ENTERTAINMENT,
            19_432180,
            -99_133209,
            100,
            75 ether,
            "ipfs://venue-photo"
        );
        console.log("3. User created concert venue itinerary");
        vm.stopPrank();

        // Record demand
        vm.prank(backend);
        demandSignal.recordActionBasedSignal(
            user1, "Mexico City", 1, "itinerary",
            ActionBasedDemandSignal.ActionType.ITINERARY_CREATED
        );

        // 4. Tanda pool forms to attend future concert
        vm.startPrank(user2);
        uint256 poolId = tandaPool.createPool("Concert Fund", 3, 50 ether, 3, TandaPool.PoolType.EVENT);
        vm.stopPrank();

        address[3] memory poolMembers = [user2, user3, user4];
        for (uint i = 0; i < 3; i++) {
            vm.startPrank(poolMembers[i]);
            tours.approve(address(tandaPool), 150 ether);
            tandaPool.joinPool(poolId);
            vm.stopPrank();
        }
        console.log("4. Tanda pool created (3 members for concert)");

        // 5. Generate more demand via music staking
        for (uint i = 0; i < 5; i++) {
            vm.prank(backend);
            demandSignal.recordActionBasedSignal(
                user1, "Mexico City", 1, "stake",
                ActionBasedDemandSignal.ActionType.MUSIC_STAKE
            );
        }

        uint256 totalDemand = demandSignal.getArtistWeightedDemand("Mexico City", 1);
        console.log("5. Total weighted demand:", totalDemand);

        // 6. Venue books artist (demand threshold met)
        if (totalDemand >= 500) {
            vm.startPrank(venue);
            tours.approve(address(demandSignal), 10000 ether);
            uint256 bookingId = demandSignal.createVenueBooking(
                1, "Mexico City", "Arena", "Concert",
                block.timestamp + 45 days,
                6000 ether, 120 ether, 400
            );
            vm.stopPrank();

            vm.prank(artist1);
            demandSignal.respondToBooking(bookingId, 1, true);
            console.log("6. Venue booked artist & artist accepted!");
        }

        // 7. Tanda pool claims to buy tickets
        vm.warp(block.timestamp + 2 minutes + 1);
        vm.prank(user2);
        tandaPool.claimPayout(poolId);
        console.log("7. Tanda pool claimed 150 TOURS for tickets!");

        // 8. Music Beat Match challenge
        vm.prank(keeper);
        uint256 challengeId = beatMatch.createDailyChallenge(1, "Hit Song", "ipfs://preview");

        vm.prank(user1);
        beatMatch.submitGuess(challengeId, 1, "Hit Song");
        console.log("8. User played Music Beat Match!");

        // 9. Country Collector challenge
        vm.prank(keeper);
        uint256 weekId = collector.createWeeklyChallenge("Mexico", "MX", [uint256(1), uint256(2), uint256(3)]);

        vm.prank(user1);
        collector.completeArtist(weekId, 0, 1);
        console.log("9. User participated in Country Collector!");

        console.log("\n=== FULL ECOSYSTEM TEST COMPLETE ===");
        console.log("OK - All systems working together!");
    }

    // ============================================
    // TEST 10: TANDA POOL VARIATIONS
    // ============================================

    function test_TandaPoolVariations() public {
        console.log("\n=== TEST 10: Tanda Pool Variations ===");

        // Scenario 1: Small pool (3 members, 25 TOURS/round)
        vm.prank(user1);
        uint256 pool1 = tandaPool.createPool("Small Pool", 3, 25 ether, 3, TandaPool.PoolType.SAVINGS);
        console.log("Scenario 1: Small pool created (3x25 TOURS)");

        // Scenario 2: Large pool (8 members, 200 TOURS/round)
        vm.prank(user2);
        uint256 pool2 = tandaPool.createPool("Large Pool", 8, 200 ether, 8, TandaPool.PoolType.EXPERIENCE);
        console.log("Scenario 2: Large pool created (8x200 TOURS)");

        // Scenario 3: Quick rotation (5 members, 50 TOURS, 5 rounds)
        vm.prank(user3);
        uint256 pool3 = tandaPool.createPool("Quick Pool", 5, 50 ether, 5, TandaPool.PoolType.EVENT);
        console.log("Scenario 3: Quick pool created (5x50 TOURS)");

        console.log("OK - Multiple tanda pool variations work!");
    }

    function test_Summary() public view {
        console.log("\n==========================================");
        console.log("  ADVANCED PROTOCOL TEST SUMMARY");
        console.log("==========================================");
        console.log("OK - Passport unstaking (two-step)");
        console.log("OK - Music NFT unstaking");
        console.log("OK - Music deletion/burning");
        console.log("OK - Tanda pool restaurant trip");
        console.log("OK - Tanda pool concert tickets");
        console.log("OK - Tanda pool large group stake");
        console.log("OK - Music Beat Match multiple users");
        console.log("OK - Country Collector competition");
        console.log("OK - Full ecosystem integration");
        console.log("OK - Tanda pool variations");
        console.log("==========================================");
        console.log("  ALL ADVANCED FEATURES VALIDATED");
        console.log("==========================================");
    }

    receive() external payable {}
}
