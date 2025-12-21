// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IMusicBeatMatchV2 {
    function createDailyChallenge(
        uint256 artistId,
        string memory songTitle,
        string memory artistUsername,
        string memory ipfsAudioHash
    ) external returns (uint256);

    function getCurrentChallenge() external view returns (
        uint256 challengeId,
        uint256 artistId,
        string memory songTitle,
        string memory artistUsername,
        string memory ipfsAudioHash,
        uint256 startTime,
        uint256 endTime,
        bool active,
        bool finalized,
        address winner
    );
}

interface ICountryCollectorV2 {
    function createWeeklyChallenge(
        string memory country,
        string memory countryCode,
        uint256[3] memory artistIds
    ) external returns (uint256);

    function getCurrentWeek() external view returns (
        uint256 weekId,
        string memory country,
        string memory countryCode,
        uint256[3] memory artistIds,
        uint256 startTime,
        uint256 endTime,
        bool active,
        bool finalized
    );
}

contract CreateFirstChallenges is Script {
    function run() external {
        address musicBeatMatchV2 = 0x913E65B7742Da72972fB821468215E89F085F178;
        address countryCollectorV2 = 0xC7FfA579f66f6A3142b3e27427b04124F4b3cd61;

        console.log("=== Creating First Game Challenges ===");
        console.log("");

        vm.startBroadcast();

        // Check Beat Match
        console.log("Checking Music Beat Match V2...");
        (, , , , , , , bool beatMatchActive, ,) = IMusicBeatMatchV2(musicBeatMatchV2).getCurrentChallenge();

        if (!beatMatchActive) {
            console.log("Creating first Beat Match challenge...");
            // Use any token ID that exists - you can change this
            uint256 firstChallengeId = IMusicBeatMatchV2(musicBeatMatchV2).createDailyChallenge(
                1, // artistId - use first music NFT token
                "First Challenge", // songTitle
                "empowertours", // artistUsername
                "placeholder" // ipfsAudioHash
            );
            console.log("Beat Match challenge created! ID:", firstChallengeId);
        } else {
            console.log("Beat Match already has an active challenge");
        }

        console.log("");

        // Check Country Collector
        console.log("Checking Country Collector V2...");
        (, , , , , , bool collectorActive,) = ICountryCollectorV2(countryCollectorV2).getCurrentWeek();

        if (!collectorActive) {
            console.log("Creating first Country Collector challenge...");
            // Use Mexico as example - you can change this
            uint256[3] memory artistIds = [uint256(1), uint256(2), uint256(3)];
            uint256 firstWeekId = ICountryCollectorV2(countryCollectorV2).createWeeklyChallenge(
                "Mexico", // country
                "MX", // countryCode
                artistIds
            );
            console.log("Country Collector challenge created! Week ID:", firstWeekId);
        } else {
            console.log("Country Collector already has an active challenge");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== First Challenges Created ===");
        console.log("Games are now ready to play!");
    }
}
