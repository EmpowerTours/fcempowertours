// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MirrorMate
 * @notice Tinder-style travel guide matching using Farcaster verified addresses
 * @dev First 10 skips free, then 0.01 MON per skip. Matching costs 10 MON.
 *      Accepts MON, WMON, or shMONAD for payments
 *      Uses Farcaster verified addresses from Neynar (no registration required)
 *      Supports delegation for gasless UX
 */
contract MirrorMate is Ownable, ReentrancyGuard {

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct UserStats {
        uint256 skipCount;
        uint256 matchCount;
        uint256 totalSpent;
        uint256 lastSkipAt;
    }

    struct Match {
        uint256 id;
        address user;
        uint256 userFid;
        uint256 guideFid;
        address guideAddress; // Verified address from Farcaster
        string guideName;
        uint256 amount;
        uint256 guideEarnings;
        uint256 platformFee;
        address paymentToken;
        uint256 matchedAt;
        bool isActive;
    }

    struct GuideEarnings {
        uint256 totalMatches;
        uint256 totalEarnings;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    IERC20 public mon;      // MON token
    IERC20 public wmon;     // Wrapped MON
    IERC20 public shMonad;  // shMONAD

    uint256 private _matchIdCounter;

    mapping(address => UserStats) public userStats;
    mapping(uint256 => Match) public matches;
    mapping(address => uint256[]) public userMatches;
    mapping(uint256 => uint256[]) public guideFidMatches; // FID -> match IDs
    mapping(address => GuideEarnings) public guideEarnings; // Track earnings by verified address
    mapping(address => bool) public acceptedTokens; // Whitelist for payment tokens

    address public platformWallet;

    // Constants
    uint256 public constant FREE_SKIP_LIMIT = 10;
    uint256 public constant SKIP_COST = 0.01 ether; // 0.01 MON (18 decimals)
    uint256 public constant MATCH_COST = 10 ether; // 10 MON (18 decimals)
    uint256 public constant GUIDE_PERCENTAGE = 70; // 70% to guide (7 MON)
    uint256 public constant PLATFORM_PERCENTAGE = 30; // 30% to platform (3 MON)

    // ========================================================================
    // EVENTS
    // ========================================================================

    event GuideSkipped(
        address indexed user,
        uint256 indexed guideFid,
        uint256 skipNumber,
        uint256 cost,
        address paymentToken,
        uint256 timestamp
    );

    event MatchCreated(
        uint256 indexed matchId,
        address indexed user,
        uint256 indexed guideFid,
        address guideAddress,
        string guideName,
        uint256 amount,
        uint256 guideEarnings,
        uint256 platformFee,
        address paymentToken,
        uint256 timestamp
    );

    event PlatformWalletUpdated(
        address indexed oldWallet,
        address indexed newWallet
    );

    event TokenUpdated(
        string tokenType,
        address indexed newToken
    );

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(
        address _mon,
        address _wmon,
        address _shMonad,
        address _platformWallet
    ) Ownable(msg.sender) {
        require(_mon != address(0), "Invalid MON");
        require(_wmon != address(0), "Invalid WMON");
        require(_shMonad != address(0), "Invalid shMONAD");
        require(_platformWallet != address(0), "Invalid platform wallet");

        mon = IERC20(_mon);
        wmon = IERC20(_wmon);
        shMonad = IERC20(_shMonad);
        platformWallet = _platformWallet;

        // Whitelist accepted tokens
        acceptedTokens[_mon] = true;
        acceptedTokens[_wmon] = true;
        acceptedTokens[_shMonad] = true;
    }

    // ========================================================================
    // SKIP MECHANICS (with Delegation & Multi-Token Support)
    // ========================================================================

    /**
     * @dev Skip a guide for a specific user (delegation support)
     * @param beneficiary Address that will have skip recorded
     * @param guideFid Farcaster ID of guide being skipped
     * @param paymentToken Token to use for payment (MON/WMON/shMONAD)
     */
    function skipGuideFor(
        address beneficiary,
        uint256 guideFid,
        address paymentToken
    ) public nonReentrant {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(guideFid > 0, "Invalid guide FID");
        require(acceptedTokens[paymentToken], "Token not accepted");

        UserStats storage stats = userStats[beneficiary];
        stats.skipCount++;

        uint256 cost = 0;

        // After 10 free skips, charge 0.01 MON
        if (stats.skipCount > FREE_SKIP_LIMIT) {
            cost = SKIP_COST;

            // Transfer token from caller (could be Safe account) to platform
            require(
                IERC20(paymentToken).transferFrom(msg.sender, platformWallet, cost),
                "Skip payment failed"
            );

            stats.totalSpent += cost;
        }

        stats.lastSkipAt = block.timestamp;

        emit GuideSkipped(beneficiary, guideFid, stats.skipCount, cost, paymentToken, block.timestamp);
    }

    /**
     * @dev Skip a guide (self)
     * @param guideFid Farcaster ID of guide being skipped
     * @param paymentToken Token to use for payment
     */
    function skipGuide(uint256 guideFid, address paymentToken) external {
        skipGuideFor(msg.sender, guideFid, paymentToken);
    }

    // ========================================================================
    // MATCH MECHANICS (with Delegation & Multi-Token Support)
    // ========================================================================

    /**
     * @dev Match with a guide for a specific user (delegation support)
     * @param beneficiary Address that will own the match
     * @param userFid Beneficiary's Farcaster ID
     * @param guideFid Guide's Farcaster ID
     * @param guideAddress Guide's verified Farcaster address (from Neynar)
     * @param guideName Guide's display name (for records)
     * @param paymentToken Token to use for payment (MON/WMON/shMONAD)
     */
    function matchWithGuideFor(
        address beneficiary,
        uint256 userFid,
        uint256 guideFid,
        address guideAddress,
        string memory guideName,
        address paymentToken
    ) public nonReentrant returns (uint256 matchId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(userFid > 0, "Valid user FID required");
        require(guideFid > 0, "Valid guide FID required");
        require(guideAddress != address(0), "Invalid guide address");
        require(acceptedTokens[paymentToken], "Token not accepted");

        // Calculate split
        uint256 guideEarning = (MATCH_COST * GUIDE_PERCENTAGE) / 100; // 7 MON
        uint256 platformFee = MATCH_COST - guideEarning; // 3 MON

        IERC20 token = IERC20(paymentToken);

        // Transfer payment from caller to guide's verified address
        require(
            token.transferFrom(msg.sender, guideAddress, guideEarning),
            "Guide payment failed"
        );
        require(
            token.transferFrom(msg.sender, platformWallet, platformFee),
            "Platform payment failed"
        );

        // Create match
        matchId = _matchIdCounter++;

        matches[matchId] = Match({
            id: matchId,
            user: beneficiary,
            userFid: userFid,
            guideFid: guideFid,
            guideAddress: guideAddress,
            guideName: guideName,
            amount: MATCH_COST,
            guideEarnings: guideEarning,
            platformFee: platformFee,
            paymentToken: paymentToken,
            matchedAt: block.timestamp,
            isActive: true
        });

        // Track matches
        userMatches[beneficiary].push(matchId);
        guideFidMatches[guideFid].push(matchId);

        // Update stats
        UserStats storage userStat = userStats[beneficiary];
        userStat.matchCount++;
        userStat.totalSpent += MATCH_COST;

        GuideEarnings storage earnings = guideEarnings[guideAddress];
        earnings.totalMatches++;
        earnings.totalEarnings += guideEarning;

        emit MatchCreated(
            matchId,
            beneficiary,
            guideFid,
            guideAddress,
            guideName,
            MATCH_COST,
            guideEarning,
            platformFee,
            paymentToken,
            block.timestamp
        );

        return matchId;
    }

    /**
     * @dev Match with a guide (self)
     * @param userFid User's Farcaster ID
     * @param guideFid Guide's Farcaster ID
     * @param guideAddress Guide's verified address from Farcaster
     * @param guideName Guide's display name
     * @param paymentToken Token to use for payment
     */
    function matchWithGuide(
        uint256 userFid,
        uint256 guideFid,
        address guideAddress,
        string memory guideName,
        address paymentToken
    ) external returns (uint256) {
        return matchWithGuideFor(msg.sender, userFid, guideFid, guideAddress, guideName, paymentToken);
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    function getUserStats(address user) external view returns (UserStats memory) {
        return userStats[user];
    }

    function getMatch(uint256 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function getUserMatches(address user) external view returns (uint256[] memory) {
        return userMatches[user];
    }

    function getGuideFidMatches(uint256 guideFid) external view returns (uint256[] memory) {
        return guideFidMatches[guideFid];
    }

    function getGuideEarnings(address guideAddress) external view returns (GuideEarnings memory) {
        return guideEarnings[guideAddress];
    }

    function getSkipCost(address user) external view returns (uint256) {
        uint256 skipCount = userStats[user].skipCount;
        return skipCount >= FREE_SKIP_LIMIT ? SKIP_COST : 0;
    }

    function getRemainingFreeSkips(address user) external view returns (uint256) {
        uint256 skipCount = userStats[user].skipCount;
        return skipCount >= FREE_SKIP_LIMIT ? 0 : FREE_SKIP_LIMIT - skipCount;
    }

    function getTotalMatches() external view returns (uint256) {
        return _matchIdCounter;
    }

    function isTokenAccepted(address token) external view returns (bool) {
        return acceptedTokens[token];
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    function setPlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");
        address oldWallet = platformWallet;
        platformWallet = newWallet;
        emit PlatformWalletUpdated(oldWallet, newWallet);
    }

    function setMonToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid token");
        acceptedTokens[address(mon)] = false;
        mon = IERC20(newToken);
        acceptedTokens[newToken] = true;
        emit TokenUpdated("MON", newToken);
    }

    function setWMonToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid token");
        acceptedTokens[address(wmon)] = false;
        wmon = IERC20(newToken);
        acceptedTokens[newToken] = true;
        emit TokenUpdated("WMON", newToken);
    }

    function setShMonadToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid token");
        acceptedTokens[address(shMonad)] = false;
        shMonad = IERC20(newToken);
        acceptedTokens[newToken] = true;
        emit TokenUpdated("shMONAD", newToken);
    }

    function addAcceptedToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        acceptedTokens[token] = true;
    }

    function removeAcceptedToken(address token) external onlyOwner {
        acceptedTokens[token] = false;
    }

    function withdrawStuckTokens(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "Transfer failed");
    }
}
