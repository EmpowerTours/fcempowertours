// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IGameContract {
    function setKeeper(address newKeeper) external;
    function keeper() external view returns (address);
}

contract GrantGameKeeperRole is Script {
    function run() external {
        // Platform Safe Account address (used by manage-games cron)
        address platformSafe = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;

        // Game contract addresses
        address musicBeatMatchV2 = 0x913E65B7742Da72972fB821468215E89F085F178;
        address countryCollectorV2 = 0xC7FfA579f66f6A3142b3e27427b04124F4b3cd61;

        console.log("=== Granting Keeper Role to Platform Safe ===");
        console.log("Platform Safe Address:", platformSafe);
        console.log("");

        vm.startBroadcast();

        // Grant keeper role to MusicBeatMatchV2
        console.log("Setting keeper for MusicBeatMatchV2...");
        IGameContract(musicBeatMatchV2).setKeeper(platformSafe);
        address beatMatchKeeper = IGameContract(musicBeatMatchV2).keeper();
        console.log("MusicBeatMatchV2 keeper:", beatMatchKeeper);
        require(beatMatchKeeper == platformSafe, "Failed to set Beat Match keeper");
        console.log("SUCCESS: MusicBeatMatchV2 keeper set!");
        console.log("");

        // Grant keeper role to CountryCollectorV2
        console.log("Setting keeper for CountryCollectorV2...");
        IGameContract(countryCollectorV2).setKeeper(platformSafe);
        address collectorKeeper = IGameContract(countryCollectorV2).keeper();
        console.log("CountryCollectorV2 keeper:", collectorKeeper);
        require(collectorKeeper == platformSafe, "Failed to set Country Collector keeper");
        console.log("SUCCESS: CountryCollectorV2 keeper set!");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Keeper Roles Granted Successfully ===");
        console.log("Platform Safe can now autonomously manage both games!");
    }
}
