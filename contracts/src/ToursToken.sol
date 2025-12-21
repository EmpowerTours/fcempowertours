// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ToursToken (TOURS)
 * @notice EmpowerTours reward token used for:
 * - NFT staking rewards
 * - NFT burn rewards
 * - Music subscription anti-bot stakes
 * - Platform governance and incentives
 */
contract ToursToken is ERC20, Ownable {

    // Maximum supply: 1 billion TOURS
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    event TokensMinted(address indexed to, uint256 amount);

    constructor() ERC20("EmpowerTours Token", "TOURS") Ownable(msg.sender) {
        // Mint initial supply to deployer
        // Can distribute to:
        // - NFT contract for staking/burn rewards
        // - Treasury for platform operations
        // - Liquidity pools
        _mint(msg.sender, MAX_SUPPLY);
    }

    /**
     * @notice Mint additional TOURS tokens (only if under max supply)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount);
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
}
