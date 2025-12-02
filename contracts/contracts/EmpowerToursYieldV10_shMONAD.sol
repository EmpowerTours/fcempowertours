// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title shMONAD Interface (ERC4626 Vault)
 * @notice Interface for shmonad.xyz liquid staking derivative
 * @dev Mainnet: 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c
 * @dev Testnet: 0xbB010Cb7e71D44d7323aE1C267B333A48D05907C
 * @dev Uses ERC4626 vault standard
 */
interface IshMONAD {
    // ERC4626 Core Functions

    /// @notice Deposit MON and receive shMON shares
    /// @param assets Amount of MON to deposit
    /// @param receiver Address to receive the shares
    /// @return shares Amount of shMON shares minted
    function deposit(uint256 assets, address receiver) external payable returns (uint256 shares);

    /// @notice Mint exact shares by depositing MON
    function mint(uint256 shares, address receiver) external payable returns (uint256 assets);

    /// @notice Withdraw MON by burning shares (may be subject to restrictions)
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    /// @notice Redeem shares for MON (may be subject to restrictions)
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    // ERC4626 View Functions

    /// @notice Get share balance
    function balanceOf(address account) external view returns (uint256);

    /// @notice Convert assets (MON) to shares (shMON)
    function convertToShares(uint256 assets) external view returns (uint256);

    /// @notice Convert shares (shMON) to assets (MON)
    function convertToAssets(uint256 shares) external view returns (uint256);

    /// @notice Total assets under management
    function totalAssets() external view returns (uint256);

    /// @notice Total supply of shares
    function totalSupply() external view returns (uint256);

    /// @notice Preview deposit (how many shares for given assets)
    function previewDeposit(uint256 assets) external view returns (uint256);

    /// @notice Preview redeem (how many assets for given shares)
    function previewRedeem(uint256 shares) external view returns (uint256);

    // shMONAD-specific unstaking functions (if available)

    /// @notice Request traditional unstake (lower fee, ~27.5hr wait)
    function requestUnstake(uint256 shares) external returns (uint256 requestId);

    /// @notice Complete unstake after cooldown
    function completeUnstake(uint256 requestId) external returns (uint256 assets);

    /// @notice Atomic unstake (instant, fee 0.005%-1.005% based on utilization)
    function atomicUnstake(uint256 shares) external returns (uint256 assets);
}

/**
 * @title EmpowerToursYieldV10_shMONAD
 * @notice Simplified yield strategy using shMONAD for Monad mainnet
 * @dev Removed: TOURS token, TokenSwap, Tanda pool complexity
 * @dev Uses shMONAD (0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c) for staking rewards
 */
contract EmpowerToursYieldV10_shMONAD is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant WITHDRAWAL_FEE_BP = 50; // 0.5% platform fee
    uint256 public constant ESTIMATED_COOLDOWN = 28 hours; // ~27.5 hours per shMonad docs

    // shMONAD contract addresses
    // Mainnet: 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c
    // Testnet: 0x3a98250F98Dd388C211206983453837C8365BDc1

    // ============================================
    // Position States
    // ============================================
    enum PositionState {
        Active,             // Actively staked in shMONAD
        PendingWithdrawal,  // Unstake requested, waiting for cooldown
        Closed              // Position closed
    }

    // ============================================
    // Structs
    // ============================================
    struct UnstakeRequest {
        uint256 requestId;      // shMONAD unstake request ID
        uint256 sharesAmount;   // shMON shares being unstaked
        uint256 expectedMon;    // Expected MON at completion
        uint256 requestTime;    // When request was made
        bool exists;
    }

    struct StakingPosition {
        address nftAddress;     // NFT used as "proof of engagement"
        uint256 nftTokenId;     // Token ID
        address owner;          // Who created the position
        address beneficiary;    // Who owns NFT & receives rewards
        uint256 depositTime;    // When position was created
        uint256 monStaked;      // Original MON deposited
        uint256 shMonShares;    // shMON shares held
        uint256 yieldDebt;      // For yield tracking
        PositionState state;
        UnstakeRequest unstakeRequest;
    }

    // ============================================
    // State Variables
    // ============================================
    IshMONAD public immutable shMonad;

    uint256 public positionCounter;
    mapping(uint256 => StakingPosition) public positions;
    mapping(address => uint256[]) public userPositions;
    mapping(address => mapping(uint256 => bool)) public nftUsed;

    // NFT whitelist
    mapping(address => bool) public acceptedNFTs;

    // Global stats
    uint256 public totalMonStaked;
    uint256 public totalShMonShares;
    uint256 public accYieldPerShare; // Scaled by 1e18
    uint256 public lastYieldUpdate;

    // Treasury
    address public treasury;

    // ============================================
    // Events
    // ============================================
    event NFTWhitelisted(address indexed nftAddress, bool accepted);
    event PositionCreated(
        uint256 indexed positionId,
        address indexed beneficiary,
        address nftAddress,
        uint256 nftTokenId,
        uint256 monAmount,
        uint256 shMonShares
    );
    event UnstakeRequested(
        uint256 indexed positionId,
        uint256 shares,
        uint256 expectedMon,
        uint256 estimatedReadyTime
    );
    event PositionClosed(
        uint256 indexed positionId,
        address indexed beneficiary,
        uint256 monReturned,
        uint256 yieldEarned
    );
    event AtomicUnstake(
        uint256 indexed positionId,
        uint256 monReturned,
        uint256 feesPaid
    );
    event YieldUpdated(uint256 newYield, uint256 totalValue);
    event TreasuryUpdated(address indexed newTreasury);

    // ============================================
    // Constructor
    // ============================================
    constructor(address _shMonad, address _treasury) Ownable(msg.sender) {
        require(_shMonad != address(0), "Invalid shMONAD");
        require(_treasury != address(0), "Invalid treasury");
        shMonad = IshMONAD(_shMonad);
        treasury = _treasury;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function whitelistNFT(address nftAddress, bool accepted) external onlyOwner {
        require(nftAddress != address(0), "Invalid NFT");
        acceptedNFTs[nftAddress] = accepted;
        emit NFTWhitelisted(nftAddress, accepted);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // ============================================
    // Core Staking Functions
    // ============================================

    /**
     * @notice Stake MON with NFT as proof of engagement
     * @dev NFT stays with owner, just used to prove ownership
     * @param nftAddress Whitelisted NFT contract
     * @param nftTokenId Token ID owned by msg.sender or beneficiary
     * @param beneficiary Who receives the rewards (must own NFT)
     */
    function stake(
        address nftAddress,
        uint256 nftTokenId,
        address beneficiary
    ) external payable nonReentrant returns (uint256 positionId) {
        require(msg.value > 0, "Must stake MON");
        require(acceptedNFTs[nftAddress], "NFT not accepted");
        require(beneficiary != address(0), "Invalid beneficiary");
        require(!nftUsed[nftAddress][nftTokenId], "NFT already used");

        // Verify NFT ownership
        address nftOwner = IERC721(nftAddress).ownerOf(nftTokenId);
        require(nftOwner == beneficiary, "Beneficiary must own NFT");

        // Stake MON in shMONAD via ERC4626 deposit
        // deposit(assets, receiver) - we receive shares to this contract
        uint256 shares = shMonad.deposit{value: msg.value}(msg.value, address(this));
        require(shares > 0, "Staking failed");

        // Create position
        positionId = positionCounter++;
        StakingPosition storage pos = positions[positionId];
        pos.nftAddress = nftAddress;
        pos.nftTokenId = nftTokenId;
        pos.owner = msg.sender;
        pos.beneficiary = beneficiary;
        pos.depositTime = block.timestamp;
        pos.monStaked = msg.value;
        pos.shMonShares = shares;
        pos.yieldDebt = (msg.value * accYieldPerShare) / 1e18;
        pos.state = PositionState.Active;

        // Track
        userPositions[beneficiary].push(positionId);
        nftUsed[nftAddress][nftTokenId] = true;

        // Update globals
        totalMonStaked += msg.value;
        totalShMonShares += shares;

        emit PositionCreated(
            positionId,
            beneficiary,
            nftAddress,
            nftTokenId,
            msg.value,
            shares
        );

        return positionId;
    }

    /**
     * @notice Request unstake (traditional path - lower fees, ~27.5hr wait)
     * @param positionId Position to unstake
     */
    function requestUnstake(uint256 positionId) external nonReentrant returns (uint256 expectedMon) {
        StakingPosition storage pos = positions[positionId];

        require(pos.state == PositionState.Active, "Position not active");
        require(
            msg.sender == pos.beneficiary || msg.sender == pos.owner,
            "Not authorized"
        );

        // Verify NFT still owned
        address currentOwner = IERC721(pos.nftAddress).ownerOf(pos.nftTokenId);
        require(currentOwner == pos.beneficiary, "NFT ownership changed");

        // Request unstake from shMONAD
        uint256 requestId = shMonad.requestUnstake(pos.shMonShares);
        expectedMon = shMonad.convertToAssets(pos.shMonShares);

        // Update position
        pos.state = PositionState.PendingWithdrawal;
        pos.unstakeRequest = UnstakeRequest({
            requestId: requestId,
            sharesAmount: pos.shMonShares,
            expectedMon: expectedMon,
            requestTime: block.timestamp,
            exists: true
        });

        // Update globals
        totalShMonShares -= pos.shMonShares;

        emit UnstakeRequested(
            positionId,
            pos.shMonShares,
            expectedMon,
            block.timestamp + ESTIMATED_COOLDOWN
        );

        return expectedMon;
    }

    /**
     * @notice Complete unstake after cooldown period
     * @param positionId Position to complete
     */
    function completeUnstake(uint256 positionId) external nonReentrant returns (uint256 netAmount) {
        StakingPosition storage pos = positions[positionId];

        require(pos.state == PositionState.PendingWithdrawal, "Not pending");
        require(pos.unstakeRequest.exists, "No request");
        require(
            msg.sender == pos.beneficiary || msg.sender == pos.owner,
            "Not authorized"
        );

        // Complete unstake from shMONAD
        uint256 monReturned = shMonad.completeUnstake(pos.unstakeRequest.requestId);

        // Calculate yield
        uint256 yieldEarned = _calculateYield(pos);
        uint256 totalReturn = monReturned + yieldEarned;

        // Platform fee
        uint256 fee = (totalReturn * WITHDRAWAL_FEE_BP) / BASIS_POINTS;
        netAmount = totalReturn - fee;

        // Close position
        pos.state = PositionState.Closed;
        nftUsed[pos.nftAddress][pos.nftTokenId] = false;
        totalMonStaked -= pos.monStaked;

        // Transfer fee to treasury
        if (fee > 0) {
            (bool feeSuccess, ) = treasury.call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
        }

        // Transfer to beneficiary
        (bool success, ) = pos.beneficiary.call{value: netAmount}("");
        require(success, "Transfer failed");

        emit PositionClosed(positionId, pos.beneficiary, netAmount, yieldEarned);

        return netAmount;
    }

    /**
     * @notice Instant unstake using shMONAD atomic pool (higher fees)
     * @dev Useful for urgent withdrawals, fee depends on pool utilization
     * @param positionId Position to instantly unstake
     */
    function atomicUnstake(uint256 positionId) external nonReentrant returns (uint256 netAmount) {
        StakingPosition storage pos = positions[positionId];

        require(pos.state == PositionState.Active, "Position not active");
        require(
            msg.sender == pos.beneficiary || msg.sender == pos.owner,
            "Not authorized"
        );

        // Verify NFT still owned
        address currentOwner = IERC721(pos.nftAddress).ownerOf(pos.nftTokenId);
        require(currentOwner == pos.beneficiary, "NFT ownership changed");

        // Atomic unstake from shMONAD (instant, higher fee)
        uint256 monReturned = shMonad.atomicUnstake(pos.shMonShares);

        // Calculate yield
        uint256 yieldEarned = _calculateYield(pos);
        uint256 totalReturn = monReturned + yieldEarned;

        // Platform fee
        uint256 fee = (totalReturn * WITHDRAWAL_FEE_BP) / BASIS_POINTS;
        netAmount = totalReturn - fee;

        // Close position
        pos.state = PositionState.Closed;
        nftUsed[pos.nftAddress][pos.nftTokenId] = false;
        totalMonStaked -= pos.monStaked;
        totalShMonShares -= pos.shMonShares;

        // Transfer fee to treasury
        if (fee > 0) {
            (bool feeSuccess, ) = treasury.call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
        }

        // Transfer to beneficiary
        (bool success, ) = pos.beneficiary.call{value: netAmount}("");
        require(success, "Transfer failed");

        emit AtomicUnstake(positionId, netAmount, fee);

        return netAmount;
    }

    // ============================================
    // Yield Management
    // ============================================

    /**
     * @notice Update yield tracking based on shMONAD appreciation
     * @dev Called periodically to update accYieldPerShare
     */
    function updateYield() external returns (uint256 newYield) {
        if (totalShMonShares == 0) return 0;

        // Get current value of our shMON holdings (ERC4626 convertToAssets)
        uint256 currentMonValue = shMonad.convertToAssets(totalShMonShares);

        // Calculate yield
        if (currentMonValue > totalMonStaked) {
            newYield = currentMonValue - totalMonStaked;
            accYieldPerShare += (newYield * 1e18) / totalMonStaked;
        }

        lastYieldUpdate = block.timestamp;

        emit YieldUpdated(newYield, currentMonValue);

        return newYield;
    }

    // ============================================
    // Internal Functions
    // ============================================

    function _calculateYield(StakingPosition storage pos) internal view returns (uint256) {
        return ((pos.monStaked * accYieldPerShare) / 1e18) - pos.yieldDebt;
    }

    // ============================================
    // View Functions
    // ============================================

    function getPosition(uint256 positionId) external view returns (StakingPosition memory) {
        return positions[positionId];
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function getPositionValue(uint256 positionId) external view returns (uint256 monValue, uint256 yield) {
        StakingPosition memory pos = positions[positionId];
        if (pos.state == PositionState.Active) {
            monValue = shMonad.convertToAssets(pos.shMonShares);
            yield = ((pos.monStaked * accYieldPerShare) / 1e18) - pos.yieldDebt;
        } else if (pos.state == PositionState.PendingWithdrawal) {
            monValue = pos.unstakeRequest.expectedMon;
            yield = 0;
        }
        return (monValue, yield);
    }

    function getTotalValue() external view returns (uint256) {
        return shMonad.convertToAssets(totalShMonShares);
    }

    function getActivePositionCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < positionCounter; i++) {
            if (positions[i].state == PositionState.Active) count++;
        }
    }

    // ============================================
    // Emergency Functions
    // ============================================

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Withdraw failed");
        }
    }

    receive() external payable {}
}
