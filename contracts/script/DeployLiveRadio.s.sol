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
    // Monad Testnet addresses
    address constant WMON_TESTNET = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
    address constant TOURS_TESTNET = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
    address constant NFT_CONTRACT_TESTNET = 0x957F10BC6EE140FfbCe64184864bc4C9C7652477;
    address constant PYTH_ENTROPY_TESTNET = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;
    address constant PLATFORM_SAFE_TESTNET = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;
    address constant PLATFORM_WALLET_TESTNET = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0;

    // Monad Mainnet addresses
    address constant WMON_MAINNET = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant TOURS_MAINNET = address(0); // Deploy TOURS first
    address constant NFT_CONTRACT_MAINNET = address(0); // Deploy NFT first
    address constant PYTH_ENTROPY_MAINNET = 0xd458261E832415CFD3BAE5E416FdF3230CE6F134;
    address constant PLATFORM_SAFE_MAINNET = address(0); // Set after Safe deployment
    address constant PLATFORM_WALLET_MAINNET = address(0); // Set after deployment

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Auto-detect network
        bool isMainnet = block.chainid == 143;

        address wmon = isMainnet ? WMON_MAINNET : WMON_TESTNET;
        address tours = isMainnet ? TOURS_MAINNET : TOURS_TESTNET;
        address nftContract = isMainnet ? NFT_CONTRACT_MAINNET : NFT_CONTRACT_TESTNET;
        address pythEntropy = isMainnet ? PYTH_ENTROPY_MAINNET : PYTH_ENTROPY_TESTNET;
        address platformSafe = isMainnet ? PLATFORM_SAFE_MAINNET : PLATFORM_SAFE_TESTNET;
        address platformWallet = isMainnet ? PLATFORM_WALLET_MAINNET : PLATFORM_WALLET_TESTNET;

        console.log("Deploying LiveRadio...");
        console.log("  Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("  Chain ID:", block.chainid);
        console.log("  Deployer:", deployer);
        console.log("  WMON:", wmon);
        console.log("  TOURS:", tours);
        console.log("  Pyth Entropy:", pythEntropy);
        console.log("  NFT Contract:", nftContract);
        console.log("  Platform Safe (15% fees):", platformSafe);
        console.log("  Platform Wallet (15% fees):", platformWallet);

        if (isMainnet) {
            require(tours != address(0), "TOURS not deployed to mainnet");
            require(nftContract != address(0), "NFT contract not deployed to mainnet");
            require(platformSafe != address(0), "Platform Safe not set for mainnet");
            require(platformWallet != address(0), "Platform Wallet not set for mainnet");
        }

        vm.startBroadcast(deployerPrivateKey);

        LiveRadio liveRadio = new LiveRadio(
            wmon,
            tours,
            pythEntropy,
            nftContract,
            platformSafe,
            platformWallet
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
