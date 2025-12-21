// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ToursToken.sol";

contract DeployToursToken is Script {
    function run() external {
        console.log("=== Deploying TOURS Token ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("");

        vm.startBroadcast();

        ToursToken tours = new ToursToken();

        vm.stopBroadcast();

        console.log("=== Deployed! ===");
        console.log("TOURS Token:", address(tours));
        console.log("");
        console.log("Configuration:");
        console.log("  Name:", tours.name());
        console.log("  Symbol:", tours.symbol());
        console.log("  Decimals:", tours.decimals());
        console.log("  Max Supply:", tours.MAX_SUPPLY() / 1e18, "TOURS");
        console.log("  Total Supply:", tours.totalSupply() / 1e18, "TOURS");
        console.log("  Owner:", tours.owner());
        console.log("");
        console.log("Deployer Balance:", tours.balanceOf(msg.sender) / 1e18, "TOURS");
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Transfer TOURS to NFT contract for rewards:");
        console.log("   tours.transfer(nftAddress, 100_000_000 ether) // 100M TOURS");
        console.log("");
        console.log("2. Transfer TOURS to treasury/liquidity:");
        console.log("   tours.transfer(treasury, amount)");
        console.log("");
        console.log("3. Update .env with:");
        console.log("   NEXT_PUBLIC_TOURS_ADDRESS=%s", address(tours));
        console.log("");
        console.log("=== Verify Contract ===");
        console.log("forge verify-contract", address(tours));
        console.log("  src/ToursToken.sol:ToursToken");
        console.log("  --chain-id", block.chainid);
        console.log("  --constructor-args (none)");
    }
}
