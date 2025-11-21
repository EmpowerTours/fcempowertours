// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFTv7.sol";

contract DeployEmpowerToursNFTv7 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Treasury and TOURS token addresses on Monad testnet
        address treasury = 0x37302543aeF0b06202adcb06Db36daB05F8237E9; // Safe owner
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        
        vm.startBroadcast(deployerPrivateKey);
        
        EmpowerToursNFTv7 nft = new EmpowerToursNFTv7(treasury, toursToken);
        
        console.log("EmpowerToursNFTv7 deployed to:", address(nft));
        console.log("Treasury:", treasury);
        console.log("TOURS Token:", toursToken);
        
        vm.stopBroadcast();
    }
}
