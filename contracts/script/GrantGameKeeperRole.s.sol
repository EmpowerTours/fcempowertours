// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IGameContract {
    function setKeeper(address newKeeper) external;
    function keeper() external view returns (address);
}

contract GrantGameKeeperRole is Script {
    function run() external {
        // Bot's Safe Account address
        address botSafe = 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5;

        // Game contract addresses
        address musicBeatMatchV2 = 0x913E65B7742Da72972fB821468215E89F085F178;
        address countryCollectorV2 = 0xC7FfA579f66f6A3142b3e27427b04124F4b3cd61;

        console.log("=== Granting Keeper Role to Bot Safe ===");
        console.log("Bot Safe Address:", botSafe);
        console.log("");

        vm.startBroadcast();

        // Grant keeper role to MusicBeatMatchV2
        console.log("Setting keeper for MusicBeatMatchV2...");
        IGameContract(musicBeatMatchV2).setKeeper(botSafe);
        address beatMatchKeeper = IGameContract(musicBeatMatchV2).keeper();
        console.log("MusicBeatMatchV2 keeper:", beatMatchKeeper);
        require(beatMatchKeeper == botSafe, "Failed to set Beat Match keeper");
        console.log("SUCCESS: MusicBeatMatchV2 keeper set!");
        console.log("");

        // Grant keeper role to CountryCollectorV2
        console.log("Setting keeper for CountryCollectorV2...");
        IGameContract(countryCollectorV2).setKeeper(botSafe);
        address collectorKeeper = IGameContract(countryCollectorV2).keeper();
        console.log("CountryCollectorV2 keeper:", collectorKeeper);
        require(collectorKeeper == botSafe, "Failed to set Country Collector keeper");
        console.log("SUCCESS: CountryCollectorV2 keeper set!");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Keeper Roles Granted Successfully ===");
        console.log("Bot Safe can now autonomously manage both games!");
    }
}
