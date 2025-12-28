// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IWMON is IERC20 {
    function deposit() external payable;
}

/**
 * @title WMONFaucet
 * @notice Testnet faucet for WMON - gives users tokens to test EmpowerTours
 * @dev Rate limited by both wallet address AND Farcaster FID (anti-cheat)
 */
contract WMONFaucet is Ownable {
    using SafeERC20 for IERC20;

    IWMON public immutable wmon;

    uint256 public claimAmount = 20 ether;  // 20 WMON per claim
    uint256 public cooldownPeriod = 24 hours;

    // Track last claim time by wallet address
    mapping(address => uint256) public lastClaimByWallet;

    // Track last claim time by FID
    mapping(uint256 => uint256) public lastClaimByFid;

    // Track which FID claimed with which wallet (audit trail)
    mapping(address => uint256) public walletToFid;
    mapping(uint256 => address) public fidToWallet;

    event Claimed(address indexed user, uint256 indexed fid, uint256 amount, uint256 timestamp);
    event ClaimAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event FaucetFunded(address indexed funder, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    error AlreadyClaimedWallet(uint256 timeRemaining);
    error AlreadyClaimedFid(uint256 timeRemaining);
    error FaucetEmpty();
    error InvalidFid();

    constructor(address _wmon) Ownable(msg.sender) {
        wmon = IWMON(_wmon);
    }

    /**
     * @notice Claim WMON from faucet
     * @param fid User's Farcaster ID (for rate limiting)
     */
    function claim(uint256 fid) external {
        if (fid == 0) revert InvalidFid();

        // Check wallet cooldown
        uint256 walletLastClaim = lastClaimByWallet[msg.sender];
        if (walletLastClaim > 0) {
            uint256 walletTimeSince = block.timestamp - walletLastClaim;
            if (walletTimeSince < cooldownPeriod) {
                revert AlreadyClaimedWallet(cooldownPeriod - walletTimeSince);
            }
        }

        // Check FID cooldown
        uint256 fidLastClaim = lastClaimByFid[fid];
        if (fidLastClaim > 0) {
            uint256 fidTimeSince = block.timestamp - fidLastClaim;
            if (fidTimeSince < cooldownPeriod) {
                revert AlreadyClaimedFid(cooldownPeriod - fidTimeSince);
            }
        }

        // Check faucet balance
        uint256 balance = wmon.balanceOf(address(this));
        if (balance < claimAmount) revert FaucetEmpty();

        // Update claim timestamps
        lastClaimByWallet[msg.sender] = block.timestamp;
        lastClaimByFid[fid] = block.timestamp;

        // Track wallet <-> FID link
        walletToFid[msg.sender] = fid;
        fidToWallet[fid] = msg.sender;

        // Transfer WMON to user
        wmon.transfer(msg.sender, claimAmount);

        emit Claimed(msg.sender, fid, claimAmount, block.timestamp);
    }

    /**
     * @notice Check if user can claim
     * @param user Wallet address
     * @param fid Farcaster ID
     * @return canClaim_ Whether user can claim
     * @return walletCooldown Seconds remaining for wallet cooldown (0 if can claim)
     * @return fidCooldown Seconds remaining for FID cooldown (0 if can claim)
     */
    function canClaim(address user, uint256 fid) external view returns (
        bool canClaim_,
        uint256 walletCooldown,
        uint256 fidCooldown
    ) {
        // Check wallet
        uint256 walletLastClaim = lastClaimByWallet[user];
        if (walletLastClaim > 0) {
            uint256 walletTimeSince = block.timestamp - walletLastClaim;
            if (walletTimeSince < cooldownPeriod) {
                walletCooldown = cooldownPeriod - walletTimeSince;
            }
        }

        // Check FID
        uint256 fidLastClaim = lastClaimByFid[fid];
        if (fidLastClaim > 0) {
            uint256 fidTimeSince = block.timestamp - fidLastClaim;
            if (fidTimeSince < cooldownPeriod) {
                fidCooldown = cooldownPeriod - fidTimeSince;
            }
        }

        canClaim_ = (walletCooldown == 0 && fidCooldown == 0);
    }

    /**
     * @notice Get faucet WMON balance
     */
    function faucetBalance() external view returns (uint256) {
        return wmon.balanceOf(address(this));
    }

    /**
     * @notice Fund faucet with MON (auto-wraps to WMON)
     */
    function fundWithMON() external payable {
        require(msg.value > 0, "Must send MON");
        wmon.deposit{value: msg.value}();
        emit FaucetFunded(msg.sender, msg.value);
    }

    /**
     * @notice Fund faucet with WMON directly
     */
    function fundWithWMON(uint256 amount) external {
        wmon.transferFrom(msg.sender, address(this), amount);
        emit FaucetFunded(msg.sender, amount);
    }

    // ============ Admin Functions ============

    function setClaimAmount(uint256 _amount) external onlyOwner {
        emit ClaimAmountUpdated(claimAmount, _amount);
        claimAmount = _amount;
    }

    function setCooldownPeriod(uint256 _period) external onlyOwner {
        emit CooldownUpdated(cooldownPeriod, _period);
        cooldownPeriod = _period;
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = wmon.balanceOf(address(this));
        wmon.transfer(owner(), balance);
        emit EmergencyWithdraw(owner(), balance);
    }

    // Accept MON deposits and auto-wrap
    receive() external payable {
        wmon.deposit{value: msg.value}();
        emit FaucetFunded(msg.sender, msg.value);
    }
}
