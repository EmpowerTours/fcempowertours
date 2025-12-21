// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IKintsu {
    function deposit(uint96 minShares, address receiver) external payable returns (uint96 shares);
    function withdraw(uint256 shares) external returns (uint256 assets);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function previewWithdraw(uint256 assets) external view returns (uint256);
}

interface ITokenSwap {
    function swapMONForTOURS(uint256 monAmount) external payable returns (uint256 toursAmount);
}

/**
 * @title EmpowerToursYieldStrategyV8
 * @notice V8 = Fixed Kintsu deposit function signature
 * @dev Users deposit MON → Kintsu (0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5), receive MON back on unstake
 * @dev Uses correct deposit(uint96 minShares, address receiver) function
 */
contract EmpowerToursYieldStrategyV8 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant WITHDRAWAL_FEE_BP = 50; // 0.5%

    // Core contract references
    IERC20 public immutable toursToken;
    IKintsu public immutable kintsu;
    ITokenSwap public tokenSwap;  // Optional: for yield conversion only
    address public dragonRouter;
    address public keeper;

    // NFT Whitelist
    mapping(address => bool) public acceptedNFTs;

    /**
     * @dev Staking position structure
     */
    struct StakingPosition {
        address nftAddress;
        uint256 nftTokenId;
        address owner;           // Who staked (can be Safe)
        address beneficiary;     // Who owns NFT and gets rewards
        uint256 depositTime;
        uint256 monStaked;       // MON deposited (not TOURS)
        uint256 monDeployed;     // MON deployed to Kintsu
        uint256 yieldDebt;       // Accumulated yield per share when position created
        bool active;
    }

    // State variables
    uint256 public positionCounter;
    mapping(uint256 => StakingPosition) public stakingPositions;
    mapping(address => uint256[]) public userPositions;
    mapping(address => mapping(uint256 => bool)) public nftCollateralUsed;

    // Global stats
    uint256 public totalMonStaked;
    uint256 public totalMonDeployed;
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
        uint256 timestamp
    );
    event StakingPositionClosed(
        uint256 indexed positionId,
        address indexed user,
        uint256 monStaked,
        uint256 yieldShare,
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
        kintsu = IKintsu(_kintsu);
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
     * @dev V6: Accepts MON directly (payable), no TOURS→MON swap needed
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

        // Deploy MON to Kintsu vault
        _depositToKintsu(monAmount);

        // Create staking position
        positionId = positionCounter++;
        stakingPositions[positionId] = StakingPosition({
            nftAddress: nftAddress,
            nftTokenId: nftTokenId,
            owner: msg.sender,
            beneficiary: beneficiary,
            depositTime: block.timestamp,
            monStaked: monAmount,
            monDeployed: monAmount,
            yieldDebt: (monAmount * accYieldPerShare) / 1e18,
            active: true
        });

        // Track position by beneficiary
        userPositions[beneficiary].push(positionId);
        nftCollateralUsed[nftAddress][nftTokenId] = true;

        // Update global stats
        totalMonStaked += monAmount;
        totalMonDeployed += monAmount;

        emit StakingPositionCreated(
            positionId,
            nftAddress,
            nftTokenId,
            msg.sender,
            beneficiary,
            monAmount,
            block.timestamp
        );

        return positionId;
    }

    /**
     * @notice Unstake a position and claim rewards in MON
     * @dev Both beneficiary and owner can unstake
     * @param positionId The position ID to unstake
     * @return netRefund The amount of MON refunded (after fees)
     */
    function unstake(uint256 positionId) external nonReentrant returns (uint256 netRefund) {
        StakingPosition storage pos = stakingPositions[positionId];

        // Validation
        require(pos.active, "Position not active");
        require(pos.beneficiary == msg.sender || pos.owner == msg.sender, "Not authorized");

        // If owner unstakes, verify NFT is still owned by beneficiary
        if (msg.sender == pos.owner) {
            address currentNftOwner = IERC721(pos.nftAddress).ownerOf(pos.nftTokenId);
            require(currentNftOwner == pos.beneficiary, "NFT ownership changed");
        }

        // Mark position as closed
        pos.active = false;
        nftCollateralUsed[pos.nftAddress][pos.nftTokenId] = false;

        // Calculate yield share using per-position tracking
        uint256 yieldShare = ((pos.monStaked * accYieldPerShare) / 1e18) - pos.yieldDebt;

        // Calculate refund with fee (in MON)
        uint256 totalRefund = pos.monStaked + yieldShare;
        uint256 fee = (totalRefund * WITHDRAWAL_FEE_BP) / BASIS_POINTS;
        netRefund = totalRefund - fee;

        // Update global stats
        totalMonStaked -= pos.monStaked;

        // Withdraw MON from Kintsu
        if (pos.monDeployed > 0) {
            _withdrawFromKintsu(pos.monDeployed);
            totalMonDeployed -= pos.monDeployed;
        }

        // Transfer MON to whoever initiated unstake
        (bool success, ) = msg.sender.call{value: netRefund}("");
        require(success, "MON transfer failed");

        totalPositionsClosed++;
        totalYieldDistributed += yieldShare;

        emit StakingPositionClosed(positionId, msg.sender, pos.monStaked, yieldShare, block.timestamp);

        return netRefund;
    }

    // ============================================
    // Yield Management (Keeper Functions)
    // ============================================

    /**
     * @notice Harvest yield from Kintsu vault
     * @dev Only keeper or owner can call this
     * @return yieldMon Amount of MON yield harvested
     */
    function harvest() external onlyKeeperOrOwner nonReentrant returns (uint256 yieldMon) {
        // Get current Kintsu position value
        uint256 kintsuBalance = kintsu.balanceOf(address(this));
        uint256 currentMonValue = 0;
        if (kintsuBalance > 0) {
            currentMonValue = kintsu.previewRedeem(kintsuBalance);
        }

        // Calculate yield (current value - deployed)
        yieldMon = 0;
        if (currentMonValue > totalMonDeployed) {
            yieldMon = currentMonValue - totalMonDeployed;
        }

        require(yieldMon > 0, "No yield to harvest");

        // Withdraw yield from Kintsu
        _withdrawFromKintsu(yieldMon);

        // Update stats
        totalYieldHarvested += yieldMon;

        // Update accumulated yield per share (in MON, not TOURS)
        if (totalMonStaked > 0) {
            accYieldPerShare += (yieldMon * 1e18) / totalMonStaked;
        }

        lastHarvestTime = block.timestamp;

        emit YieldHarvested(yieldMon, currentMonValue, block.timestamp);

        return yieldMon;
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

    function _depositToKintsu(uint256 monAmount) internal {
        require(monAmount > 0, "Amount must be > 0");
        // Call Kintsu's deposit(uint96 minShares, address receiver)
        // minShares = 0 (no slippage protection needed for our use case)
        // receiver = address(this) (contract receives the shares)
        kintsu.deposit{value: monAmount}(0, address(this));
    }

    function _withdrawFromKintsu(uint256 monAmount) internal {
        require(monAmount > 0, "Amount must be > 0");
        uint256 shares = kintsu.previewWithdraw(monAmount);
        if (shares > 0) {
            uint256 assets = kintsu.redeem(shares, address(this), address(this));
            require(assets >= monAmount, "Insufficient withdrawal");
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
                uint256 yieldShare = ((pos.monStaked * accYieldPerShare) / 1e18) - pos.yieldDebt;
                totalValue += pos.monStaked + yieldShare;
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
            monValue = kintsu.previewRedeem(shares);
        }
        return (shares, monValue);
    }

    function getTotalAssets() external view returns (uint256) {
        uint256 kintsuBalance = kintsu.balanceOf(address(this));
        if (kintsuBalance > 0) {
            return kintsu.previewRedeem(kintsuBalance);
        }
        return 0;
    }

    function getActivePositionCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < positionCounter; i++) {
            if (stakingPositions[i].active) {
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
