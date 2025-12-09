// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFTv8.sol";

contract DeployEmpowerToursNFTv7 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Treasury and token addresses on Monad testnet
        address treasury = 0x37302543aeF0b06202adcb06Db36daB05F8237E9; // Safe owner
        address wmonToken = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;

        vm.startBroadcast(deployerPrivateKey);

        EmpowerToursNFTv8 nft = new EmpowerToursNFTv8(treasury, wmonToken, toursToken);
        
        console.log("EmpowerToursNFTv7 deployed to:", address(nft));
        console.log("Treasury:", treasury);
        console.log("TOURS Token:", toursToken);
        
        vm.stopBroadcast();
    }
}
