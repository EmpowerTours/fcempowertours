// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "../src/LiveRadio.sol";

/**
 * @title DeployLiveRadio
 * @notice Deploys the LiveRadio contract for World Cup 2026 jukebox feature
 *
 * Addresses (Monad Testnet - verified from deployed lottery):
 * - WMON: 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541
 * - TOURS: 0x46d048EB424b0A95d5185f39C760c5FA754491d0
 * - Pyth Entropy: 0x825c0390f379C631f3Cf11A82a37D20BddF93c07
 * - EmpowerToursNFT: 0x957F10BC6EE140FfbCe64184864bc4C9C7652477
 * - Platform Safe: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 (15% of fees)
 * - Platform Wallet: 0x33fFCcb1802e13a7eead232BCd4706a2269582b0 (15% of fees)
 *
 * Fee Distribution:
 * - Queue Song: 70% artist, 15% safe, 15% wallet
 * - Voice Notes: 50% safe, 50% wallet
 *
 * Usage:
 *   forge script script/DeployLiveRadio.s.sol:DeployLiveRadio --rpc-url $RPC_URL --broadcast --verify
 */
contract DeployLiveRadio is Script {
    // Monad Testnet addresses (verified from deployed lottery contract)
    address constant WMON = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
    address constant TOURS = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
    address constant NFT_CONTRACT = 0x957F10BC6EE140FfbCe64184864bc4C9C7652477;
    address constant PYTH_ENTROPY = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;
    address constant PLATFORM_SAFE = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;
    address constant PLATFORM_WALLET = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying LiveRadio...");
        console.log("  Deployer:", deployer);
        console.log("  WMON:", WMON);
        console.log("  TOURS:", TOURS);
        console.log("  Pyth Entropy:", PYTH_ENTROPY);
        console.log("  NFT Contract:", NFT_CONTRACT);
        console.log("  Platform Safe (15% fees):", PLATFORM_SAFE);
        console.log("  Platform Wallet (15% fees):", PLATFORM_WALLET);

        vm.startBroadcast(deployerPrivateKey);

        LiveRadio liveRadio = new LiveRadio(
            WMON,
            TOURS,
            PYTH_ENTROPY,
            NFT_CONTRACT,
            PLATFORM_SAFE,
            PLATFORM_WALLET
        );

        console.log("LiveRadio deployed at:", address(liveRadio));

        // Start the radio
        liveRadio.startRadio();
        console.log("Radio started!");

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("LiveRadio:", address(liveRadio));
        console.log("\nNext steps:");
        console.log("1. Fund contract with TOURS for rewards: liveRadio.fundRewards(amount)");
        console.log("2. Add songs to pool: liveRadio.batchAddToSongPool([tokenIds])");
        console.log("3. Update frontend with contract address");
    }
}
