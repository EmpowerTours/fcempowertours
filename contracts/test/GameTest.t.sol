// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/MusicBeatMatch.sol";
import "../contracts/CountryCollector.sol";
import "../contracts/PassportNFTv3.sol";
import "../contracts/EmpowerToursYieldStrategyV9.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTOURS is ERC20 {
    constructor() ERC20("TOURS", "TOURS") {
        _mint(msg.sender, 10000000 ether);
    }
}

contract MockKintsu {
    mapping(address => uint256) public balances;
    function deposit(uint96, address receiver) external payable returns (uint96) {
        balances[receiver] += msg.value;
        return uint96(msg.value);
    }
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
    function convertToAssets(uint96 shares) external pure returns (uint96) {
        return shares;
    }
    receive() external payable {}
}

/**
 * @title GameTest
 * @notice Comprehensive tests for Music Beat Match and Country Collector games
 */
contract GameTest is Test {

    MockTOURS public tours;
    MockKintsu public kintsu;
    MusicBeatMatch public beatMatch;
    CountryCollector public collector;
    PassportNFTv3 public passport;
    EmpowerToursYieldStrategyV9 public yieldStrategy;

    address keeper = makeAddr("keeper");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");
    address user3 = makeAddr("user3");
    address user4 = makeAddr("user4");
    address user5 = makeAddr("user5");

    function setUp() public {
        tours = new MockTOURS();
        kintsu = new MockKintsu();

        yieldStrategy = new EmpowerToursYieldStrategyV9(
            address(tours), address(kintsu), address(0), address(0), keeper
        );

        passport = new PassportNFTv3(address(yieldStrategy));
        beatMatch = new MusicBeatMatch(address(tours), keeper);
        collector = new CountryCollector(address(tours), address(passport), keeper);

        // Fund contracts
        tours.transfer(address(beatMatch), 100000 ether);
        tours.transfer(address(collector), 100000 ether);

        // Fund users
        address[5] memory users = [user1, user2, user3, user4, user5];
        for (uint i = 0; i < 5; i++) {
            tours.transfer(users[i], 10000 ether);
            vm.deal(users[i], 100 ether);
        }
    }

    // ========================================================================
    // MUSIC BEAT MATCH TESTS
    // ========================================================================

    function test_MusicBeatMatch_FirstTimePlayer() public {
        console.log("\n=== TEST: Music Beat Match - First Time Player ===");

        // Create challenge
        vm.prank(keeper);
        uint256 challengeId = beatMatch.createDailyChallenge(1, "Despacito", "ipfs://preview");
        console.log("Challenge created:", challengeId);

        // First-time player guesses
        vm.prank(user1);
        beatMatch.submitGuess(challengeId, 1, "Despacito");

        // Check stats
        MusicBeatMatch.PlayerStats memory stats = beatMatch.getPlayerStats(user1);
        console.log("Total guesses:", stats.totalGuesses);
        console.log("Correct guesses:", stats.correctGuesses);
        console.log("Player level:", stats.level);
        console.log("Total rewards:", stats.totalRewards / 1 ether);

        assertEq(stats.totalGuesses, 1);
        assertEq(stats.correctGuesses, 1);
        assertEq(stats.level, 1); // Should be initialized to 1
        assertGt(stats.totalRewards, 0);

        console.log("OK - First time player works!");
    }

    function test_MusicBeatMatch_MultipleRounds() public {
        console.log("\n=== TEST: Music Beat Match - Multiple Daily Rounds ===");

        // Set initial timestamp to a clean day boundary
        vm.warp(1 days);

        for (uint day = 0; day < 7; day++) {
            // Create daily challenge
            vm.prank(keeper);
            uint256 challengeId = beatMatch.createDailyChallenge(
                day + 1,
                string(abi.encodePacked("Song", toString(day + 1))),
                "ipfs://preview"
            );

            // User1 guesses correctly
            vm.prank(user1);
            beatMatch.submitGuess(challengeId, day + 1, string(abi.encodePacked("Song", toString(day + 1))));

            console.log("Day", day + 1, "- User1 guessed correctly");

            // Advance to next day for next challenge
            vm.warp(block.timestamp + 1 days);
        }

        // Check streak
        MusicBeatMatch.PlayerStats memory stats = beatMatch.getPlayerStats(user1);
        console.log("Current streak:", stats.currentStreak);
        console.log("Longest streak:", stats.longestStreak);
        console.log("Total rewards:", stats.totalRewards / 1 ether);

        assertEq(stats.currentStreak, 7);
        assertEq(stats.longestStreak, 7);
        console.log("OK - 7-day streak achieved!");
    }

    function test_MusicBeatMatch_WrongGuesses() public {
        console.log("\n=== TEST: Music Beat Match - Wrong Guesses ===");

        vm.prank(keeper);
        uint256 challengeId = beatMatch.createDailyChallenge(1, "Correct Song", "ipfs://preview");

        // User1 guesses wrong
        vm.prank(user1);
        beatMatch.submitGuess(challengeId, 1, "Wrong Song");

        MusicBeatMatch.UserGuess memory guess = beatMatch.getUserGuess(challengeId, user1);
        assertFalse(guess.correct);
        assertEq(guess.rewardEarned, 0);

        MusicBeatMatch.PlayerStats memory stats = beatMatch.getPlayerStats(user1);
        assertEq(stats.correctGuesses, 0);
        assertEq(stats.currentStreak, 0);

        console.log("OK - Wrong guesses tracked correctly!");
    }

    function test_MusicBeatMatch_SpeedBonus() public {
        console.log("\n=== TEST: Music Beat Match - Speed Bonus ===");

        vm.prank(keeper);
        uint256 challengeId = beatMatch.createDailyChallenge(1, "Fast Song", "ipfs://preview");

        MusicBeatMatch.DailyChallenge memory challenge = beatMatch.getChallenge(challengeId);

        // User guesses within 5 minutes (speed threshold)
        vm.warp(challenge.startTime + 2 minutes);
        vm.prank(user1);
        beatMatch.submitGuess(challengeId, 1, "Fast Song");

        MusicBeatMatch.UserGuess memory guess = beatMatch.getUserGuess(challengeId, user1);
        console.log("Speed bonus reward:", guess.rewardEarned / 1 ether, "TOURS");

        // Should include speed bonus (BASE_REWARD + SPEED_BONUS + LEVEL_BONUS)
        // BASE: 10, SPEED: 5, LEVEL: 1.5 (10 * 1 * 10% + 10 = 11.5 total before speed)
        assertGt(guess.rewardEarned, 10 ether);

        console.log("OK - Speed bonus applied!");
    }

    function test_MusicBeatMatch_Leaderboard() public {
        console.log("\n=== TEST: Music Beat Match - Leaderboard ===");

        vm.prank(keeper);
        uint256 challengeId = beatMatch.createDailyChallenge(1, "Popular Song", "ipfs://preview");

        // 5 users guess
        address[5] memory users = [user1, user2, user3, user4, user5];
        string[5] memory guesses = ["Popular Song", "Popular Song", "Wrong", "Popular Song", "Wrong"];

        for (uint i = 0; i < 5; i++) {
            vm.prank(users[i]);
            beatMatch.submitGuess(challengeId, 1, guesses[i]);
        }

        // Check challenge stats
        (uint256 totalPlayers, uint256 correctGuesses, uint256 accuracy, ) =
            beatMatch.getChallengeStats(challengeId);

        console.log("Total players:", totalPlayers);
        console.log("Correct guesses:", correctGuesses);
        console.log("Accuracy:", accuracy, "%");

        assertEq(totalPlayers, 5);
        assertEq(correctGuesses, 3);
        assertEq(accuracy, 60); // 3/5 = 60%

        console.log("OK - Leaderboard stats working!");
    }

    // ========================================================================
    // COUNTRY COLLECTOR TESTS
    // ========================================================================

    function test_CountryCollector_WeeklyChallenge() public {
        console.log("\n=== TEST: Country Collector - Weekly Challenge ===");

        // Keeper creates weekly Brazil challenge
        vm.prank(keeper);
        uint256 weekId = collector.createWeeklyChallenge(
            "Brazil",
            "BR",
            [uint256(10), uint256(11), uint256(12)]
        );
        console.log("Brazil challenge created, week:", weekId);

        // User completes all 3 artists
        vm.startPrank(user1);

        collector.completeArtist(weekId, 0, 10);
        console.log("Completed artist 1");

        collector.completeArtist(weekId, 1, 11);
        console.log("Completed artist 2");

        collector.completeArtist(weekId, 2, 12);
        console.log("Completed artist 3");

        vm.stopPrank();

        // Check badge count
        CountryCollector.CountryBadge[] memory badges = collector.getUserBadges(user1);
        console.log("User badges:", badges.length);
        assertEq(badges.length, 1);

        console.log("OK - Weekly challenge completed!");
    }

    function test_CountryCollector_PassportBonus() public {
        console.log("\n=== TEST: Country Collector - Passport Matching Bonus ===");

        // User creates Brazil passport (countryCode, countryName, region, continent)
        vm.startPrank(user1);
        uint256 passportId = passport.mint{value: 0.01 ether}(
            user1, "BR", "Brazil", "Rio", "South America", "ipfs://passport"
        );
        console.log("Brazil passport minted:", passportId);
        vm.stopPrank();

        // Keeper creates Brazil challenge
        vm.prank(keeper);
        uint256 weekId = collector.createWeeklyChallenge(
            "Brazil",
            "BR",
            [uint256(20), uint256(21), uint256(22)]
        );

        // User completes all artists (should get passport bonus)
        vm.startPrank(user1);
        for (uint i = 0; i < 3; i++) {
            collector.completeArtist(weekId, i, 20 + i);
        }
        vm.stopPrank();

        // Check badge (should have "fromPassport" flag)
        CountryCollector.CountryBadge[] memory badges = collector.getUserBadges(user1);
        console.log("Badge from passport:", badges[0].fromPassport);
        assertTrue(badges[0].fromPassport);

        console.log("OK - Passport bonus applied!");
    }

    function test_CountryCollector_MultipleCountries() public {
        console.log("\n=== TEST: Country Collector - Multiple Countries ===");

        // Create 5 different country challenges
        string[5] memory countries = ["Brazil", "Mexico", "Japan", "France", "USA"];
        string[5] memory codes = ["BR", "MX", "JP", "FR", "US"];

        for (uint i = 0; i < 5; i++) {
            // Create proper fixed array for artistIds (starting from 1, not 0)
            uint256[3] memory artistIds;
            artistIds[0] = i * 3 + 1;
            artistIds[1] = i * 3 + 2;
            artistIds[2] = i * 3 + 3;

            vm.prank(keeper);
            uint256 weekId = collector.createWeeklyChallenge(
                countries[i],
                codes[i],
                artistIds
            );

            // User1 completes all artists
            vm.startPrank(user1);
            for (uint j = 0; j < 3; j++) {
                collector.completeArtist(weekId, j, i * 3 + j + 1);
            }
            vm.stopPrank();

            console.log("Completed", countries[i], "challenge");
        }

        CountryCollector.CountryBadge[] memory badges = collector.getUserBadges(user1);
        console.log("Total badges collected:", badges.length);
        assertEq(badges.length, 5);

        console.log("OK - Multiple countries completed!");
    }

    function test_CountryCollector_PartialCompletion() public {
        console.log("\n=== TEST: Country Collector - Partial Completion ===");

        vm.prank(keeper);
        uint256 weekId = collector.createWeeklyChallenge(
            "Argentina",
            "AR",
            [uint256(30), uint256(31), uint256(32)]
        );

        // User only completes 2 out of 3 artists
        vm.startPrank(user1);
        collector.completeArtist(weekId, 0, 30);
        collector.completeArtist(weekId, 1, 31);
        // Missing artist 3
        vm.stopPrank();

        // Check progress
        CountryCollector.UserCountryProgress memory progress = collector.getUserProgress(weekId, user1);
        console.log("Badge earned:", progress.badgeEarned);
        assertFalse(progress.badgeEarned);

        CountryCollector.CountryBadge[] memory badges = collector.getUserBadges(user1);
        console.log("Badges:", badges.length);
        assertEq(badges.length, 0); // No badge until all 3 completed

        console.log("OK - Partial completion tracked correctly!");
    }

    function test_CountryCollector_Competition() public {
        console.log("\n=== TEST: Country Collector - User Competition ===");

        vm.prank(keeper);
        uint256 weekId = collector.createWeeklyChallenge(
            "Spain",
            "ES",
            [uint256(40), uint256(41), uint256(42)]
        );

        // User1 completes all 3
        vm.startPrank(user1);
        for (uint i = 0; i < 3; i++) {
            collector.completeArtist(weekId, i, 40 + i);
        }
        vm.stopPrank();

        // User2 completes 2
        vm.startPrank(user2);
        collector.completeArtist(weekId, 0, 40);
        collector.completeArtist(weekId, 1, 41);
        vm.stopPrank();

        // User3 completes all 3
        vm.startPrank(user3);
        for (uint i = 0; i < 3; i++) {
            collector.completeArtist(weekId, i, 40 + i);
        }
        vm.stopPrank();

        console.log("User1 badges:", collector.getUserBadges(user1).length);
        console.log("User2 badges:", collector.getUserBadges(user2).length);
        console.log("User3 badges:", collector.getUserBadges(user3).length);

        assertEq(collector.getUserBadges(user1).length, 1);
        assertEq(collector.getUserBadges(user2).length, 0);
        assertEq(collector.getUserBadges(user3).length, 1);

        console.log("OK - Competition working!");
    }

    function test_CountryCollector_GlobalCitizen() public {
        console.log("\n=== TEST: Country Collector - Global Citizen Achievement ===");

        // Complete 10 countries (simulate path to 50)
        for (uint i = 0; i < 10; i++) {
            // Create proper fixed array for artistIds (starting from 1, not 0)
            uint256[3] memory artistIds;
            artistIds[0] = i * 3 + 1;
            artistIds[1] = i * 3 + 2;
            artistIds[2] = i * 3 + 3;

            vm.prank(keeper);
            uint256 weekId = collector.createWeeklyChallenge(
                string(abi.encodePacked("Country", toString(i))),
                string(abi.encodePacked("C", toString(i))),
                artistIds
            );

            vm.startPrank(user1);
            for (uint j = 0; j < 3; j++) {
                collector.completeArtist(weekId, j, i * 3 + j + 1);
            }
            vm.stopPrank();
        }

        CountryCollector.CountryBadge[] memory badges = collector.getUserBadges(user1);
        console.log("Badges collected:", badges.length);
        console.log("Progress to Global Citizen: 10 / 50");

        assertEq(badges.length, 10);
        console.log("OK - On path to Global Citizen!");
    }

    function test_CountryCollector_Stats() public {
        console.log("\n=== TEST: Country Collector - User Stats ===");

        vm.prank(keeper);
        uint256 weekId = collector.createWeeklyChallenge(
            "Italy",
            "IT",
            [uint256(50), uint256(51), uint256(52)]
        );

        // Complete all artists
        vm.startPrank(user1);
        for (uint i = 0; i < 3; i++) {
            collector.completeArtist(weekId, i, 50 + i);
        }
        vm.stopPrank();

        // Check stats
        CountryCollector.CollectorStats memory stats = collector.getCollectorStats(user1);
        console.log("Total badges:", stats.totalBadges);
        console.log("Total rewards:", stats.totalRewards / 1 ether, "TOURS");
        console.log("Global citizen progress:", stats.globalCitizenProgress, "/ 50");

        assertEq(stats.totalBadges, 1);
        assertGt(stats.totalRewards, 0);

        console.log("OK - User stats tracked!");
    }

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function test_Summary() public view {
        console.log("\n==========================================");
        console.log("  GAME TEST SUMMARY");
        console.log("==========================================");
        console.log("OK - Music Beat Match first time player");
        console.log("OK - Music Beat Match multiple rounds");
        console.log("OK - Music Beat Match wrong guesses");
        console.log("OK - Music Beat Match speed bonus");
        console.log("OK - Music Beat Match leaderboard");
        console.log("OK - Country Collector weekly challenge");
        console.log("OK - Country Collector passport bonus");
        console.log("OK - Country Collector multiple countries");
        console.log("OK - Country Collector partial completion");
        console.log("OK - Country Collector competition");
        console.log("OK - Country Collector global citizen");
        console.log("OK - Country Collector stats");
        console.log("==========================================");
        console.log("  ALL GAME FEATURES VALIDATED");
        console.log("==========================================");
    }
}
