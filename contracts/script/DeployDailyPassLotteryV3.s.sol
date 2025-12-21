// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/DailyPassLotteryV3.sol";

contract DeployDailyPassLotteryV3 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Platform addresses on Monad testnet
        address platformSafe = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3;
        address platformWallet = 0x37302543aeF0b06202adcb06Db36daB05F8237E9;
        address shMonToken = 0x3a98250F98Dd388C211206983453837C8365BDc1;

        vm.startBroadcast(deployerPrivateKey);

        DailyPassLotteryV3 lottery = new DailyPassLotteryV3(
            platformSafe,
            platformWallet,
            shMonToken
        );

        console.log("DailyPassLotteryV3 deployed to:", address(lottery));
        console.log("Platform Safe:", platformSafe);
        console.log("Platform Wallet:", platformWallet);
        console.log("shMON Token:", shMonToken);

        vm.stopBroadcast();
    }
}
