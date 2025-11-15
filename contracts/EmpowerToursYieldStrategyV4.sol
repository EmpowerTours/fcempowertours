// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
 * @title EmpowerToursYieldStrategyV4
 * @notice V4 = V3 + eliminates approve + spend pattern for AA compatibility
 * @dev CRITICAL FIX: stakeWithDeposit accepts TOURS in same transaction via transferFrom with allowance check
 *      This allows the Safe to approve once, then stake many times without batching approve + spend
 */
contract EmpowerToursYieldStrategyV4 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant WITHDRAWAL_FEE_BP = 50;

    IERC20 public toursToken;
    IKintsu public kintsu;
    ITokenSwap public tokenSwap;
    address public dragonRouter;
    address public keeper;

    // V2: NFT Whitelist
    mapping(address => bool) public acceptedNFTs;

    struct StakingPosition {
        address nftAddress;
        uint256 nftTokenId;
        address owner;           // The Safe that staked
        address beneficiary;     // The actual NFT owner who receives rewards
        uint256 depositTime;
        uint256 toursStaked;
        uint256 monDeployed;
        bool active;
    }

    uint256 public positionCounter;
    mapping(uint256 => StakingPosition) public stakingPositions;
    mapping(address => uint256[]) public userPositions;
    mapping(address => mapping(uint256 => bool)) public nftCollateralUsed;

    uint256 public totalToursStaked;
    uint256 public totalMonDeployed;
    uint256 public totalYieldHarvested;
    uint256 public lastHarvestTime;
    uint256 public totalPositionsClosed;
    uint256 public totalYieldDistributed;

    event Initialized(address indexed toursToken, address indexed kintsu, address indexed tokenSwap, address dragonRouter, address keeper);
    event NFTWhitelisted(address indexed nftAddress, bool accepted);
    event StakingPositionCreated(uint256 indexed positionId, address indexed nftAddress, uint256 indexed nftTokenId, address owner, address beneficiary, uint256 toursAmount, uint256 monAmount, uint256 timestamp);
    event StakingPositionClosed(uint256 indexed positionId, address indexed beneficiary, uint256 toursRefund, uint256 yieldShare, uint256 timestamp);
    event YieldHarvested(uint256 yieldMonAmount, uint256 yieldToursAmount, uint256 totalAssets, uint256 timestamp);
    event YieldAllocatedToDragonRouter(string indexed location, uint256 amount, uint256 timestamp);
    event KeeperUpdated(address indexed newKeeper);
    event DragonRouterUpdated(address indexed newRouter);
    event TokenSwapUpdated(address indexed newSwap);

    modifier onlyKeeperOrOwner() {
        require(msg.sender == keeper || msg.sender == owner(), "Not authorized");
        _;
    }

    constructor(address _toursToken, address _kintsu, address _tokenSwap, address _dragonRouter, address _keeper) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS");
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

        emit Initialized(_toursToken, _kintsu, _tokenSwap, _dragonRouter, _keeper);
    }

    // V2: Whitelist management
    function addAcceptedNFT(address nftAddress) external onlyOwner {
        require(nftAddress != address(0), "Invalid NFT address");
        acceptedNFTs[nftAddress] = true;
        emit NFTWhitelisted(nftAddress, true);
    }

    function removeAcceptedNFT(address nftAddress) external onlyOwner {
        acceptedNFTs[nftAddress] = false;
        emit NFTWhitelisted(nftAddress, false);
    }

    /**
     * @notice V4: Stake with deposit in same transaction - NO APPROVE NEEDED IN BATCH
     * @dev The caller must have ALREADY approved this contract to spend TOURS tokens
     *      This eliminates the approve + spend pattern that breaks AA bundler gas estimation
     *      Usage:
     *        1. Safe approves YieldStrategy for max uint256 (one-time setup)
     *        2. Safe calls stakeWithDeposit (uses existing allowance)
     *        3. No batching needed - single transaction
     *
     * @param nftAddress Address of the NFT contract (must be whitelisted)
     * @param nftTokenId Token ID of the NFT (must be owned by beneficiary)
     * @param toursAmount Amount of TOURS to stake
     * @param beneficiary Address that owns the NFT and will receive rewards
     * @return positionId The ID of the created position
     */
    function stakeWithDeposit(
        address nftAddress,
        uint256 nftTokenId,
        uint256 toursAmount,
        address beneficiary
    ) external nonReentrant returns (uint256 positionId) {
        require(toursAmount > 0, "Amount must be > 0");
        require(acceptedNFTs[nftAddress], "Invalid NFT address");
        require(beneficiary != address(0), "Invalid beneficiary");
        require(IERC721(nftAddress).ownerOf(nftTokenId) == beneficiary, "Beneficiary must own NFT");
        require(!nftCollateralUsed[nftAddress][nftTokenId], "NFT already used as collateral");

        // ✅ V4 FIX: Pull tokens using existing allowance (no approve needed in batch)
        // The caller must have pre-approved this contract (done once at setup)
        toursToken.safeTransferFrom(msg.sender, address(this), toursAmount);

        // Internal swap and deposit
        toursToken.approve(address(tokenSwap), toursAmount);
        uint256 monAmount = tokenSwap.swapTOURSForMON(toursAmount);
        require(monAmount > 0, "Swap failed: no MON received");

        _depositToKintsu(monAmount);

        positionId = positionCounter++;
        stakingPositions[positionId] = StakingPosition({
            nftAddress: nftAddress,
            nftTokenId: nftTokenId,
            owner: msg.sender,
            beneficiary: beneficiary,
            depositTime: block.timestamp,
            toursStaked: toursAmount,
            monDeployed: monAmount,
            active: true
        });
        userPositions[beneficiary].push(positionId);
        nftCollateralUsed[nftAddress][nftTokenId] = true;

        totalToursStaked += toursAmount;
        totalMonDeployed += monAmount;

        emit StakingPositionCreated(positionId, nftAddress, nftTokenId, msg.sender, beneficiary, toursAmount, monAmount, block.timestamp);
        return positionId;
    }

    /**
     * @notice V2: Unstake position (beneficiary receives rewards)
     * @dev Only the beneficiary can unstake, rewards go to beneficiary
     */
    function unstake(uint256 positionId) external nonReentrant returns (uint256 refund) {
        StakingPosition storage pos = stakingPositions[positionId];
        require(pos.active, "Position not active");
        require(pos.beneficiary == msg.sender, "Only beneficiary can unstake");

        pos.active = false;
        nftCollateralUsed[pos.nftAddress][pos.nftTokenId] = false;

        uint256 yieldShare = 0;
        if (totalYieldHarvested > 0 && totalToursStaked > 0) {
            yieldShare = (totalYieldHarvested * pos.toursStaked) / totalToursStaked;
        }

        refund = pos.toursStaked + yieldShare;
        uint256 fee = (refund * WITHDRAWAL_FEE_BP) / BASIS_POINTS;
        uint256 netRefund = refund - fee;

        totalToursStaked -= pos.toursStaked;

        if (pos.monDeployed > 0) {
            _withdrawFromKintsu(pos.monDeployed);
            totalMonDeployed -= pos.monDeployed;
        }

        toursToken.safeTransfer(pos.beneficiary, netRefund);
        totalPositionsClosed++;
        totalYieldDistributed += yieldShare;

        emit StakingPositionClosed(positionId, pos.beneficiary, pos.toursStaked, yieldShare, block.timestamp);
        return netRefund;
    }

    function harvest() external onlyKeeperOrOwner nonReentrant returns (uint256 yieldTours) {
        uint256 kintsuBalance = kintsu.balanceOf(address(this));
        uint256 currentMonValue = 0;
        if (kintsuBalance > 0) {
            currentMonValue = kintsu.previewRedeem(kintsuBalance);
        }

        uint256 yieldMon = 0;
        if (currentMonValue > totalMonDeployed) {
            yieldMon = currentMonValue - totalMonDeployed;
        }

        require(yieldMon > 0, "No yield to harvest");

        if (yieldMon > 0) {
            _withdrawFromKintsu(yieldMon);
        }

        yieldTours = tokenSwap.swapMONForTOURS(yieldMon);
        require(yieldTours > 0, "Swap failed");

        totalYieldHarvested += yieldTours;
        lastHarvestTime = block.timestamp;

        emit YieldHarvested(yieldMon, yieldTours, currentMonValue, block.timestamp);
        return yieldTours;
    }

    function allocateYieldToDragonRouter(string memory location, uint256 amount) external onlyOwner nonReentrant {
        require(bytes(location).length > 0, "Invalid location");
        require(amount > 0, "Amount > 0");
        require(toursToken.balanceOf(address(this)) >= amount, "Insufficient balance");

        toursToken.approve(dragonRouter, amount);
        (bool success, ) = dragonRouter.call(abi.encodeWithSignature("allocateYield(string,uint256)", location, amount));
        require(success, "DragonRouter call failed");

        emit YieldAllocatedToDragonRouter(location, amount, block.timestamp);
    }

    function _depositToKintsu(uint256 monAmount) internal {
        require(monAmount > 0, "Amount > 0");
        (bool success, ) = address(kintsu).call{value: monAmount}(abi.encodeWithSignature("deposit(uint256)", monAmount));
        require(success, "Kintsu deposit failed");
    }

    function _withdrawFromKintsu(uint256 monAmount) internal {
        require(monAmount > 0, "Amount > 0");
        uint256 shares = kintsu.previewDeposit(monAmount);
        if (shares > 0) {
            (bool success, ) = address(kintsu).call(abi.encodeWithSignature("redeem(uint256,address,address)", shares, address(this), address(this)));
            require(success, "Kintsu redeem failed");
        }
    }

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
                if (totalYieldHarvested > 0 && totalToursStaked > 0) {
                    uint256 userYield = (totalYieldHarvested * pos.toursStaked) / totalToursStaked;
                    totalValue += userYield;
                }
                uint256 timeStaked = block.timestamp - pos.depositTime;
                uint256 estimatedYield = (pos.toursStaked * 4 * timeStaked) / (100 * 365 days);
                totalValue += estimatedYield;
            }
        }
    }

    function getStrategyMetrics() external view returns (uint256, uint256, uint256, uint256, uint256, uint256) {
        return (totalToursStaked, totalMonDeployed, totalYieldHarvested, totalPositionsClosed, totalYieldDistributed, lastHarvestTime);
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

    function emergencyWithdraw() external onlyOwner {
        uint256 kintsuBalance = kintsu.balanceOf(address(this));
        if (kintsuBalance > 0) {
            (bool success, ) = address(kintsu).call(abi.encodeWithSignature("redeem(uint256,address,address)", kintsuBalance, address(this), address(this)));
            require(success, "Kintsu redeem failed");
        }
        uint256 monBalance = address(this).balance;
        if (monBalance > 0) {
            (bool success, ) = payable(owner()).call{value: monBalance}("");
            require(success, "MON transfer failed");
        }
        uint256 toursBalance = toursToken.balanceOf(address(this));
        if (toursBalance > 0) {
            toursToken.safeTransfer(owner(), toursBalance);
        }
    }

    receive() external payable {}
}
