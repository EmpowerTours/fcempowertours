// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IKintsu {
    function deposit(uint256 amount) external payable returns (uint256 shares);
    function withdraw(uint256 shares) external returns (uint256 assets);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
}

interface ITokenSwap {
    function swapTOURSForMON(uint256 toursAmount) external returns (uint256 monAmount);
    function swapMONForTOURS(uint256 monAmount) external returns (uint256 toursAmount);
}

/**
 * @title EmpowerToursYieldStrategyV5
 * @notice V5 = Proper delegated staking without NFT transfer requirement
 * @dev CRITICAL FIX: NFT stays with beneficiary, contract only verifies ownership
 * @dev For delegated staking: Safe deposits TOURS on behalf of beneficiary who owns NFT
 * @dev For MonadScan verification: Uses standard OpenZeppelin imports
 */
contract EmpowerToursYieldStrategyV5 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant WITHDRAWAL_FEE_BP = 50; // 0.5%

    // Core contract references
    IERC20 public immutable toursToken;
    IKintsu public immutable kintsu;
    ITokenSwap public tokenSwap;
    address public dragonRouter;
    address public keeper;

    // NFT Whitelist - only accepted NFTs can be used as collateral
    mapping(address => bool) public acceptedNFTs;

    /**
     * @dev Staking position structure
     * - nftAddress: The whitelisted NFT contract address
     * - nftTokenId: The specific NFT token ID used as collateral
     * - owner: The account that deposited TOURS (e.g., Safe)
     * - beneficiary: The account that owns the NFT and receives rewards
     * - depositTime: When the position was created
     * - toursStaked: Amount of TOURS tokens staked
     * - monDeployed: Amount of MON deployed to Kintsu
     * - active: Whether the position is still active
     */
    struct StakingPosition {
        address nftAddress;
        uint256 nftTokenId;
        address owner;           // Who staked (can be Safe)
        address beneficiary;     // Who owns NFT and gets rewards
        uint256 depositTime;
        uint256 toursStaked;
        uint256 monDeployed;
        bool active;
    }

    // State variables
    uint256 public positionCounter;
    mapping(uint256 => StakingPosition) public stakingPositions;
    mapping(address => uint256[]) public userPositions; // beneficiary => position IDs
    mapping(address => mapping(uint256 => bool)) public nftCollateralUsed; // nftAddress => tokenId => used

    // Global stats
    uint256 public totalToursStaked;
    uint256 public totalMonDeployed;
    uint256 public totalYieldHarvested;
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
        uint256 toursAmount,
        uint256 monAmount,
        uint256 timestamp
    );
    event StakingPositionClosed(
        uint256 indexed positionId,
        address indexed beneficiary,
        uint256 toursRefund,
        uint256 yieldShare,
        uint256 timestamp
    );
    event YieldHarvested(uint256 yieldMonAmount, uint256 yieldToursAmount, uint256 totalAssets, uint256 timestamp);
    event YieldAllocatedToDragonRouter(string indexed location, uint256 amount, uint256 timestamp);
    event KeeperUpdated(address indexed newKeeper);
    event DragonRouterUpdated(address indexed newRouter);
    event TokenSwapUpdated(address indexed newSwap);

    // Modifiers
    modifier onlyKeeperOrOwner() {
        require(msg.sender == keeper || msg.sender == owner(), "Not authorized");
        _;
    }

    /**
     * @notice Initialize the YieldStrategy contract
     * @param _toursToken TOURS ERC20 token address
     * @param _kintsu Kintsu vault address for MON staking
     * @param _tokenSwap TOURS<>MON swap contract
     * @param _dragonRouter Dragon router for yield allocation
     * @param _keeper Keeper address for automated operations
     */
    constructor(
        address _toursToken,
        address _kintsu,
        address _tokenSwap,
        address _dragonRouter,
        address _keeper
    ) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS token");
        require(_kintsu != address(0), "Invalid Kintsu");
        require(_tokenSwap != address(0), "Invalid TokenSwap");
        require(_dragonRouter != address(0), "Invalid DragonRouter");
        require(_keeper != address(0), "Invalid keeper");

        toursToken = IERC20(_toursToken);
        kintsu = IKintsu(_kintsu);
        tokenSwap = ITokenSwap(_tokenSwap);
        dragonRouter = _dragonRouter;
        keeper = _keeper;
        lastHarvestTime = block.timestamp;
    }

    // ============================================
    // NFT Whitelist Management
    // ============================================

    /**
     * @notice Add an NFT contract to the whitelist
     * @param nftAddress The NFT contract address to whitelist
     */
    function addAcceptedNFT(address nftAddress) external onlyOwner {
        require(nftAddress != address(0), "Invalid NFT address");
        acceptedNFTs[nftAddress] = true;
        emit NFTWhitelisted(nftAddress, true);
    }

    /**
     * @notice Remove an NFT contract from the whitelist
     * @param nftAddress The NFT contract address to remove
     */
    function removeAcceptedNFT(address nftAddress) external onlyOwner {
        acceptedNFTs[nftAddress] = false;
        emit NFTWhitelisted(nftAddress, false);
    }

    // ============================================
    // Staking Functions
    // ============================================

    /**
     * @notice Stake TOURS tokens with NFT collateral (V5: No NFT transfer required!)
     * @dev CRITICAL: NFT stays with beneficiary - only ownership is verified
     * @dev Perfect for delegated staking where Safe deposits on behalf of user
     * @param nftAddress The whitelisted NFT contract address
     * @param nftTokenId The NFT token ID (must be owned by beneficiary)
     * @param toursAmount Amount of TOURS to stake
     * @param beneficiary Address that owns the NFT and will receive rewards
     * @return positionId The created position ID
     */
    function stakeWithDeposit(
        address nftAddress,
        uint256 nftTokenId,
        uint256 toursAmount,
        address beneficiary
    ) external nonReentrant returns (uint256 positionId) {
        // Validation
        require(toursAmount > 0, "Amount must be > 0");
        require(acceptedNFTs[nftAddress], "NFT not whitelisted");
        require(beneficiary != address(0), "Invalid beneficiary");

        // ✅ CRITICAL: Verify beneficiary owns NFT (but don't transfer it!)
        address nftOwner = IERC721(nftAddress).ownerOf(nftTokenId);
        require(nftOwner == beneficiary, "Beneficiary must own NFT");

        // Check NFT isn't already used
        require(!nftCollateralUsed[nftAddress][nftTokenId], "NFT already used");

        // Transfer TOURS from msg.sender (could be Safe or user directly)
        toursToken.safeTransferFrom(msg.sender, address(this), toursAmount);

        // Swap TOURS for MON
        toursToken.safeIncreaseAllowance(address(tokenSwap), toursAmount);
        uint256 monAmount = tokenSwap.swapTOURSForMON(toursAmount);
        require(monAmount > 0, "Swap failed");

        // Deploy MON to Kintsu vault
        _depositToKintsu(monAmount);

        // Create staking position
        positionId = positionCounter++;
        stakingPositions[positionId] = StakingPosition({
            nftAddress: nftAddress,
            nftTokenId: nftTokenId,
            owner: msg.sender,           // Who deposited (Safe or user)
            beneficiary: beneficiary,     // Who owns NFT and gets rewards
            depositTime: block.timestamp,
            toursStaked: toursAmount,
            monDeployed: monAmount,
            active: true
        });

        // Track position by beneficiary
        userPositions[beneficiary].push(positionId);
        nftCollateralUsed[nftAddress][nftTokenId] = true;

        // Update global stats
        totalToursStaked += toursAmount;
        totalMonDeployed += monAmount;

        emit StakingPositionCreated(
            positionId,
            nftAddress,
            nftTokenId,
            msg.sender,
            beneficiary,
            toursAmount,
            monAmount,
            block.timestamp
        );

        return positionId;
    }

    /**
     * @notice Unstake a position and claim rewards
     * @dev Only the beneficiary can unstake their position
     * @param positionId The position ID to unstake
     * @return netRefund The amount of TOURS refunded (after fees)
     */
    function unstake(uint256 positionId) external nonReentrant returns (uint256 netRefund) {
        StakingPosition storage pos = stakingPositions[positionId];

        // Validation
        require(pos.active, "Position not active");
        require(pos.beneficiary == msg.sender, "Only beneficiary can unstake");

        // Mark position as closed
        pos.active = false;
        nftCollateralUsed[pos.nftAddress][pos.nftTokenId] = false;

        // Calculate yield share
        uint256 yieldShare = 0;
        if (totalYieldHarvested > 0 && totalToursStaked > 0) {
            yieldShare = (totalYieldHarvested * pos.toursStaked) / totalToursStaked;
        }

        // Calculate refund with fee
        uint256 totalRefund = pos.toursStaked + yieldShare;
        uint256 fee = (totalRefund * WITHDRAWAL_FEE_BP) / BASIS_POINTS;
        netRefund = totalRefund - fee;

        // Update global stats
        totalToursStaked -= pos.toursStaked;

        // Withdraw MON from Kintsu if needed
        if (pos.monDeployed > 0) {
            _withdrawFromKintsu(pos.monDeployed);
            totalMonDeployed -= pos.monDeployed;
        }

        // Transfer TOURS to beneficiary
        toursToken.safeTransfer(pos.beneficiary, netRefund);

        totalPositionsClosed++;
        totalYieldDistributed += yieldShare;

        emit StakingPositionClosed(positionId, pos.beneficiary, pos.toursStaked, yieldShare, block.timestamp);

        return netRefund;
    }

    // ============================================
    // Yield Management (Keeper Functions)
    // ============================================

    /**
     * @notice Harvest yield from Kintsu vault
     * @dev Only keeper or owner can call this
     * @return yieldTours Amount of TOURS yield harvested
     */
    function harvest() external onlyKeeperOrOwner nonReentrant returns (uint256 yieldTours) {
        // Get current Kintsu position value
        uint256 kintsuBalance = kintsu.balanceOf(address(this));
        uint256 currentMonValue = 0;
        if (kintsuBalance > 0) {
            currentMonValue = kintsu.previewRedeem(kintsuBalance);
        }

        // Calculate yield (current value - deployed)
        uint256 yieldMon = 0;
        if (currentMonValue > totalMonDeployed) {
            yieldMon = currentMonValue - totalMonDeployed;
        }

        require(yieldMon > 0, "No yield to harvest");

        // Withdraw yield from Kintsu
        _withdrawFromKintsu(yieldMon);

        // Swap MON back to TOURS
        yieldTours = tokenSwap.swapMONForTOURS(yieldMon);
        require(yieldTours > 0, "Swap failed");

        // Update stats
        totalYieldHarvested += yieldTours;
        lastHarvestTime = block.timestamp;

        emit YieldHarvested(yieldMon, yieldTours, currentMonValue, block.timestamp);

        return yieldTours;
    }

    /**
     * @notice Allocate yield to DragonRouter for community rewards
     * @param location The location/destination for yield allocation
     * @param amount Amount of TOURS to allocate
     */
    function allocateYieldToDragonRouter(string memory location, uint256 amount) external onlyOwner nonReentrant {
        require(bytes(location).length > 0, "Invalid location");
        require(amount > 0, "Amount must be > 0");
        require(toursToken.balanceOf(address(this)) >= amount, "Insufficient balance");

        toursToken.safeIncreaseAllowance(dragonRouter, amount);
        (bool success, ) = dragonRouter.call(
            abi.encodeWithSignature("allocateYield(string,uint256)", location, amount)
        );
        require(success, "DragonRouter call failed");

        emit YieldAllocatedToDragonRouter(location, amount, block.timestamp);
    }

    // ============================================
    // Internal Kintsu Functions
    // ============================================

    function _depositToKintsu(uint256 monAmount) internal {
        require(monAmount > 0, "Amount must be > 0");
        (bool success, ) = address(kintsu).call{value: monAmount}(
            abi.encodeWithSignature("deposit(uint256)", monAmount)
        );
        require(success, "Kintsu deposit failed");
    }

    function _withdrawFromKintsu(uint256 monAmount) internal {
        require(monAmount > 0, "Amount must be > 0");
        uint256 shares = kintsu.previewDeposit(monAmount);
        if (shares > 0) {
            (bool success, ) = address(kintsu).call(
                abi.encodeWithSignature("redeem(uint256,address,address)", shares, address(this), address(this))
            );
            require(success, "Kintsu redeem failed");
        }
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

    function getPortfolioValue(address user) external view returns (uint256 totalValue) {
        uint256[] memory positions = userPositions[user];
        for (uint256 i = 0; i < positions.length; i++) {
            StakingPosition memory pos = stakingPositions[positions[i]];
            if (pos.active) {
                totalValue += pos.toursStaked;

                // Add proportional yield
                if (totalYieldHarvested > 0 && totalToursStaked > 0) {
                    uint256 userYield = (totalYieldHarvested * pos.toursStaked) / totalToursStaked;
                    totalValue += userYield;
                }

                // Estimate pending yield (4% APY)
                uint256 timeStaked = block.timestamp - pos.depositTime;
                uint256 estimatedYield = (pos.toursStaked * 4 * timeStaked) / (100 * 365 days);
                totalValue += estimatedYield;
            }
        }
    }

    function getStrategyMetrics()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            totalToursStaked,
            totalMonDeployed,
            totalYieldHarvested,
            totalPositionsClosed,
            totalYieldDistributed,
            lastHarvestTime
        );
    }

    function getTotalAssets() external view returns (uint256) {
        uint256 kintsuBalance = kintsu.balanceOf(address(this));
        uint256 monValue = 0;
        if (kintsuBalance > 0) {
            monValue = kintsu.previewRedeem(kintsuBalance);
        }
        uint256 idleTours = toursToken.balanceOf(address(this));
        return monValue + idleTours;
    }

    function getActivePositionCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < positionCounter; i++) {
            if (stakingPositions[i].active) {
                count++;
            }
        }
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper");
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    function setDragonRouter(address newRouter) external onlyOwner {
        require(newRouter != address(0), "Invalid router");
        dragonRouter = newRouter;
        emit DragonRouterUpdated(newRouter);
    }

    function setTokenSwap(address newSwap) external onlyOwner {
        require(newSwap != address(0), "Invalid swap");
        tokenSwap = ITokenSwap(newSwap);
        emit TokenSwapUpdated(newSwap);
    }

    /**
     * @notice Emergency withdrawal function (owner only)
     * @dev Withdraws all assets from Kintsu and contract
     */
    function emergencyWithdraw() external onlyOwner {
        // Withdraw all from Kintsu
        uint256 kintsuBalance = kintsu.balanceOf(address(this));
        if (kintsuBalance > 0) {
            (bool success, ) = address(kintsu).call(
                abi.encodeWithSignature("redeem(uint256,address,address)", kintsuBalance, address(this), address(this))
            );
            require(success, "Kintsu redeem failed");
        }

        // Transfer all MON
        uint256 monBalance = address(this).balance;
        if (monBalance > 0) {
            (bool success, ) = payable(owner()).call{value: monBalance}("");
            require(success, "MON transfer failed");
        }

        // Transfer all TOURS
        uint256 toursBalance = toursToken.balanceOf(address(this));
        if (toursBalance > 0) {
            toursToken.safeTransfer(owner(), toursBalance);
        }
    }

    receive() external payable {}
}
