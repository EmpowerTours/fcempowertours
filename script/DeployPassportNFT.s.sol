// SPDX-License-License: MIT
   pragma solidity ^0.8.20;

   import {Script} from "forge-std/Script.sol";
   import {console} from "forge-std/console.sol";
   import {PassportNFT} from "../src/PassportNFT.sol";

   contract DeployPassportNFT is Script {
       function run() external {
           vm.startBroadcast();
           PassportNFT passportNft = new PassportNFT("EmpowerPassport", "EPASS");
           vm.stopBroadcast();
           console.log("PassportNFT deployed to:", address(passportNft));
       }
   }
