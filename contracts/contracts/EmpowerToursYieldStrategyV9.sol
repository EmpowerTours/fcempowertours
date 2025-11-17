// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Kintsu V2 Interface
 * @notice Complete interface matching Kintsu StakedMonad V2 contract
 */
interface IKintsuV2 {
    struct UnlockRequest {
        uint96 shares;          // Number of shares the user will receive if the request is cancelled
        uint96 spotValue;       // Value of the underlying asset that will be received upon redemption
        uint40 batchId;         // When this batch is submitted, redemption is available after withdraw delay
        uint16 exitFeeInBips;   // Store the exitFee (expressed in basis points) used for processing
    }

    // Core functions
    function deposit(uint96 minShares, address receiver) external payable returns (uint96 shares);
    function requestUnlock(uint96 shares, uint96 minSpotValue) external returns (uint96 spotValue);
    function cancelUnlockRequest(uint256 unlockIndex) external;
    function redeem(uint256 unlockIndex, address payable receiver) external returns (uint96 assets);

    // View functions
    function balanceOf(address account) external view returns (uint256);
    function convertToShares(uint96 assets) external view returns (uint96 shares);
    function convertToAssets(uint96 shares) external view returns (uint96 assets);
    function getAllUserUnlockRequests(address user) external view returns (UnlockRequest[] memory);
    function totalShares() external view returns (uint96);
}

interface ITokenSwap {
    function swapMONForTOURS(uint256 monAmount) external payable returns (uint256 toursAmount);
}

/**
 * @title EmpowerToursYieldStrategyV9
 * @notice V9 = Implements proper two-step Kintsu unstaking with cooldown period
 * @dev Users deposit MON → Kintsu, unstaking requires requestUnlock → wait → redeem
 */
contract EmpowerToursYieldStrategyV9 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant WITHDRAWAL_FEE_BP = 50; // 0.5%
    uint256 public constant ESTIMATED_COOLDOWN_PERIOD = 7 days; // Approximate, actual varies by network

    // Position states
    enum PositionState {
        Active,             // Position is actively staked
        PendingWithdrawal,  // Unlock requested, waiting for cooldown
        Closed              // Position fully closed and redeemed
    }

    // Core contract references
    IERC20 public immutable toursToken;
    IKintsuV2 public immutable kintsu;
    ITokenSwap public tokenSwap;  // Optional: for yield conversion only
    address public dragonRouter;
    address public keeper;

    // NFT Whitelist
    mapping(address => bool) public acceptedNFTs;

    /**
     * @dev Unlock request tracking for positions
     */
    struct UnlockRequestInfo {
        uint256 kintsuUnlockIndex;  // Index in Kintsu's unlock request array
        uint96 shares;               // Shares requested for unlock
        uint96 expectedSpotValue;    // Expected MON value at unlock time
        uint40 requestTime;          // When unlock was requested
        bool exists;                 // Whether unlock request exists
    }

    /**
     * @dev Staking position structure
     */
    struct StakingPosition {
        address nftAddress;
        uint256 nftTokenId;
        address owner;           // Who staked (can be Safe)
        address beneficiary;     // Who owns NFT and gets rewards
        uint256 depositTime;
        uint256 monStaked;       // Original MON deposited
        uint256 kintsuShares;    // Kintsu shares held for this position
        uint256 yieldDebt;       // Accumulated yield per share when position created
        PositionState state;     // Current state of position
        UnlockRequestInfo unlockRequest;  // Unlock request details if pending
    }

    // State variables
    uint256 public positionCounter;
    mapping(uint256 => StakingPosition) public stakingPositions;
    mapping(address => uint256[]) public userPositions;
    mapping(address => mapping(uint256 => bool)) public nftCollateralUsed;

    // Global stats
    uint256 public totalMonStaked;
    uint256 public totalKintsuShares;
    uint256 public totalYieldHarvested;
    uint256 public accYieldPerShare;     // Accumulated yield per staked MON (scaled by 1e18)
    uint256 public lastHarvestTime;
    uint256 public totalPositionsClosed;
    uint256 public totalYieldDistributed;

    // Events
    event NFTWhitelisted(address indexed nftAddress, bool accepted);
    event StakingPositionCreated(
        uint256 indexed positionId,
        address indexed nftAddress,
        uint256 indexed nftTokenId,
        address owner,
        address beneficiary,
        uint256 monAmount,
        uint256 kintsuShares,
        uint256 timestamp
    );
    event UnstakeRequested(
        uint256 indexed positionId,
        address indexed user,
        uint96 shares,
        uint96 expectedSpotValue,
        uint256 estimatedReadyTime,
        uint256 timestamp
    );
    event UnstakeCancelled(
        uint256 indexed positionId,
        address indexed user,
        uint96 sharesReturned,
        uint256 timestamp
    );
    event StakingPositionClosed(
        uint256 indexed positionId,
        address indexed user,
        uint256 monRedeemed,
        uint256 yieldShare,
        uint256 netRefund,
        uint256 timestamp
    );
    event YieldHarvested(uint256 yieldMon, uint256 currentValue, uint256 timestamp);
    event YieldAllocatedToDragonRouter(string location, uint256 amount, uint256 timestamp);
    event TokenSwapUpdated(address indexed newSwap);
    event DragonRouterUpdated(address indexed newRouter);
    event KeeperUpdated(address indexed newKeeper);

    modifier onlyKeeperOrOwner() {
        require(msg.sender == keeper || msg.sender == owner(), "Not keeper or owner");
        _;
    }

    constructor(
        address _toursToken,
        address _kintsu,
        address _tokenSwap,
        address _dragonRouter,
        address _keeper
    ) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS address");
        require(_kintsu != address(0), "Invalid Kintsu address");
        require(_keeper != address(0), "Invalid keeper address");

        toursToken = IERC20(_toursToken);
        kintsu = IKintsuV2(_kintsu);
        tokenSwap = ITokenSwap(_tokenSwap);
        dragonRouter = _dragonRouter;
        keeper = _keeper;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function whitelistNFT(address nftAddress, bool accepted) external onlyOwner {
        require(nftAddress != address(0), "Invalid NFT address");
        acceptedNFTs[nftAddress] = accepted;
        emit NFTWhitelisted(nftAddress, accepted);
    }

    function setTokenSwap(address newSwap) external onlyOwner {
        require(newSwap != address(0), "Invalid swap address");
        tokenSwap = ITokenSwap(newSwap);
        emit TokenSwapUpdated(newSwap);
    }

    function setDragonRouter(address newRouter) external onlyOwner {
        require(newRouter != address(0), "Invalid router address");
        dragonRouter = newRouter;
        emit DragonRouterUpdated(newRouter);
    }

    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper address");
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    // ============================================
    // Core Staking Functions
    // ============================================

    /**
     * @notice Stake MON with NFT collateral
     * @dev Accepts MON directly (payable), deposits to Kintsu
     * @param nftAddress The whitelisted NFT contract address
     * @param nftTokenId The NFT token ID (must be owned by beneficiary)
     * @param beneficiary Address that owns the NFT and will receive rewards
     * @return positionId The created position ID
     */
    function stakeWithDeposit(
        address nftAddress,
        uint256 nftTokenId,
        address beneficiary
    ) external payable nonReentrant returns (uint256 positionId) {
        uint256 monAmount = msg.value;

        // Validation
        require(monAmount > 0, "Amount must be > 0");
        require(acceptedNFTs[nftAddress], "NFT not whitelisted");
        require(beneficiary != address(0), "Invalid beneficiary");

        // Verify beneficiary owns NFT (but don't transfer it!)
        address nftOwner = IERC721(nftAddress).ownerOf(nftTokenId);
        require(nftOwner == beneficiary, "Beneficiary must own NFT");

        // Check NFT isn't already used
        require(!nftCollateralUsed[nftAddress][nftTokenId], "NFT already used");

        // Deploy MON to Kintsu vault and get shares
        uint96 shares = _depositToKintsu(uint96(monAmount));

        // Create staking position
        positionId = positionCounter++;
        StakingPosition storage pos = stakingPositions[positionId];
        pos.nftAddress = nftAddress;
        pos.nftTokenId = nftTokenId;
        pos.owner = msg.sender;
        pos.beneficiary = beneficiary;
        pos.depositTime = block.timestamp;
        pos.monStaked = monAmount;
        pos.kintsuShares = shares;
        pos.yieldDebt = (monAmount * accYieldPerShare) / 1e18;
        pos.state = PositionState.Active;

        // Track position by beneficiary
        userPositions[beneficiary].push(positionId);
        nftCollateralUsed[nftAddress][nftTokenId] = true;

        // Update global stats
        totalMonStaked += monAmount;
        totalKintsuShares += shares;

        emit StakingPositionCreated(
            positionId,
            nftAddress,
            nftTokenId,
            msg.sender,
            beneficiary,
            monAmount,
            shares,
            block.timestamp
        );

        return positionId;
    }

    /**
     * @notice Request unstaking (Step 1 of 2)
     * @dev Submits unlock request to Kintsu, user must wait for cooldown period
     * @param positionId The position ID to unstake
     * @return expectedSpotValue The expected MON value at redemption time
     */
    function requestUnstake(uint256 positionId) external nonReentrant returns (uint96 expectedSpotValue) {
        StakingPosition storage pos = stakingPositions[positionId];

        // Validation
        require(pos.state == PositionState.Active, "Position not active");
        require(pos.beneficiary == msg.sender || pos.owner == msg.sender, "Not authorized");

        // If owner unstakes, verify NFT is still owned by beneficiary
        if (msg.sender == pos.owner) {
            address currentNftOwner = IERC721(pos.nftAddress).ownerOf(pos.nftTokenId);
            require(currentNftOwner == pos.beneficiary, "NFT ownership changed");
        }

        // Get current unlock request count to determine index
        IKintsuV2.UnlockRequest[] memory existingRequests = kintsu.getAllUserUnlockRequests(address(this));
        uint256 unlockIndex = existingRequests.length;

        // Submit unlock request to Kintsu
        uint96 shares = uint96(pos.kintsuShares);
        expectedSpotValue = kintsu.requestUnlock(shares, 0); // minSpotValue = 0 for simplicity

        // Update position state
        pos.state = PositionState.PendingWithdrawal;
        pos.unlockRequest.kintsuUnlockIndex = unlockIndex;
        pos.unlockRequest.shares = shares;
        pos.unlockRequest.expectedSpotValue = expectedSpotValue;
        pos.unlockRequest.requestTime = uint40(block.timestamp);
        pos.unlockRequest.exists = true;

        // Update global stats
        totalKintsuShares -= shares;

        uint256 estimatedReadyTime = block.timestamp + ESTIMATED_COOLDOWN_PERIOD;

        emit UnstakeRequested(
            positionId,
            msg.sender,
            shares,
            expectedSpotValue,
            estimatedReadyTime,
            block.timestamp
        );

        return expectedSpotValue;
    }

    /**
     * @notice Cancel pending unstake request
     * @dev Can only be called before batch is submitted to validators
     * @param positionId The position ID to cancel unstake for
     */
    function cancelUnstake(uint256 positionId) external nonReentrant {
        StakingPosition storage pos = stakingPositions[positionId];

        // Validation
        require(pos.state == PositionState.PendingWithdrawal, "No pending unstake");
        require(pos.beneficiary == msg.sender || pos.owner == msg.sender, "Not authorized");
        require(pos.unlockRequest.exists, "No unlock request");

        // Cancel unlock request in Kintsu
        kintsu.cancelUnlockRequest(pos.unlockRequest.kintsuUnlockIndex);

        // Restore position to active state
        uint96 shares = pos.unlockRequest.shares;
        pos.state = PositionState.Active;
        pos.unlockRequest.exists = false;

        // Update global stats
        totalKintsuShares += shares;

        emit UnstakeCancelled(positionId, msg.sender, shares, block.timestamp);
    }

    /**
     * @notice Finalize unstaking and claim rewards (Step 2 of 2)
     * @dev Can only be called after cooldown period has elapsed
     * @param positionId The position ID to finalize
     * @return netRefund The amount of MON refunded (after fees)
     */
    function finalizeUnstake(uint256 positionId) external nonReentrant returns (uint256 netRefund) {
        StakingPosition storage pos = stakingPositions[positionId];

        // Validation
        require(pos.state == PositionState.PendingWithdrawal, "No pending withdrawal");
        require(pos.beneficiary == msg.sender || pos.owner == msg.sender, "Not authorized");
        require(pos.unlockRequest.exists, "No unlock request");

        // Redeem from Kintsu (will revert if cooldown not elapsed)
        uint96 monRedeemed = kintsu.redeem(
            pos.unlockRequest.kintsuUnlockIndex,
            payable(address(this))
        );

        // Calculate yield share using per-position tracking
        uint256 yieldShare = ((pos.monStaked * accYieldPerShare) / 1e18) - pos.yieldDebt;

        // Calculate refund with fee (in MON)
        uint256 totalRefund = uint256(monRedeemed) + yieldShare;
        uint256 fee = (totalRefund * WITHDRAWAL_FEE_BP) / BASIS_POINTS;
        netRefund = totalRefund - fee;

        // Update position state
        pos.state = PositionState.Closed;
        nftCollateralUsed[pos.nftAddress][pos.nftTokenId] = false;

        // Update global stats
        totalMonStaked -= pos.monStaked;
        totalPositionsClosed++;
        totalYieldDistributed += yieldShare;

        // Transfer MON to whoever initiated finalization
        (bool success, ) = msg.sender.call{value: netRefund}("");
        require(success, "MON transfer failed");

        emit StakingPositionClosed(
            positionId,
            msg.sender,
            monRedeemed,
            yieldShare,
            netRefund,
            block.timestamp
        );

        return netRefund;
    }

    // ============================================
    // Yield Management (Keeper Functions)
    // ============================================

    /**
     * @notice Harvest yield from Kintsu vault
     * @dev Only keeper or owner can call this
     * @dev Uses a simplified approach: converts excess value to shares and requests unlock
     * @return yieldMon Amount of MON yield identified
     */
    function harvest() external onlyKeeperOrOwner nonReentrant returns (uint256 yieldMon) {
        // Get current Kintsu position value
        uint256 kintsuShares = kintsu.balanceOf(address(this));
        uint256 currentMonValue = 0;
        if (kintsuShares > 0) {
            currentMonValue = kintsu.convertToAssets(uint96(kintsuShares));
        }

        // Calculate yield (current value - staked)
        yieldMon = 0;
        if (currentMonValue > totalMonStaked) {
            yieldMon = currentMonValue - totalMonStaked;
        }

        require(yieldMon > 0, "No yield to harvest");

        // Update stats
        totalYieldHarvested += yieldMon;

        // Update accumulated yield per share (in MON)
        if (totalMonStaked > 0) {
            accYieldPerShare += (yieldMon * 1e18) / totalMonStaked;
        }

        lastHarvestTime = block.timestamp;

        emit YieldHarvested(yieldMon, currentMonValue, block.timestamp);

        return yieldMon;
    }

    /**
     * @notice Withdraw yield from Kintsu for distribution
     * @dev Keeper function to extract harvested yield for conversion/distribution
     * @param yieldAmount Amount of MON yield to withdraw
     */
    function withdrawYield(uint96 yieldAmount) external onlyKeeperOrOwner nonReentrant {
        require(yieldAmount > 0, "Amount must be > 0");

        // Convert yield amount to shares
        uint96 shares = kintsu.convertToShares(yieldAmount);

        // Request unlock for yield
        kintsu.requestUnlock(shares, 0);

        // Note: Yield redemption must be handled separately after cooldown
        // Keeper should track this unlock request index for later redemption
    }

    /**
     * @notice Redeem yield unlock request after cooldown
     * @dev Called by keeper after cooldown period for yield extraction
     * @param unlockIndex The index of the yield unlock request
     */
    function redeemYield(uint256 unlockIndex) external onlyKeeperOrOwner nonReentrant returns (uint96 assets) {
        assets = kintsu.redeem(unlockIndex, payable(address(this)));
        // Yield MON now available in contract for conversion/allocation
        return assets;
    }

    /**
     * @notice Convert harvested MON yield to TOURS and allocate to DragonRouter
     * @dev Optional function - only if we want to distribute yield as TOURS
     * @param monAmount Amount of MON to convert
     * @param location The location/destination for yield allocation
     */
    function convertAndAllocateYield(uint256 monAmount, string memory location) external onlyOwner nonReentrant {
        require(bytes(location).length > 0, "Invalid location");
        require(monAmount > 0, "Amount must be > 0");
        require(address(this).balance >= monAmount, "Insufficient MON balance");
        require(address(tokenSwap) != address(0), "TokenSwap not set");

        // Swap MON → TOURS via TokenSwap
        uint256 toursAmount = tokenSwap.swapMONForTOURS{value: monAmount}(monAmount);
        require(toursAmount > 0, "Swap failed");

        // Allocate TOURS to DragonRouter
        toursToken.safeIncreaseAllowance(dragonRouter, toursAmount);
        (bool success, ) = dragonRouter.call(
            abi.encodeWithSignature("allocateYield(string,uint256)", location, toursAmount)
        );
        require(success, "DragonRouter call failed");

        emit YieldAllocatedToDragonRouter(location, toursAmount, block.timestamp);
    }

    // ============================================
    // Internal Kintsu Functions
    // ============================================

    function _depositToKintsu(uint96 monAmount) internal returns (uint96 shares) {
        require(monAmount > 0, "Amount must be > 0");
        // Call Kintsu's deposit(uint96 minShares, address receiver)
        // minShares = 0 (no slippage protection needed for our use case)
        // receiver = address(this) (contract receives the shares)
        shares = kintsu.deposit{value: monAmount}(0, address(this));
        return shares;
    }

    // ============================================
    // View Functions
    // ============================================

    function getPosition(uint256 positionId) external view returns (StakingPosition memory) {
        return stakingPositions[positionId];
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function getPositionState(uint256 positionId) external view returns (PositionState) {
        return stakingPositions[positionId].state;
    }

    function canFinalizeUnstake(uint256 positionId) external view returns (bool) {
        StakingPosition memory pos = stakingPositions[positionId];
        if (pos.state != PositionState.PendingWithdrawal || !pos.unlockRequest.exists) {
            return false;
        }

        // Check if unlock request is ready in Kintsu
        // Note: This requires checking batch submission status, which isn't easily verifiable on-chain
        // Best approach: User should try to finalize, and it will revert if not ready
        return true; // Simplified - actual readiness checked by Kintsu on redeem()
    }

    function getPortfolioValue(address user) external view returns (uint256 totalValue) {
        uint256[] memory positions = userPositions[user];
        for (uint256 i = 0; i < positions.length; i++) {
            StakingPosition memory pos = stakingPositions[positions[i]];
            if (pos.state == PositionState.Active) {
                uint256 yieldShare = ((pos.monStaked * accYieldPerShare) / 1e18) - pos.yieldDebt;
                totalValue += pos.monStaked + yieldShare;
            } else if (pos.state == PositionState.PendingWithdrawal) {
                // Use expected spot value from unlock request
                totalValue += pos.unlockRequest.expectedSpotValue;
            }
        }
        return totalValue;
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getTOURSBalance() external view returns (uint256) {
        return toursToken.balanceOf(address(this));
    }

    function getKintsuBalance() external view returns (uint256 shares, uint256 monValue) {
        shares = kintsu.balanceOf(address(this));
        if (shares > 0) {
            monValue = kintsu.convertToAssets(uint96(shares));
        }
        return (shares, monValue);
    }

    function getTotalAssets() external view returns (uint256) {
        uint256 kintsuShares = kintsu.balanceOf(address(this));
        if (kintsuShares > 0) {
            return kintsu.convertToAssets(uint96(kintsuShares));
        }
        return 0;
    }

    function getActivePositionCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < positionCounter; i++) {
            if (stakingPositions[i].state == PositionState.Active) {
                count++;
            }
        }
        return count;
    }

    function getPendingWithdrawalCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < positionCounter; i++) {
            if (stakingPositions[i].state == PositionState.PendingWithdrawal) {
                count++;
            }
        }
        return count;
    }

    // ============================================
    // Emergency Functions
    // ============================================

    function emergencyWithdrawMON(uint256 amount) external onlyOwner {
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Emergency withdrawal failed");
    }

    function emergencyWithdrawTOURS(uint256 amount) external onlyOwner {
        toursToken.safeTransfer(owner(), amount);
    }

    // Receive function to accept MON
    receive() external payable {}
}
