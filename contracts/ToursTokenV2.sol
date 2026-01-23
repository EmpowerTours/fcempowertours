// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ToursTokenV2 (TOURS)
 * @notice EmpowerTours reward token used for:
 * - NFT staking rewards
 * - NFT burn rewards
 * - Music subscription anti-bot stakes
 * - Platform governance and incentives
 *
 * @dev V2 Changes:
 * - Added DAO timelock support for future governance
 * - Added authorized minters for controlled token distribution
 * - Added pause functionality for emergencies
 */
contract ToursTokenV2 is ERC20, Ownable {

    // Maximum supply: 100 billion TOURS
    uint256 public constant MAX_SUPPLY = 100_000_000_000 ether;

    // DAO Timelock for governance actions
    address public daoTimelock;

    // Authorized minters (contracts that can mint: NFT staking, LiveRadio rewards, etc.)
    mapping(address => bool) public authorizedMinters;

    // Pause state for emergencies
    bool public paused;

    // ============================================
    // Events
    // ============================================
    event TokensMinted(address indexed to, uint256 amount, address indexed minter);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============================================
    // Modifiers
    // ============================================
    modifier onlyAuthorizedMinter() {
        require(
            authorizedMinters[msg.sender] || msg.sender == owner(),
            "Not authorized to mint"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Token is paused");
        _;
    }

    modifier onlyOwnerOrDAO() {
        require(
            msg.sender == owner() || msg.sender == daoTimelock,
            "Only owner or DAO"
        );
        _;
    }

    constructor() ERC20("EmpowerTours Token V2", "TOURS") Ownable(msg.sender) {
        // Mint initial supply to deployer
        // Can distribute to:
        // - NFT contract for staking/burn rewards
        // - Treasury for platform operations
        // - Liquidity pools
        _mint(msg.sender, MAX_SUPPLY);
    }

    // ============================================
    // Minting Functions
    // ============================================

    /**
     * @notice Mint additional TOURS tokens (only if under max supply)
     * @dev Can be called by owner or authorized minter contracts
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyAuthorizedMinter whenNotPaused {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount, msg.sender);
    }

    /**
     * @notice Burn tokens from caller's balance
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @notice Burn tokens from specified address (requires allowance)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }

    // ============================================
    // Admin Functions
    // ============================================

    /**
     * @notice Set DAO timelock address for future governance
     * @param _daoTimelock Address of the DAO timelock contract
     */
    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address oldTimelock = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(oldTimelock, _daoTimelock);
    }

    /**
     * @notice Add or remove an authorized minter
     * @param minter Address to authorize/deauthorize
     * @param authorized Whether the address can mint
     */
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwnerOrDAO {
        authorizedMinters[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    /**
     * @notice Pause token transfers and minting (emergency only)
     */
    function pause() external onlyOwnerOrDAO {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause token transfers and minting
     */
    function unpause() external onlyOwnerOrDAO {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ============================================
    // Transfer Override (for pause functionality)
    // ============================================

    function _update(address from, address to, uint256 value) internal override {
        // Allow burns even when paused
        if (to != address(0)) {
            require(!paused, "Token transfers paused");
        }
        super._update(from, to, value);
    }
}
