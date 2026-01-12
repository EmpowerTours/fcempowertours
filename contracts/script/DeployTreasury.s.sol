// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/EmpowerToursTreasury.sol";
import "../src/DAOReserve.sol";

/**
 * @title DeployTreasury
 * @notice Deploys EmpowerToursTreasury (platform fees - owner controlled)
 *
 * Monad Testnet:
 * - WMON: 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541
 *
 * Usage:
 *   forge script script/DeployTreasury.s.sol:DeployTreasury --rpc-url $RPC_URL --broadcast --verify
 */
contract DeployTreasury is Script {
    // Current Safe account for delegated transactions
    address constant SAFE_ACCOUNT = 0xDdaE200DBc2874BAd4FdB5e39F227215386c7533;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        bool isMainnet = block.chainid == 143;

        console.log("==============================================");
        console.log("Deploying EmpowerToursTreasury");
        console.log("==============================================");
        console.log("Network:", isMainnet ? "Monad Mainnet" : "Monad Testnet");
        console.log("Deployer:", deployer);
        console.log("Safe Account:", SAFE_ACCOUNT);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Treasury - deployer is owner
        EmpowerToursTreasury treasury = new EmpowerToursTreasury(deployer);
        console.log("Treasury deployed:", address(treasury));

        // Add Safe as operator (so it can deposit on behalf of users)
        treasury.setOperator(SAFE_ACCOUNT, true);
        console.log("Safe authorized as operator");

        vm.stopBroadcast();

        console.log("");
        console.log("==============================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("Treasury:", address(treasury));
        console.log("");
        console.log("Next steps:");
        console.log("1. Update all contract platformWallet addresses to Treasury");
        console.log("2. Update .env: TREASURY_ADDRESS=", address(treasury));
    }
}

/**
 * @title DeployDAOReserve
 * @notice Deploys DAOReserve (reserves - DAO governed)
 * @dev Deploy AFTER EmpowerToursDAO is deployed
 *
 * Usage:
 *   DAO_ADDRESS=0x... forge script script/DeployTreasury.s.sol:DeployDAOReserve --rpc-url $RPC_URL --broadcast --verify
 */
contract DeployDAOReserve is Script {
    // Monad Testnet
    address constant WMON_TESTNET = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;

    // Monad Mainnet
    address constant WMON_MAINNET = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address daoAddress = vm.envAddress("DAO_ADDRESS");

        require(daoAddress != address(0), "DAO_ADDRESS env var required");

        bool isMainnet = block.chainid == 143;
        address wmon = isMainnet ? WMON_MAINNET : WMON_TESTNET;

        console.log("==============================================");
        console.log("Deploying DAOReserve");
        console.log("==============================================");
        console.log("Network:", isMainnet ? "Monad Mainnet" : "Monad Testnet");
        console.log("Deployer:", deployer);
        console.log("WMON:", wmon);
        console.log("DAO:", daoAddress);

        vm.startBroadcast(deployerPrivateKey);

        DAOReserve reserve = new DAOReserve(wmon, daoAddress);
        console.log("DAOReserve deployed:", address(reserve));

        vm.stopBroadcast();

        console.log("");
        console.log("==============================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("DAOReserve:", address(reserve));
        console.log("");
        console.log("Next steps:");
        console.log("1. Call MusicSubscriptionV2.withdrawReserveToDAO(DAOReserve)");
        console.log("2. Configure DAO proposals to call DAOReserve.approveWithdrawal()");
    }
}
